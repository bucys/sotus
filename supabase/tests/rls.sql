-- Proves spec 0003 (AC-1 to AC-15) against the linked project, as two users and as anon.
--
-- Run:  supabase db query --linked -f supabase/tests/rls.sql
-- Needs the Vault secret `recipe_publish_secret` (see spec 0003, Configuration required).
-- Run it when today's app wide attempt count is under 270: the quota scenario adds 21.
--
-- Everything happens in one transaction that ends in a rollback. A failed check raises
-- `FAIL: ...` and stops the script. The last statement runs after the rollback and must
-- show zero leftover rows and the PASS line.

begin;

-- Helpers (temporary, gone with the session) ------------------------------------------

create function pg_temp.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', msg;
  end if;
end;
$$;

create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end;
$$;

create function pg_temp.as_role(role_name text) returns void
language plpgsql as $$
begin
  execute format('set local role %I', role_name);
end;
$$;

create function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Runs one statement and requires it to fail with a message containing `expected`.
-- The statement runs in a subtransaction, so a failure also proves nothing was written.
create function pg_temp.expect_error(stmt text, expected text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(expected in sqlerrm) = 0 then
      raise exception 'FAIL: expected "%" but got "%" for: %', expected, sqlerrm, stmt;
    end if;
    return;
  end;
  raise exception 'FAIL: expected "%" but the statement succeeded: %', expected, stmt;
end;
$$;

create function pg_temp.sign(attempt uuid, uid uuid, payload text) returns text
language plpgsql security definer as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'recipe_publish_secret';
  return encode(
    extensions.hmac(convert_to(attempt::text || ':' || uid::text || ':' || payload, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'),
    'hex'
  );
end;
$$;

create function pg_temp.reserve(uid uuid, kind public.ai_attempt_kind, url text) returns uuid
language plpgsql as $$
declare
  attempt uuid;
begin
  perform pg_temp.as_user(uid);
  attempt := public.reserve_ai_attempt(kind, url);
  perform pg_temp.as_admin();
  return attempt;
end;
$$;

create function pg_temp.save(uid uuid, attempt uuid, payload text) returns table (rid uuid, created boolean)
language plpgsql as $$
declare
  sig text := pg_temp.sign(attempt, uid, payload);
begin
  perform pg_temp.as_user(uid);
  select s.out_recipe_id, s.out_created into rid, created
  from public.save_recipe(attempt, payload, sig, 10, 20) as s;
  perform pg_temp.as_admin();
  return next;
end;
$$;

create function pg_temp.rename_secret(from_name text, to_name text) returns void
language plpgsql as $$
begin
  perform pg_temp.as_role('postgres');
  perform vault.update_secret((select id from vault.decrypted_secrets where name = from_name), null, to_name);
  perform pg_temp.as_admin();
end;
$$;

create function pg_temp.save_call(attempt uuid, uid uuid, payload text, sig text) returns text
language sql as $$
  select format('select * from public.save_recipe(%L::uuid, %L, %L, 0, 0)', attempt, payload, sig);
$$;

create function pg_temp.web_payload(title text default 'Test pasta') returns jsonb
language sql as $$
  select jsonb_build_object(
    'title', title,
    'extraction_method', 'web_jsonld',
    'ingredients', jsonb_build_array(
      jsonb_build_object('name', 'Spaghetti', 'quantity', '200', 'unit', 'g'),
      jsonb_build_object('name', 'Salt')
    ),
    'steps', jsonb_build_array('Boil the water.', 'Cook the pasta.')
  );
$$;

create function pg_temp.yt_payload() returns jsonb
language sql as $$
  select jsonb_build_object(
    'title', 'Video pasta',
    'extraction_method', 'youtube_description',
    'source_title', 'How to cook pasta',
    'source_channel_title', 'Test channel',
    'ingredients', jsonb_build_array(
      jsonb_build_object('name', 'Spaghetti', 'quantity', '1 1/2', 'unit', 'cups'),
      jsonb_build_object('name', 'Olive oil')
    ),
    'steps', jsonb_build_array('Boil.', 'Serve.')
  );
$$;

grant execute on all functions in schema pg_temp to public;

-- Fixtures ----------------------------------------------------------------------------
-- A and B are the two users. Q runs the quota scenario, D is deleted at the end.

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.ai_attempts where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc') < 270,
    'precondition: today''s app wide attempt count must be under 270'
  );
  perform pg_temp.ok(exists (select 1 from vault.decrypted_secrets where name = 'recipe_publish_secret'),
    'precondition: Vault secret recipe_publish_secret must exist');

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-a@sotus.invalid',
      '{"full_name":"Alice Cook","name":"ignored","avatar_url":"https://lh3.rls-test.invalid/a.png"}'),
    ('b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-b@sotus.invalid',
      '{"name":"Bob"}'),
    ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-q@sotus.invalid', '{}'),
    ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-d@sotus.invalid', '{"full_name":"Dee"}');
end $$;

-- AC-1, AC-2, AC-14: happy path --------------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  att uuid;
  r record;
  rec public.recipes;
  att_row public.ai_attempts;
begin
  att := pg_temp.reserve(a, 'extract_web', '  https://rls-test.invalid/pasta  ');
  perform pg_temp.ok((select source_url from public.ai_attempts where id = att) = 'https://rls-test.invalid/pasta',
    'AC-10 reserve trims the URL');

  select * into r from pg_temp.save(a, att, pg_temp.web_payload('Pasta')::text);
  perform pg_temp.ok(r.created, 'AC-1 returns created = true');

  select * into rec from public.recipes where id = r.rid;
  perform pg_temp.ok(rec.added_by = a and rec.source_kind = 'web' and rec.title = 'Pasta'
    and rec.source_url = 'https://rls-test.invalid/pasta' and rec.extraction_method = 'web_jsonld',
    'AC-2 added_by, source_kind and source_url come from the caller and the attempt');
  perform pg_temp.ok(rec.source_url_key = 'https://rls-test.invalid/pasta' and rec.youtube_video_id is null,
    'AC-2 generated keys filled by the database');
  perform pg_temp.ok(rec.source_metadata_fetched_at is null, 'AC-14 web recipe has no metadata fetch time');

  perform pg_temp.ok((select array_agg(name order by position) from public.recipe_ingredients where recipe_id = r.rid) = array['Spaghetti', 'Salt']
    and (select quantity || unit from public.recipe_ingredients where recipe_id = r.rid and position = 1) = '200g'
    and (select quantity is null and unit is null from public.recipe_ingredients where recipe_id = r.rid and position = 2),
    'AC-1 ingredients in order with quantity and unit');
  perform pg_temp.ok((select array_agg(body order by position) from public.recipe_steps where recipe_id = r.rid) = array['Boil the water.', 'Cook the pasta.'],
    'AC-1 steps in order');
  perform pg_temp.ok(exists (select 1 from public.saved_recipes where user_id = a and recipe_id = r.rid), 'AC-1 importer has a save row');

  select * into att_row from public.ai_attempts where id = att;
  perform pg_temp.ok(att_row.outcome = 'recipe' and att_row.recipe_id = r.rid and att_row.reason is null
    and att_row.input_tokens = 10 and att_row.output_tokens = 20 and att_row.finished_at is not null,
    'AC-1 attempt finished as recipe with tokens and recipe_id');
end $$;

-- AC-3: signature --------------------------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  att uuid;
  p text := pg_temp.web_payload('Signed')::text;
  p2 text := pg_temp.web_payload('Other')::text;
  sig_a text;
begin
  att := pg_temp.reserve(a, 'extract_web', 'https://rls-test.invalid/sig');
  sig_a := pg_temp.sign(att, a, p);

  perform pg_temp.as_user(a);
  perform pg_temp.expect_error(pg_temp.save_call(att, a, p, 'deadbeef'), 'invalid_signature');
  perform pg_temp.expect_error(pg_temp.save_call(att, a, p, null), 'invalid_signature');
  perform pg_temp.expect_error(pg_temp.save_call(att, a, p, pg_temp.sign(att, b, p)), 'invalid_signature');
  perform pg_temp.expect_error(pg_temp.save_call(att, a, p, pg_temp.sign(att, a, p2)), 'invalid_signature');
  perform pg_temp.as_admin();

  perform pg_temp.rename_secret('recipe_publish_secret', 'recipe_publish_secret_off');
  perform pg_temp.as_user(a);
  perform pg_temp.expect_error(pg_temp.save_call(att, a, p, sig_a), 'publish_not_configured');
  perform pg_temp.as_admin();
  perform pg_temp.rename_secret('recipe_publish_secret_off', 'recipe_publish_secret');

  perform pg_temp.ok(not exists (select 1 from public.recipes where source_url = 'https://rls-test.invalid/sig'), 'AC-3 nothing written');
  perform pg_temp.ok((select outcome from public.ai_attempts where id = att) = 'started', 'AC-3 attempt stays started');

  -- a correct signature works on the same attempt, so the failures above were the signature
  perform pg_temp.ok((select created from pg_temp.save(a, att, p)), 'AC-3 correct signature is accepted');
end $$;

-- AC-2: the payload cannot set attribution or source -----------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  att uuid;
  r record;
  p text;
begin
  att := pg_temp.reserve(a, 'extract_web', 'https://rls-test.invalid/trust');
  p := (pg_temp.web_payload('Trust') || jsonb_build_object(
    'added_by', b, 'source_url', 'https://rls-test.invalid/other', 'source_kind', 'youtube',
    'id', gen_random_uuid(), 'created_at', '2000-01-01', 'source_url_key', 'x', 'youtube_video_id', 'rlstest0009'))::text;
  select * into r from pg_temp.save(a, att, p);
  perform pg_temp.ok((select added_by from public.recipes where id = r.rid) = a
    and (select source_url from public.recipes where id = r.rid) = 'https://rls-test.invalid/trust'
    and (select source_kind from public.recipes where id = r.rid) = 'web'
    and (select created_at from public.recipes where id = r.rid) > '2001-01-01',
    'AC-2 payload attribution and source fields are ignored');
end $$;

-- AC-3: invalid attempts, payloads and tokens -----------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  web_att uuid;
  yt_att uuid;
  cook_att uuid;
  done_att uuid;
  ghost_att uuid := gen_random_uuid();
  base jsonb := pg_temp.web_payload();
  yt jsonb := pg_temp.yt_payload();
  two_ing jsonb := pg_temp.web_payload() -> 'ingredients';
  c record;
  sig text;
begin
  web_att := pg_temp.reserve(a, 'extract_web', 'https://rls-test.invalid/invalid');
  yt_att := pg_temp.reserve(a, 'extract_youtube', 'https://www.youtube.com/watch?v=rlstest0002');
  cook_att := pg_temp.reserve(a, 'cook_pick', null);
  select id into done_att from public.ai_attempts where source_url = 'https://rls-test.invalid/pasta';

  for c in
    select * from (values
      (web_att, 'one ingredient', (base || jsonb_build_object('ingredients', jsonb_build_array(two_ing -> 0)))::text),
      (web_att, 'blank step', (base || jsonb_build_object('steps', jsonb_build_array('Boil.', '   ')))::text),
      (web_att, 'no steps', (base || jsonb_build_object('steps', '[]'::jsonb))::text),
      (web_att, 'ingredients as object', (base || jsonb_build_object('ingredients', jsonb_build_object('name', 'x')))::text),
      (web_att, 'ingredient not an object', (base || jsonb_build_object('ingredients', jsonb_build_array('Salt', 'Pepper')))::text),
      (web_att, 'blank ingredient name', (base || jsonb_build_object('ingredients', jsonb_build_array(jsonb_build_object('name', 'Salt'), jsonb_build_object('name', '  '))))::text),
      (web_att, 'quantity not a string', (base || jsonb_build_object('ingredients', jsonb_build_array(jsonb_build_object('name', 'Salt', 'quantity', 5), jsonb_build_object('name', 'Pepper'))))::text),
      (web_att, 'quantity over 40', (base || jsonb_build_object('ingredients', jsonb_build_array(jsonb_build_object('name', 'Salt', 'quantity', repeat('1', 41)), jsonb_build_object('name', 'Pepper'))))::text),
      (web_att, 'unit over 20', (base || jsonb_build_object('ingredients', jsonb_build_array(jsonb_build_object('name', 'Salt', 'unit', repeat('g', 21)), jsonb_build_object('name', 'Pepper'))))::text),
      (web_att, 'step not a string', (base || jsonb_build_object('steps', jsonb_build_array(1)))::text),
      (web_att, 'step over 1000', (base || jsonb_build_object('steps', jsonb_build_array(repeat('a', 1001))))::text),
      (web_att, 'blank title', (base || jsonb_build_object('title', '  '))::text),
      (web_att, 'title over 120', (base || jsonb_build_object('title', repeat('a', 121)))::text),
      (web_att, 'title not a string', (base || jsonb_build_object('title', 5))::text),
      (web_att, '61 ingredients', (base || jsonb_build_object('ingredients', (select jsonb_agg(jsonb_build_object('name', 'i' || g)) from generate_series(1, 61) as g)))::text),
      (web_att, '41 steps', (base || jsonb_build_object('steps', (select jsonb_agg('s' || g) from generate_series(1, 41) as g)))::text),
      (web_att, 'youtube method on web', (base || jsonb_build_object('extraction_method', 'youtube_description'))::text),
      (web_att, 'unknown method', (base || jsonb_build_object('extraction_method', 'nope'))::text),
      (web_att, 'channel title on web', (base || jsonb_build_object('source_channel_title', 'X'))::text),
      (web_att, 'page url on web', (base || jsonb_build_object('recipe_page_url', 'https://x.com/r'))::text),
      (web_att, 'source title over 300', (base || jsonb_build_object('source_title', repeat('a', 301)))::text),
      (web_att, 'payload is an array', '[]'),
      (web_att, 'payload is not json', 'not json'),
      (yt_att, 'web method on youtube', base::text),
      (yt_att, 'page method without a url', (yt || jsonb_build_object('extraction_method', 'youtube_recipe_page_jsonld'))::text),
      (yt_att, 'javascript page url', (yt || jsonb_build_object('extraction_method', 'youtube_recipe_page_jsonld', 'recipe_page_url', 'javascript:x'))::text),
      (yt_att, 'page url on description method', (yt || jsonb_build_object('recipe_page_url', 'https://x.com/r'))::text),
      (yt_att, 'channel title over 300', (yt || jsonb_build_object('source_channel_title', repeat('a', 301)))::text)
    ) as v(att, label, payload)
  loop
    sig := pg_temp.sign(c.att, a, c.payload);
    perform pg_temp.as_user(a);
    perform pg_temp.expect_error(pg_temp.save_call(c.att, a, c.payload, sig), 'invalid_recipe');
    perform pg_temp.as_admin();
  end loop;

  -- attempt problems: another user's attempt, a finished attempt, a cook pick attempt
  perform pg_temp.as_user(b);
  perform pg_temp.expect_error(pg_temp.save_call(web_att, b, base::text, pg_temp.sign(web_att, b, base::text)), 'attempt_not_found');
  perform pg_temp.as_user(a);
  perform pg_temp.expect_error(pg_temp.save_call(done_att, a, base::text, pg_temp.sign(done_att, a, base::text)), 'attempt_not_found');
  perform pg_temp.expect_error(pg_temp.save_call(cook_att, a, base::text, pg_temp.sign(cook_att, a, base::text)), 'attempt_not_found');
  perform pg_temp.expect_error(pg_temp.save_call(ghost_att, a, base::text, pg_temp.sign(ghost_att, a, base::text)), 'attempt_not_found');

  -- negative tokens
  perform pg_temp.expect_error(
    format('select * from public.save_recipe(%L::uuid, %L, %L, -1, 0)', web_att, base::text, pg_temp.sign(web_att, a, base::text)),
    'invalid_arguments');
  perform pg_temp.as_admin();

  perform pg_temp.ok(not exists (select 1 from public.recipes where source_url in ('https://rls-test.invalid/invalid', 'https://www.youtube.com/watch?v=rlstest0002')),
    'AC-3 nothing written');
  perform pg_temp.ok((select count(*) from public.ai_attempts where id in (web_att, yt_att, cook_att) and outcome = 'started') = 3,
    'AC-3 attempts stay started');
end $$;

-- AC-4, AC-14: duplicates -------------------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  original uuid;
  att uuid;
  r record;
begin
  select id into original from public.recipes where source_url_key = 'https://rls-test.invalid/pasta';

  att := pg_temp.reserve(b, 'extract_web', 'https://rls-test.invalid/pasta?utm_source=x');
  select * into r from pg_temp.save(b, att, pg_temp.web_payload('Different title')::text);
  perform pg_temp.ok(not r.created and r.rid = original, 'AC-4 duplicate link returns the existing recipe');
  perform pg_temp.ok((select count(*) from public.recipes where source_url_key = 'https://rls-test.invalid/pasta') = 1, 'AC-4 still one recipe');
  perform pg_temp.ok((select title from public.recipes where id = original) = 'Pasta', 'AC-4 existing content is unchanged');
  perform pg_temp.ok(exists (select 1 from public.saved_recipes where user_id = b and recipe_id = original), 'AC-4 duplicate importer has a save row');
  perform pg_temp.ok((select outcome || '/' || reason from public.ai_attempts where id = att) = 'recipe/already_saved'
    and (select recipe_id from public.ai_attempts where id = att) = original, 'AC-4 attempt finished as recipe / already_saved');

  -- A unsaves, then imports the same link again
  perform pg_temp.as_user(a);
  delete from public.saved_recipes where recipe_id = original;
  perform pg_temp.as_admin();
  att := pg_temp.reserve(a, 'extract_web', 'https://rls-test.invalid/pasta');
  select * into r from pg_temp.save(a, att, pg_temp.web_payload('Pasta again')::text);
  perform pg_temp.ok(not r.created and r.rid = original, 'AC-4 re-import by the adder returns the existing recipe');
  perform pg_temp.ok((select count(*) from public.saved_recipes where user_id = a and recipe_id = original) = 1, 'AC-4 adder has one save row again');

  -- a www link is a separate recipe (conservative keys)
  att := pg_temp.reserve(a, 'extract_web', 'https://www.rls-test.invalid/pasta');
  select * into r from pg_temp.save(a, att, pg_temp.web_payload('WWW pasta')::text);
  perform pg_temp.ok(r.created and r.rid <> original, 'AC-4 www link is kept distinct');

  -- YouTube: metadata time stored, second importer lands on the same recipe
  att := pg_temp.reserve(a, 'extract_youtube', 'https://www.youtube.com/watch?v=rlstest0003');
  select * into r from pg_temp.save(a, att, pg_temp.yt_payload()::text);
  perform pg_temp.ok(r.created, 'AC-1 youtube recipe created');
  perform pg_temp.ok((select source_metadata_fetched_at is not null and youtube_video_id = 'rlstest0003' and source_url_key is null
    and source_title = 'How to cook pasta' and source_channel_title = 'Test channel' from public.recipes where id = r.rid),
    'AC-14 youtube recipe stores the metadata fetch time and video id');
  att := pg_temp.reserve(b, 'extract_youtube', 'https://www.youtube.com/watch?v=rlstest0003');
  perform pg_temp.ok(not (select created from pg_temp.save(b, att, pg_temp.yt_payload()::text)), 'AC-4 youtube duplicate returns the existing recipe');
  perform pg_temp.ok((select count(*) from public.recipes where youtube_video_id = 'rlstest0003') = 1, 'AC-4 one youtube recipe');
end $$;

-- AC-5, AC-9: open_existing_recipe ----------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  trust uuid;
  attempts_before int;
  got uuid;
begin
  select id into trust from public.recipes where source_url = 'https://rls-test.invalid/trust';
  select count(*) into attempts_before from public.ai_attempts where user_id = b;

  perform pg_temp.as_user(b);
  got := public.open_existing_recipe('web', 'https://rls-test.invalid/trust?fbclid=zz#top');
  perform pg_temp.as_admin();
  perform pg_temp.ok(got = trust, 'AC-5 returns the existing recipe for an equal key');
  perform pg_temp.ok(exists (select 1 from public.saved_recipes where user_id = b and recipe_id = trust), 'AC-5 caller got a save row');
  perform pg_temp.ok((select count(*) from public.ai_attempts where user_id = b) = attempts_before, 'AC-5 no attempt row created');

  -- the adder while still saved keeps one row, and gets it back after unsaving
  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.open_existing_recipe('web', 'https://rls-test.invalid/trust') = trust, 'AC-5 adder lookup');
  perform pg_temp.ok((select count(*) from public.saved_recipes where user_id = a and recipe_id = trust) = 1, 'AC-5 still one row');
  delete from public.saved_recipes where recipe_id = trust;
  perform pg_temp.ok(not exists (select 1 from public.saved_recipes where recipe_id = trust), 'AC-9 adder can unsave');
  perform pg_temp.ok(public.open_existing_recipe('web', 'https://rls-test.invalid/trust') = trust, 'AC-5 adder lookup after unsave');
  perform pg_temp.ok(exists (select 1 from public.saved_recipes where user_id = a and recipe_id = trust), 'AC-5 adder save row is back');

  -- no match, invalid, youtube host on web
  perform pg_temp.ok(public.open_existing_recipe('web', 'https://rls-test.invalid/unknown') is null, 'AC-5 unknown link is null');
  perform pg_temp.ok(public.open_existing_recipe('web', 'https://user:pw@rls-test.invalid/trust') is null, 'AC-5 user info is null');
  perform pg_temp.ok(public.open_existing_recipe('web', 'ftp://rls-test.invalid/trust') is null, 'AC-5 ftp is null');
  perform pg_temp.ok(public.open_existing_recipe('web', null) is null, 'AC-5 null URL is null');
  perform pg_temp.ok(public.open_existing_recipe('web', 'https://www.youtube.com/watch?v=rlstest0003') is null, 'AC-5 web lookup with a youtube host is null');
  perform pg_temp.ok(public.open_existing_recipe('youtube', 'https://www.youtube.com/watch?v=rlstest0003&t=5') is null, 'AC-5 non canonical youtube URL is null');
  perform pg_temp.ok(public.open_existing_recipe('youtube', 'https://www.youtube.com/watch?v=rlstest0003') is not null, 'AC-5 youtube lookup');
  perform pg_temp.as_admin();
