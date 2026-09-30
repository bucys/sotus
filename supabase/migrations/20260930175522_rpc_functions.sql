-- Sotus RPC functions (spec 0003): the only way to write attempts and recipes.
-- All are SECURITY DEFINER with an empty search_path, callable by authenticated only.
-- Errors are raised as the listed text; src/lib/ai/attempt-reasons.ts maps them.

-- Reserve quota before any fetch or model call. The advisory lock makes the count and the
-- insert one step, so concurrent calls cannot overshoot a limit.
create function public.reserve_ai_attempt(p_kind public.ai_attempt_kind, p_source_url text)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_url text := btrim(p_source_url, E' \t\r\n');
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_user_extractions integer;
  v_user_cook_picks integer;
  v_total integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_kind = 'cook_pick' then
    if p_source_url is not null then
      raise exception 'invalid_source_url';
    end if;
    v_url := null;
  elsif v_url is null or v_url = '' or octet_length(v_url) > 2048 then
    raise exception 'invalid_source_url';
  elsif p_kind = 'extract_youtube' and private.youtube_video_id(v_url) is null then
    raise exception 'invalid_source_url';
  elsif p_kind = 'extract_web' and not private.is_valid_web_url(v_url) then
    raise exception 'invalid_source_url';
  end if;

  perform pg_advisory_xact_lock(hashtext('reserve_ai_attempt'));

  select
    count(*) filter (where user_id = v_uid and kind in ('extract_web', 'extract_youtube')),
    count(*) filter (where user_id = v_uid and kind = 'cook_pick'),
    count(*)
  into v_user_extractions, v_user_cook_picks, v_total
  from public.ai_attempts
  where created_at >= v_day_start;

  if v_total >= 300
    or (p_kind = 'cook_pick' and v_user_cook_picks >= 30)
    or (p_kind <> 'cook_pick' and v_user_extractions >= 20)
  then
    raise exception 'quota_exceeded';
  end if;

  insert into public.ai_attempts (user_id, kind, source_url)
  values (v_uid, p_kind, v_url)
  returning id into v_id;

  return v_id;
end;
$$;

