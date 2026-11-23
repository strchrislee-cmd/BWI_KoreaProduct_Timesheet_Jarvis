-- Minimal stand-in for the parts of Supabase the migrations rely on (local tests only).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Like a new Supabase project: new tables are NOT granted to the API roles automatically (0010
-- grants them), while functions stay executable by PUBLIC (Postgres default) until 0010 revokes it.