end $$;

-- AC-6, AC-9, AC-11: visibility -------------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  rid uuid;
  t text;
begin
  select id into rid from public.recipes where source_url_key = 'https://rls-test.invalid/pasta';

  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.recipes where id = rid) = 1, 'AC-6 B reads A''s recipe');
  perform pg_temp.ok((select count(*) from public.recipe_ingredients where recipe_id = rid) = 2, 'AC-6 B reads ingredients');
  perform pg_temp.ok((select count(*) from public.recipe_steps where recipe_id = rid) = 2, 'AC-6 B reads steps');
  perform pg_temp.ok((select display_name from public.profiles where id = a) = 'Alice Cook', 'AC-6 B reads A''s profile');
  perform pg_temp.ok((select count(*) from public.saved_recipes where user_id = a) = 0, 'AC-9 B sees none of A''s saves');
  perform pg_temp.ok((select count(*) from public.ai_attempts where user_id = a) = 0, 'AC-11 B sees none of A''s attempts');
  perform pg_temp.as_admin();

  perform pg_temp.as_anon();
  foreach t in array array['profiles', 'recipes', 'recipe_ingredients', 'recipe_steps', 'saved_recipes', 'ai_attempts', 'my_collection'] loop
    perform pg_temp.expect_error(format('select count(*) from public.%I', t), 'permission denied');
  end loop;
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('cook_pick', null)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.finish_ai_attempt(gen_random_uuid(), 'insufficient', null, 0, 0)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select * from public.save_recipe(gen_random_uuid(), '{}', 'x', 0, 0)$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.open_existing_recipe('web', 'https://rls-test.invalid/pasta')$q$, 'permission denied');
  perform pg_temp.as_admin();