-- 'recipe' is never set here: only save_recipe can, so a recipe outcome always has a recipe.
create function public.finish_ai_attempt(
  p_attempt_id uuid,
  p_outcome public.ai_attempt_outcome,
  p_reason text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_outcome in ('started', 'recipe') then
    raise exception 'invalid_outcome';
  end if;

  if char_length(p_reason) > 60 or p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'invalid_arguments';
  end if;

  update public.ai_attempts
  set outcome = p_outcome,
      reason = p_reason,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      finished_at = clock_timestamp()
  where id = p_attempt_id
    and user_id = v_uid
    and outcome = 'started';

  if not found then
    raise exception 'attempt_not_found';
  end if;
end;
$$;

-- Publishes a recipe into the shared library, or links the caller to the one already there.
-- The payload must carry an HMAC made by the Sotus server over this attempt and user, so a
-- recipe can only come from Sotus's own extraction.
create function public.save_recipe(
  p_attempt_id uuid,
  p_payload text,
  p_signature text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns table (out_recipe_id uuid, out_created boolean)
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_secret text;
  v_expected text;
  v_attempt record;
  v_kind public.source_kind;
  v_payload jsonb;
  v_title text;
  v_method text;
  v_page_url text;
  v_source_title text;
  v_channel_title text;
  v_names text[] := '{}';
  v_quantities text[] := '{}';
  v_units text[] := '{}';
  v_steps text[] := '{}';
  v_item jsonb;
  v_text text;
  v_recipe_id uuid;
  v_created boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- 1. Signature first, before anything is read from the payload.
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'recipe_publish_secret';

  if v_secret is null then
    raise exception 'publish_not_configured';
  end if;

  v_expected := encode(
    extensions.hmac(
      convert_to(p_attempt_id::text || ':' || v_uid::text || ':' || p_payload, 'UTF8'),
      convert_to(v_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Both sides are hashed again so the comparison does not leak where they first differ.
  if p_signature is null
    or v_expected is null
    or extensions.hmac(convert_to(p_signature, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256')
       is distinct from
       extensions.hmac(convert_to(v_expected, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256')
  then
    raise exception 'invalid_signature';
  end if;

  if p_input_tokens is null or p_output_tokens is null or p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'invalid_arguments';
  end if;

  -- 2. Lock the caller's own open extraction attempt.
  select id, kind, source_url into v_attempt
  from public.ai_attempts
  where id = p_attempt_id
    and user_id = v_uid
    and outcome = 'started'
    and kind in ('extract_web', 'extract_youtube')
  for update;

  if not found then
    raise exception 'attempt_not_found';
  end if;

  v_kind := case v_attempt.kind when 'extract_web' then 'web' else 'youtube' end;

  -- 3. Parse and validate. Only the listed fields are read; attribution and source come
  -- from auth.uid() and the attempt, never from the payload.
  begin
    v_payload := p_payload::jsonb;
  exception when others then
    raise exception 'invalid_recipe';
  end;

  if jsonb_typeof(v_payload) <> 'object'
    or jsonb_typeof(v_payload -> 'title') is distinct from 'string'
    or jsonb_typeof(v_payload -> 'extraction_method') is distinct from 'string'
    or jsonb_typeof(v_payload -> 'ingredients') is distinct from 'array'
    or jsonb_typeof(v_payload -> 'steps') is distinct from 'array'
    or coalesce(jsonb_typeof(v_payload -> 'recipe_page_url'), 'null') not in ('null', 'string')
    or coalesce(jsonb_typeof(v_payload -> 'source_title'), 'null') not in ('null', 'string')
    or coalesce(jsonb_typeof(v_payload -> 'source_channel_title'), 'null') not in ('null', 'string')
  then
    raise exception 'invalid_recipe';
  end if;

  v_title := btrim(v_payload ->> 'title');
  if char_length(v_title) not between 1 and 120 or v_title !~ '\S' then
    raise exception 'invalid_recipe';
  end if;

  v_method := v_payload ->> 'extraction_method';
  if v_kind = 'web' and v_method not in ('web_jsonld', 'web_model') then
    raise exception 'invalid_recipe';
  elsif v_kind = 'youtube'
    and v_method not in ('youtube_recipe_page_jsonld', 'youtube_description', 'youtube_transcript')
  then
    raise exception 'invalid_recipe';
  end if;

  v_page_url := nullif(btrim(v_payload ->> 'recipe_page_url'), '');
  if (v_method = 'youtube_recipe_page_jsonld') <> (v_page_url is not null) then
    raise exception 'invalid_recipe';
  end if;
  if v_page_url is not null and (v_page_url !~ '^https?://' or octet_length(v_page_url) > 2048) then
    raise exception 'invalid_recipe';
  end if;

  v_source_title := nullif(btrim(v_payload ->> 'source_title'), '');
  if char_length(v_source_title) > 300 then
    raise exception 'invalid_recipe';
  end if;

  v_channel_title := nullif(btrim(v_payload ->> 'source_channel_title'), '');
  if jsonb_typeof(v_payload -> 'source_channel_title') = 'string' and v_kind = 'web' then
    raise exception 'invalid_recipe';
  end if;
  if char_length(v_channel_title) > 300 then
    raise exception 'invalid_recipe';
  end if;

  if jsonb_array_length(v_payload -> 'ingredients') not between 2 and 60
    or jsonb_array_length(v_payload -> 'steps') not between 1 and 40
  then
    raise exception 'invalid_recipe';
  end if;

  for v_item in select value from jsonb_array_elements(v_payload -> 'ingredients') loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'name') is distinct from 'string'
      or coalesce(jsonb_typeof(v_item -> 'quantity'), 'null') not in ('null', 'string')
      or coalesce(jsonb_typeof(v_item -> 'unit'), 'null') not in ('null', 'string')
    then
      raise exception 'invalid_recipe';
    end if;

    v_text := btrim(v_item ->> 'name');
    if char_length(v_text) not between 1 and 120 or v_text !~ '\S' then
      raise exception 'invalid_recipe';
    end if;
    v_names := v_names || v_text;

    v_text := nullif(btrim(v_item ->> 'quantity'), '');
    if char_length(v_text) > 40 then
      raise exception 'invalid_recipe';
    end if;
    v_quantities := v_quantities || v_text;

    v_text := nullif(btrim(v_item ->> 'unit'), '');
    if char_length(v_text) > 20 then
      raise exception 'invalid_recipe';
    end if;
    v_units := v_units || v_text;
  end loop;

  for v_item in select value from jsonb_array_elements(v_payload -> 'steps') loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'invalid_recipe';
    end if;

    v_text := btrim(v_item #>> '{}');
    if char_length(v_text) not between 1 and 1000 or v_text !~ '\S' then
      raise exception 'invalid_recipe';
    end if;
    v_steps := v_steps || v_text;
  end loop;

  -- 4. Insert. A key that already exists (including a concurrent winner, which this
  -- insert waits for) means the recipe is already in the library.
  insert into public.recipes (
    added_by, source_kind, source_url, title, extraction_method, recipe_page_url,
    source_title, source_channel_title, source_metadata_fetched_at
  )
  values (
    v_uid, v_kind, v_attempt.source_url, v_title, v_method::public.extraction_method, v_page_url,
    v_source_title, v_channel_title,
    case when v_kind = 'youtube' then clock_timestamp() end
  )
  on conflict do nothing
  returning id into v_recipe_id;

  v_created := v_recipe_id is not null;

  if v_created then
    insert into public.recipe_ingredients (recipe_id, position, name, quantity, unit)
    select v_recipe_id, t.pos, t.name, t.quantity, t.unit
    from unnest(v_names, v_quantities, v_units) with ordinality as t(name, quantity, unit, pos);

    insert into public.recipe_steps (recipe_id, position, body)
    select v_recipe_id, t.pos, t.body
    from unnest(v_steps) with ordinality as t(body, pos);
  elsif v_kind = 'web' then
    select id into v_recipe_id from public.recipes
    where source_url_key = private.web_url_key(v_attempt.source_url);
  else
    select id into v_recipe_id from public.recipes
    where youtube_video_id = private.youtube_video_id(v_attempt.source_url);
  end if;

  if v_recipe_id is null then
    raise exception 'recipe_not_resolved';
  end if;

  insert into public.saved_recipes (user_id, recipe_id)
  values (v_uid, v_recipe_id)
  on conflict do nothing;

  update public.ai_attempts
  set outcome = 'recipe',
      reason = case when v_created then null else 'already_saved' end,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      recipe_id = v_recipe_id,
      finished_at = clock_timestamp()
  where id = p_attempt_id;

  return query select v_recipe_id, v_created;
end;
$$;

-- Called before reserve_ai_attempt so a link already in the library costs no quota.
-- Needs no signature: it only links an existing recipe to the caller.
create function public.open_existing_recipe(p_kind public.source_kind, p_source_url text)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_url text := btrim(p_source_url, E' \t\r\n');
  v_recipe_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_kind = 'web' then
    if not private.is_valid_web_url(v_url) then
      return null;
    end if;
    select id into v_recipe_id from public.recipes
    where source_url_key = private.web_url_key(v_url);
  else
    select id into v_recipe_id from public.recipes
    where youtube_video_id = private.youtube_video_id(v_url);
  end if;

  if v_recipe_id is null then
    return null;
  end if;

  insert into public.saved_recipes (user_id, recipe_id)
  values (v_uid, v_recipe_id)
  on conflict do nothing;

  return v_recipe_id;
end;
$$;

revoke execute on function public.reserve_ai_attempt(public.ai_attempt_kind, text) from public, anon, authenticated;
revoke execute on function public.finish_ai_attempt(uuid, public.ai_attempt_outcome, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.save_recipe(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.open_existing_recipe(public.source_kind, text) from public, anon, authenticated;

grant execute on function public.reserve_ai_attempt(public.ai_attempt_kind, text) to authenticated;
grant execute on function public.finish_ai_attempt(uuid, public.ai_attempt_outcome, text, integer, integer) to authenticated;
grant execute on function public.save_recipe(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.open_existing_recipe(public.source_kind, text) to authenticated;
