-- Sotus core schema (spec 0003): profiles, recipes, ingredients, steps, saves, AI attempts.
-- Recipes are canonical snapshots: nobody writes them directly, only save_recipe (next migration).

create schema if not exists private;

-- Closed by default: every object a later migration creates starts with no grants for
-- anon or authenticated, and each feature grants exactly what it needs.
-- Tables and sequences can be closed per schema. Function defaults cannot: Postgres adds a
-- per schema default to the global one, and the global one gives EXECUTE to PUBLIC, so that
-- part has to be revoked globally for the role that runs migrations.
alter default privileges for role postgres in schema public, private
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public, private
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public, private
  revoke execute on functions from anon, authenticated;

revoke all on schema private from public, anon, authenticated;

-- Enums

create type public.source_kind as enum ('web', 'youtube');

create type public.extraction_method as enum (
  'web_jsonld',
  'web_model',
  'youtube_recipe_page_jsonld',
  'youtube_description',
  'youtube_transcript'
);

create type public.ai_attempt_kind as enum ('extract_web', 'extract_youtube', 'cook_pick');

create type public.ai_attempt_outcome as enum (
  'started',
  'recipe',
  'not_a_recipe',
  'insufficient',
  'ingestion_failed'
);

-- URL key functions: the one normalization used by generated columns and RPCs alike.

create function private.youtube_video_id(url text)
returns text
language sql
strict
immutable
parallel safe
set search_path = ''
as $$
  select (regexp_match(url, '^https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})$'))[1];
$$;

-- Conservative on purpose: a false merge sends people to the wrong recipe, a missed merge
-- only leaves a duplicate. Returns null for anything that is not a plain http(s) URL.
create function private.web_url_key(url text)
returns text
language sql
strict
immutable
parallel safe
set search_path = ''
as $$
  select
    lower(u.m[1]) || '://' || lower(a.parts[1])
    || case
         when a.parts[2] is null
           or (lower(u.m[1]) = 'http' and a.parts[2] = '80')
           or (lower(u.m[1]) = 'https' and a.parts[2] = '443')
         then ''
         else ':' || a.parts[2]
       end
    || u.m[3]
    || coalesce('?' || nullif(q.kept, ''), '')
  from (
    select regexp_match(url, '^(https?)://([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$', 'i') as m
  ) as u
  cross join lateral (
    select regexp_match(u.m[2], '^([^@:/]+)(?::([0-9]+))?$') as parts
  ) as a
  cross join lateral (
    select string_agg(p.param, '&' order by p.ord) as kept
    from unnest(string_to_array(u.m[4], '&')) with ordinality as p(param, ord)
    where lower(split_part(p.param, '=', 1)) !~ '^utm_'
      and lower(split_part(p.param, '=', 1)) not in ('fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid')
  ) as q
  where u.m is not null and a.parts is not null;
$$;