end $$;

-- AC-7: canonical content is read only ------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  rid uuid;
  u uuid;
begin
  select id into rid from public.recipes where source_url_key = 'https://rls-test.invalid/pasta';

  foreach u in array array[a, b] loop
    perform pg_temp.as_user(u);
    perform pg_temp.expect_error(format('update public.recipes set title = %L where id = %L', 'Hacked', rid), 'permission denied for table recipes');
    perform pg_temp.expect_error(format('update public.recipes set added_by = %L where id = %L', u, rid), 'permission denied for table recipes');
    perform pg_temp.expect_error(format('delete from public.recipes where id = %L', rid), 'permission denied for table recipes');
    perform pg_temp.expect_error(format($q$insert into public.recipes (title, source_kind, source_url, extraction_method) values ('x', 'web', 'https://rls-test.invalid/direct', 'web_jsonld')$q$), 'permission denied for table recipes');
    perform pg_temp.expect_error(format('update public.recipe_ingredients set name = %L where recipe_id = %L', 'x', rid), 'permission denied for table recipe_ingredients');
    perform pg_temp.expect_error(format('delete from public.recipe_ingredients where recipe_id = %L', rid), 'permission denied for table recipe_ingredients');
    perform pg_temp.expect_error(format($q$insert into public.recipe_ingredients (recipe_id, position, name) values (%L, 9, 'x')$q$, rid), 'permission denied for table recipe_ingredients');
    perform pg_temp.expect_error(format('update public.recipe_steps set body = %L where recipe_id = %L', 'x', rid), 'permission denied for table recipe_steps');
    perform pg_temp.expect_error(format('delete from public.recipe_steps where recipe_id = %L', rid), 'permission denied for table recipe_steps');
    perform pg_temp.expect_error(format($q$insert into public.recipe_steps (recipe_id, position, body) values (%L, 9, 'x')$q$, rid), 'permission denied for table recipe_steps');
    perform pg_temp.expect_error(format($q$insert into public.profiles (id, display_name) values (gen_random_uuid(), 'x')$q$), 'permission denied for table profiles');
    perform pg_temp.expect_error(format('update public.profiles set display_name = %L where id = %L', 'x', u), 'permission denied for table profiles');
    perform pg_temp.expect_error(format('delete from public.profiles where id = %L', u), 'permission denied for table profiles');
    perform pg_temp.expect_error(format($q$insert into public.ai_attempts (user_id, kind) values (%L, 'cook_pick')$q$, u), 'permission denied for table ai_attempts');
    perform pg_temp.expect_error(format('update public.ai_attempts set outcome = %L where user_id = %L', 'recipe', u), 'permission denied for table ai_attempts');
    perform pg_temp.expect_error(format('delete from public.ai_attempts where user_id = %L', u), 'permission denied for table ai_attempts');
    perform pg_temp.expect_error(format('update public.saved_recipes set created_at = now() where user_id = %L', u), 'permission denied for table saved_recipes');
    perform pg_temp.as_admin();
  end loop;

  perform pg_temp.ok((select title from public.recipes where id = rid) = 'Pasta', 'AC-7 recipe unchanged');
end $$;

-- AC-8: updated_at --------------------------------------------------------------------

do $$
declare
  rid uuid;
  before_row public.recipes;
  after_title public.recipes;
  after_owner public.recipes;
begin
  select id into rid from public.recipes where source_url = 'https://rls-test.invalid/trust';
  select * into before_row from public.recipes where id = rid;

  perform pg_temp.as_role('postgres');
  update public.recipes set title = 'Trust renamed' where id = rid;
  perform pg_temp.as_admin();
  select * into after_title from public.recipes where id = rid;
  perform pg_temp.ok(after_title.updated_at > before_row.updated_at and after_title.created_at = before_row.created_at,
    'AC-8 a content change moves updated_at and not created_at');

  perform pg_temp.as_role('postgres');
  update public.recipes set added_by = null where id = rid;
  perform pg_temp.as_admin();
  select * into after_owner from public.recipes where id = rid;
  perform pg_temp.ok(after_owner.updated_at = after_title.updated_at and after_owner.added_by is null,
    'AC-8 changing added_by leaves updated_at alone');

  -- put the adder back for the collection scenario
  update public.recipes set added_by = 'a0000000-0000-0000-0000-000000000001' where id = rid;
end $$;

-- AC-9: collection -------------------------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  pasta uuid;
  att uuid;
  bobs uuid;
  expected uuid[];
  actual uuid[];
  a_view record;
  b_view record;