-- A web link Sotus accepts for extraction: a key exists, only the standard ports,
-- not a YouTube host (those take the YouTube path), and a size an index row can hold.
create function private.is_valid_web_url(url text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    coalesce(
      octet_length(url) <= 2048
      and private.web_url_key(url) is not null
      and coalesce(a.port, '80') in ('80', '443')
      and lower(a.host) not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'),
      false
    )
  from (
    select
      regexp_replace(authority, ':[0-9]+$', '') as host,
      (regexp_match(authority, ':([0-9]+)$'))[1] as port
    from (select (regexp_match(url, '^https?://([^/?#]*)', 'i'))[1] as authority) as s
  ) as a;
$$;

-- Profile values from Google sign in metadata. Shared by the sign up trigger and the backfill.

create function private.profile_display_name(meta jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select left(
    coalesce(
      nullif(btrim(meta ->> 'full_name'), ''),
      nullif(btrim(meta ->> 'name'), ''),
      'Sotus cook'
    ),
    100
  );
$$;

create function private.profile_avatar_url(meta jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when meta ->> 'avatar_url' like 'https://%' and octet_length(meta ->> 'avatar_url') <= 2048
    then meta ->> 'avatar_url'
  end;
$$;

-- Tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  avatar_url text check (avatar_url ~ '^https://' and octet_length(avatar_url) <= 2048),
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  added_by uuid references public.profiles (id) on delete set null,
  title text not null
    check (char_length(title) between 1 and 120 and title = btrim(title) and title ~ '\S'),
  source_kind public.source_kind not null,
  source_url text not null check (octet_length(source_url) <= 2048),
  source_url_key text generated always as (
    case when source_kind = 'web' then private.web_url_key(source_url) end
  ) stored,
  youtube_video_id text generated always as (
    case when source_kind = 'youtube' then private.youtube_video_id(source_url) end
  ) stored,
  source_title text check (char_length(source_title) <= 300),
  source_channel_title text check (char_length(source_channel_title) <= 300),
  source_metadata_fetched_at timestamptz,
  extraction_method public.extraction_method not null,
  recipe_page_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_source_url_key_key unique (source_url_key),
  constraint recipes_youtube_video_id_key unique (youtube_video_id),
  constraint recipes_web_has_key check (source_kind <> 'web' or source_url_key is not null),
  constraint recipes_youtube_has_video_id check (source_kind <> 'youtube' or youtube_video_id is not null),
  constraint recipes_channel_title_youtube_only check (
    source_channel_title is null or source_kind = 'youtube'
  ),
  constraint recipes_metadata_fetched_youtube_only check (
    (source_kind = 'youtube') = (source_metadata_fetched_at is not null)
  ),
  constraint recipes_method_matches_kind check (
    (source_kind = 'web') = (extraction_method in ('web_jsonld', 'web_model'))
  ),
  constraint recipes_recipe_page_url_rule check (
    (extraction_method = 'youtube_recipe_page_jsonld') = (recipe_page_url is not null)
    and (recipe_page_url is null or (recipe_page_url ~ '^https?://' and octet_length(recipe_page_url) <= 2048))
  )
);

create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position smallint not null check (position between 1 and 60),
  name text not null
    check (char_length(name) between 1 and 120 and name = btrim(name) and name ~ '\S'),
  quantity text check (char_length(quantity) <= 40),
  unit text check (char_length(unit) <= 20),
  primary key (recipe_id, position)
);

create table public.recipe_steps (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position smallint not null check (position between 1 and 40),
  body text not null
    check (char_length(body) between 1 and 1000 and body = btrim(body) and body ~ '\S'),
  primary key (recipe_id, position)
);

create table public.saved_recipes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table public.ai_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  kind public.ai_attempt_kind not null,
  source_url text check (octet_length(source_url) <= 2048),
  outcome public.ai_attempt_outcome not null default 'started',
  reason text check (char_length(reason) <= 60),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  recipe_id uuid references public.recipes (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint ai_attempts_url_rule check ((kind = 'cook_pick') = (source_url is null)),
  constraint ai_attempts_finished_rule check ((outcome = 'started') = (finished_at is null))
);

-- Indexes (beyond primary keys and the two unique constraints)

create index recipes_created_at_id_idx on public.recipes (created_at desc, id desc);
create index recipes_added_by_idx on public.recipes (added_by);
create index saved_recipes_recipe_id_idx on public.saved_recipes (recipe_id);
create index ai_attempts_user_id_created_at_idx on public.ai_attempts (user_id, created_at);
create index ai_attempts_created_at_idx on public.ai_attempts (created_at);
create index ai_attempts_recipe_id_idx on public.ai_attempts (recipe_id) where recipe_id is not null;

-- The caller's collection: exactly their saved recipes, newest save first.
-- security_invoker so the caller's RLS applies to both tables.
create view public.my_collection
with (security_invoker = true) as
select r.*, s.created_at as added_at
from public.saved_recipes as s
join public.recipes as r on r.id = s.recipe_id
where s.user_id = (select auth.uid())
order by s.created_at desc, r.id desc;

-- Triggers

-- Content columns only, so changing added_by (account deletion) leaves updated_at alone.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger recipes_set_updated_at
before update of title, source_title, source_channel_title, source_metadata_fetched_at, extraction_method, recipe_page_url
on public.recipes
for each row execute function private.set_updated_at();

-- A sign up must never fail because of a profile problem, so the fallbacks swallow errors.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (id, display_name, avatar_url)
    values (
      new.id,
      private.profile_display_name(new.raw_user_meta_data),
      private.profile_avatar_url(new.raw_user_meta_data)
    );
  exception when others then
    begin
      insert into public.profiles (id, display_name) values (new.id, 'Sotus cook');
    exception when others then
      raise warning 'handle_new_user: could not create a profile for %', new.id;
    end;
  end;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, display_name, avatar_url)
select id, private.profile_display_name(raw_user_meta_data), private.profile_avatar_url(raw_user_meta_data)
from auth.users
on conflict do nothing;

-- Row level security

alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.ai_attempts enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy recipes_select on public.recipes
  for select to authenticated using (true);

create policy recipe_ingredients_select on public.recipe_ingredients
  for select to authenticated using (true);

create policy recipe_steps_select on public.recipe_steps
  for select to authenticated using (true);

create policy saved_recipes_select on public.saved_recipes
  for select to authenticated using (user_id = (select auth.uid()));

create policy saved_recipes_insert on public.saved_recipes
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy saved_recipes_delete on public.saved_recipes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy ai_attempts_select on public.ai_attempts
  for select to authenticated using (user_id = (select auth.uid()));

-- Privileges, explicit: Supabase grants anon and authenticated everything on new objects in public.

revoke all on
  public.profiles,
  public.recipes,
  public.recipe_ingredients,
  public.recipe_steps,
  public.saved_recipes,
  public.ai_attempts,
  public.my_collection
from anon, authenticated;

grant select on
  public.profiles,
  public.recipes,
  public.recipe_ingredients,
  public.recipe_steps,
  public.saved_recipes,
  public.ai_attempts,
  public.my_collection
to authenticated;

grant insert, delete on public.saved_recipes to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