begin
  select id into pasta from public.recipes where source_url_key = 'https://rls-test.invalid/pasta';

  -- A unsaves the recipe A imported: gone from the collection, recipe and added_by stay
  perform pg_temp.as_user(a);
  delete from public.saved_recipes where recipe_id = pasta;
  perform pg_temp.ok(not exists (select 1 from public.my_collection where id = pasta), 'AC-9 unsaved recipe leaves A''s collection');
  perform pg_temp.as_admin();
  perform pg_temp.ok((select added_by from public.recipes where id = pasta) = a, 'AC-9 unsave leaves added_by');

  perform pg_temp.as_user(a);
  insert into public.saved_recipes (user_id, recipe_id) values (a, pasta);
  perform pg_temp.ok(exists (select 1 from public.my_collection where id = pasta), 'AC-9 A can save it again');
  perform pg_temp.expect_error(format('insert into public.saved_recipes (user_id, recipe_id) values (%L, %L)', b, pasta), 'row-level security');
  perform pg_temp.as_admin();

  -- B saves twice with on conflict do nothing: one row
  perform pg_temp.as_user(b);
  insert into public.saved_recipes (user_id, recipe_id) values (b, pasta) on conflict do nothing;
  insert into public.saved_recipes (user_id, recipe_id) values (b, pasta) on conflict do nothing;
  perform pg_temp.as_admin();
  perform pg_temp.ok((select count(*) from public.saved_recipes where user_id = b and recipe_id = pasta) = 1, 'AC-9 saving twice keeps one row');

  -- a recipe B imported and then unsaved is absent from B's collection
  att := pg_temp.reserve(b, 'extract_web', 'https://rls-test.invalid/bobs');
  bobs := (select rid from pg_temp.save(b, att, pg_temp.web_payload('Bob''s')::text));
  perform pg_temp.as_user(b);
  delete from public.saved_recipes where recipe_id = bobs;
  perform pg_temp.ok(not exists (select 1 from public.my_collection where id = bobs), 'AC-9 B''s own import can be unsaved');
  perform pg_temp.as_admin();
  perform pg_temp.ok((select added_by from public.recipes where id = bobs) = b, 'AC-9 B stays the adder');
  perform pg_temp.as_user(b);
  insert into public.saved_recipes (user_id, recipe_id) values (b, bobs);
  perform pg_temp.as_admin();

  -- distinct save times, then the view must list exactly B's saves, newest first, once each
  update public.saved_recipes set created_at = now() - (random() * 1000 + 1)::int * interval '1 minute'
  where user_id = b and created_at = now();
  select array_agg(recipe_id order by created_at desc, recipe_id desc) into expected from public.saved_recipes where user_id = b;
  perform pg_temp.as_user(b);
  select array_agg(id) into actual from public.my_collection;
  perform pg_temp.as_admin();
  perform pg_temp.ok(actual = expected and cardinality(actual) >= 3, 'AC-9 my_collection lists B''s saves once each, newest first');

  -- everyone sees the same canonical content
  perform pg_temp.as_user(a);
  select title, source_url into a_view from public.recipes where id = pasta;
  perform pg_temp.as_user(b);
  select title, source_url into b_view from public.recipes where id = pasta;
  perform pg_temp.as_admin();
  perform pg_temp.ok(a_view = b_view, 'AC-9 same canonical content for both users');
end $$;

-- AC-12: profile trigger --------------------------------------------------------------

do $$
begin
  perform pg_temp.ok((select display_name from public.profiles where id = 'a0000000-0000-0000-0000-000000000001') = 'Alice Cook'
    and (select avatar_url from public.profiles where id = 'a0000000-0000-0000-0000-000000000001') = 'https://lh3.rls-test.invalid/a.png',
    'AC-12 full_name wins over name, https avatar kept');
  perform pg_temp.ok((select display_name from public.profiles where id = 'b0000000-0000-0000-0000-000000000001') = 'Bob', 'AC-12 falls back to name');

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-e1@sotus.invalid', '{"full_name":"   ","name":"Second"}'),
    ('e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls-e2@sotus.invalid', ('{"name":"' || repeat('x', 150) || '"}')::jsonb),
    ('e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rls-e3@sotus.invalid', null),
    ('e0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'rls-e4@sotus.invalid', '{"name":"Http","avatar_url":"http://x.test/a.png"}'),
    ('e0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'rls-e5@sotus.invalid', ('{"name":"Long","avatar_url":"https://x.test/' || repeat('a', 2040) || '"}')::jsonb),
    ('e0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'rls-e6@sotus.invalid', '{"full_name":"  ","name":" "}');

  perform pg_temp.ok((select display_name from public.profiles where id = 'e0000000-0000-0000-0000-000000000001') = 'Second', 'AC-12 blank full_name is skipped');
  perform pg_temp.ok((select char_length(display_name) from public.profiles where id = 'e0000000-0000-0000-0000-000000000002') = 100, 'AC-12 long name cut to 100');
  perform pg_temp.ok((select display_name from public.profiles where id = 'e0000000-0000-0000-0000-000000000003') = 'Sotus cook', 'AC-12 no metadata gets the default name');
  perform pg_temp.ok((select avatar_url is null from public.profiles where id = 'e0000000-0000-0000-0000-000000000004'), 'AC-12 http avatar is dropped');
  perform pg_temp.ok((select avatar_url is null from public.profiles where id = 'e0000000-0000-0000-0000-000000000005'), 'AC-12 oversized avatar is dropped');
  perform pg_temp.ok((select display_name from public.profiles where id = 'e0000000-0000-0000-0000-000000000006') = 'Sotus cook', 'AC-12 all blank names get the default');
end $$;

-- AC-10, AC-11: quota, URLs, finish ------------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  q uuid := 'c0000000-0000-0000-0000-000000000001';
  i int;
  bad text;
  att uuid;
begin
  for i in 1..20 loop
    perform pg_temp.reserve(q, 'extract_web', 'https://rls-test.invalid/q' || i);
  end loop;
  perform pg_temp.as_user(q);
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('extract_web', 'https://rls-test.invalid/q21')$q$, 'quota_exceeded');
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('extract_youtube', 'https://www.youtube.com/watch?v=rlstest0021')$q$, 'quota_exceeded');
  perform pg_temp.as_admin();
  perform pg_temp.ok((select count(*) from public.ai_attempts where user_id = q) = 20, 'AC-10 nothing inserted over the limit');
  perform pg_temp.ok(pg_temp.reserve(q, 'cook_pick', null) is not null, 'AC-10 cook_pick has its own limit');

  foreach bad in array array[
    'https://user:pw@rls-test.invalid/a', 'https://rls-test.invalid:8080/a', 'https://www.youtube.com/watch?v=rlstest0001',
    'https://youtu.be/rlstest0001', 'https://m.youtube.com/watch?v=rlstest0001', 'ftp://rls-test.invalid/a',
    'https://rls-test.invalid/' || repeat('a', 2035), '   ', 'not a url'
  ] loop
    perform pg_temp.as_user(b);
    perform pg_temp.expect_error(format('select public.reserve_ai_attempt(%L, %L)', 'extract_web', bad), 'invalid_source_url');
    perform pg_temp.as_admin();
  end loop;

  perform pg_temp.as_user(b);
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('extract_web', null)$q$, 'invalid_source_url');
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('extract_youtube', null)$q$, 'invalid_source_url');
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('extract_youtube', 'https://youtu.be/rlstest0001')$q$, 'invalid_source_url');
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('extract_youtube', 'https://www.youtube.com/watch?v=rlstest0001&t=5')$q$, 'invalid_source_url');
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('extract_youtube', 'https://rls-test.invalid/a')$q$, 'invalid_source_url');
  perform pg_temp.expect_error($q$select public.reserve_ai_attempt('cook_pick', 'https://rls-test.invalid/a')$q$, 'invalid_source_url');
  perform pg_temp.as_admin();

  perform pg_temp.ok(pg_temp.reserve(b, 'extract_web', 'http://rls-test.invalid:80/ok') is not null, 'AC-10 port 80 is fine');
  perform pg_temp.ok(pg_temp.reserve(b, 'extract_web', 'https://rls-test.invalid:443/ok') is not null, 'AC-10 port 443 is fine');

  -- AC-11: finish_ai_attempt
  att := pg_temp.reserve(b, 'extract_web', 'https://rls-test.invalid/finish');
  perform pg_temp.as_user(b);
  perform pg_temp.expect_error(format($q$select public.finish_ai_attempt(%L, 'recipe', null, 0, 0)$q$, att), 'invalid_outcome');
  perform pg_temp.expect_error(format($q$select public.finish_ai_attempt(%L, 'started', null, 0, 0)$q$, att), 'invalid_outcome');
  perform pg_temp.expect_error(format($q$select public.finish_ai_attempt(%L, 'insufficient', %L, 0, 0)$q$, att, repeat('r', 61)), 'invalid_arguments');
  perform pg_temp.expect_error(format($q$select public.finish_ai_attempt(%L, 'insufficient', 'x', -1, 0)$q$, att), 'invalid_arguments');
  perform pg_temp.as_user(a);
  perform pg_temp.expect_error(format($q$select public.finish_ai_attempt(%L, 'insufficient', 'x', 0, 0)$q$, att), 'attempt_not_found');
  perform pg_temp.as_user(b);
  perform public.finish_ai_attempt(att, 'insufficient', 'no_written_recipe', 5, 6);
  perform pg_temp.expect_error(format($q$select public.finish_ai_attempt(%L, 'ingestion_failed', 'x', 0, 0)$q$, att), 'attempt_not_found');
  perform pg_temp.as_admin();
  perform pg_temp.ok((select outcome = 'insufficient' and reason = 'no_written_recipe' and input_tokens = 5 and output_tokens = 6 and finished_at is not null
    from public.ai_attempts where id = att), 'AC-11 finish sets outcome, reason, tokens and finished_at');

  -- an attempt left started for a long time can still be finished
  att := pg_temp.reserve(b, 'cook_pick', null);
  update public.ai_attempts set created_at = now() - interval '3 days' where id = att;
  perform pg_temp.as_user(b);
  perform public.finish_ai_attempt(att, 'ingestion_failed', 'timeout', 0, 0);
  perform pg_temp.as_admin();
  perform pg_temp.ok((select outcome from public.ai_attempts where id = att) = 'ingestion_failed', 'AC-11 an old started attempt can be finished');
end $$;

-- AC-10: web_url_key examples ----------------------------------------------------------

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('https://Example.COM/Pasta', 'https://example.com/Pasta'),
      ('https://example.com/pasta#step-3', 'https://example.com/pasta'),
      ('https://example.com/pasta?utm_source=x', 'https://example.com/pasta'),
      ('https://example.com/pasta?UTM_Medium=x&id=2', 'https://example.com/pasta?id=2'),
      ('https://example.com/pasta?id=2&fbclid=y&page=1', 'https://example.com/pasta?id=2&page=1'),
      ('https://example.com/pasta?gclid=1&igshid=2&mc_cid=3&mc_eid=4', 'https://example.com/pasta'),
      ('https://example.com/pasta?', 'https://example.com/pasta'),
      ('https://example.com:443/pasta', 'https://example.com/pasta'),
      ('http://example.com:80/pasta', 'http://example.com/pasta'),
      ('https://example.com:80/pasta', 'https://example.com:80/pasta'),
      ('http://example.com:443/pasta', 'http://example.com:443/pasta'),
      ('https://www.example.com/pasta', 'https://www.example.com/pasta'),
      ('http://example.com/pasta', 'http://example.com/pasta'),
      ('https://example.com/pasta/', 'https://example.com/pasta/'),
      ('https://example.com', 'https://example.com'),
      ('https://user:pw@example.com/pasta', null),
      ('ftp://example.com/pasta', null)
    ) as v(input, expected)
  loop
    perform pg_temp.ok(private.web_url_key(c.input) is not distinct from c.expected,
      format('AC-10 web_url_key(%s) = %s, got %s', c.input, c.expected, private.web_url_key(c.input)));
  end loop;
  perform pg_temp.ok(private.youtube_video_id('https://www.youtube.com/watch?v=dQw4w9WgXcQ') = 'dQw4w9WgXcQ', 'AC-10 youtube_video_id');
  perform pg_temp.ok(private.youtube_video_id('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1') is null, 'AC-10 youtube_video_id is strict');
end $$;

-- AC-15: privileges ---------------------------------------------------------------------

do $$
declare
  a uuid := 'a0000000-0000-0000-0000-000000000001';
  t text;
begin
  -- helpers are closed to everyone but the owner
  perform pg_temp.as_user(a);
  perform pg_temp.expect_error($q$select private.web_url_key('https://x.com/a')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select private.youtube_video_id('https://www.youtube.com/watch?v=dQw4w9WgXcQ')$q$, 'permission denied');
  perform pg_temp.as_anon();
  perform pg_temp.expect_error($q$select private.web_url_key('https://x.com/a')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select private.youtube_video_id('https://www.youtube.com/watch?v=dQw4w9WgXcQ')$q$, 'permission denied');
  perform pg_temp.as_admin();
  perform pg_temp.ok(not has_function_privilege('authenticated', 'private.web_url_key(text)', 'execute'), 'AC-15 authenticated cannot execute web_url_key');
  perform pg_temp.ok(not has_function_privilege('anon', 'private.web_url_key(text)', 'execute'), 'AC-15 anon cannot execute web_url_key');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'private.youtube_video_id(text)', 'execute'), 'AC-15 authenticated cannot execute youtube_video_id');
  perform pg_temp.ok(not has_schema_privilege('authenticated', 'private', 'usage') and not has_schema_privilege('anon', 'private', 'usage'), 'AC-15 private schema is closed');

  -- table grants: read everywhere, write only saved_recipes insert and delete
  foreach t in array array['profiles', 'recipes', 'recipe_ingredients', 'recipe_steps', 'saved_recipes', 'ai_attempts', 'my_collection'] loop
    perform pg_temp.ok(has_table_privilege('authenticated', 'public.' || t, 'select'), 'AC-15 authenticated selects ' || t);
    perform pg_temp.ok(not has_table_privilege('authenticated', 'public.' || t, 'update'), 'AC-15 no update grant on ' || t);
    perform pg_temp.ok(not has_table_privilege('anon', 'public.' || t, 'select'), 'AC-15 anon has no select on ' || t);
  end loop;
  perform pg_temp.ok(has_table_privilege('authenticated', 'public.saved_recipes', 'insert') and has_table_privilege('authenticated', 'public.saved_recipes', 'delete'), 'AC-15 saves can be added and removed');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'public.recipes', 'insert') and not has_table_privilege('authenticated', 'public.recipes', 'delete'), 'AC-15 recipes are not writable');

  -- every RPC is executable by authenticated only
  perform pg_temp.ok(has_function_privilege('authenticated', 'public.save_recipe(uuid,text,text,integer,integer)', 'execute')
    and not has_function_privilege('anon', 'public.save_recipe(uuid,text,text,integer,integer)', 'execute'), 'AC-15 save_recipe grants');

  -- a table and a function created after the migration start closed
  perform pg_temp.as_role('postgres');
  create table public.rls_tmp_t (id int);
  create function public.rls_tmp_f() returns int language sql as 'select 1';
  create table private.rls_tmp_t (id int);
  create function private.rls_tmp_f() returns int language sql as 'select 1';
  perform pg_temp.as_admin();
  foreach t in array array['public.rls_tmp_t', 'private.rls_tmp_t'] loop
    perform pg_temp.ok(not has_table_privilege('anon', t, 'select') and not has_table_privilege('authenticated', t, 'select')
      and not has_table_privilege('authenticated', t, 'insert'), 'AC-15 new table starts closed: ' || t);
  end loop;
  foreach t in array array['public.rls_tmp_f()', 'private.rls_tmp_f()'] loop
    perform pg_temp.ok(not has_function_privilege('anon', t, 'execute') and not has_function_privilege('authenticated', t, 'execute'),
      'AC-15 new function starts closed: ' || t);
  end loop;
end $$;

-- AC-13, AC-15: account deletion --------------------------------------------------------

do $$
declare
  b uuid := 'b0000000-0000-0000-0000-000000000001';
  d uuid := 'd0000000-0000-0000-0000-000000000001';
  att uuid;
  youtube_att uuid;
  rid uuid;
  yt_rid uuid;
  before_row public.recipes;
  after_row public.recipes;
  attempts_today_before int;
  today timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  att := pg_temp.reserve(d, 'extract_web', 'https://rls-test.invalid/dee');
  rid := (select s.rid from pg_temp.save(d, att, pg_temp.web_payload('Dee''s')::text) as s);
  youtube_att := pg_temp.reserve(d, 'extract_youtube', 'https://www.youtube.com/watch?v=rlstest0004');
  yt_rid := (select s.rid from pg_temp.save(d, youtube_att, pg_temp.yt_payload()::text) as s);

  perform pg_temp.as_user(b);
  perform public.open_existing_recipe('web', 'https://rls-test.invalid/dee');
  perform pg_temp.as_admin();

  select * into before_row from public.recipes where id = rid;
  select count(*) into attempts_today_before from public.ai_attempts where created_at >= today;

  -- The CLI login role cannot become supabase_auth_admin, so this deletes as postgres. The
  -- foreign key action that nulls added_by runs as the owner of recipes (postgres) in both cases.
  perform pg_temp.as_role('postgres');
  delete from auth.users where id = d;
  perform pg_temp.as_admin();

  select * into after_row from public.recipes where id = rid;
  perform pg_temp.ok(after_row.id = rid and after_row.added_by is null, 'AC-13 recipe stays with added_by null');
  perform pg_temp.ok(after_row.title = before_row.title and after_row.updated_at = before_row.updated_at
    and after_row.source_url_key = before_row.source_url_key, 'AC-13 content and updated_at unchanged');
  perform pg_temp.ok((select added_by is null from public.recipes where id = yt_rid) and (select youtube_video_id from public.recipes where id = yt_rid) = 'rlstest0004',
    'AC-15 youtube recipe survives the adder with its generated key');
  perform pg_temp.ok(exists (select 1 from public.saved_recipes where user_id = b and recipe_id = rid), 'AC-13 other users'' saves stay');
  perform pg_temp.ok(not exists (select 1 from public.saved_recipes where user_id = d) and not exists (select 1 from public.profiles where id = d),
    'AC-13 the user''s profile and saves are gone');
  perform pg_temp.ok((select count(*) from public.ai_attempts where user_id is null and source_url in ('https://rls-test.invalid/dee', 'https://www.youtube.com/watch?v=rlstest0004')) = 2,
    'AC-13 attempts stay with user_id null');
  perform pg_temp.ok((select count(*) from public.ai_attempts where created_at >= today) = attempts_today_before, 'AC-13 attempts still count app wide');
end $$;

rollback;

-- After the rollback: no fixture row may remain, and this is the script's result. ----------

select
  (select count(*) from auth.users where email like '%@sotus.invalid') as users_left,
  (select count(*) from public.profiles where id::text ~ '^[a-e]0000000-0000-0000-0000-') as profiles_left,
  (select count(*) from public.recipes where source_url like '%rls-test.invalid%' or youtube_video_id like 'rlstest%') as recipes_left,
  (select count(*) from public.ai_attempts where source_url like '%rls-test.invalid%' or source_url like '%rlstest%') as attempts_left,
  (select count(*) from vault.secrets where name = 'recipe_publish_secret') as vault_secret_present,
  (select count(*) from pg_class where relname = 'rls_tmp_t') as temp_tables_left,
  'PASS if every *_left is 0 and vault_secret_present is 1' as verdict;
