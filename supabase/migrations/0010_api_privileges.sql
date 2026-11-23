-- TimeCrumbs · explicit API privileges and a safer master import.
--
-- Newer Supabase projects no longer grant new tables to the API roles automatically, so without
-- this the signed-in app gets "permission denied". Access to rows is still decided by RLS.
-- The anonymous role (the public key without a signed-in user) needs nothing in this app: it
-- gets no table or function access. That also closes a hole: apply_master_import() treated
-- "no signed-in user" as the service role, and the anonymous role has no user either.

-- the role of the current API request ('anon', 'authenticated', 'service_role'), or null
create or replace function public.request_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  nullif(current_setting('request.jwt.claim.role', true), ''))
$$;

create or replace function public.apply_master_import(
  p_file_name text,
  p_source text,
  p_content_hash text,
  p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_import_id uuid;
  v_existing uuid;
  v_baseline boolean;
  v_row jsonb;
  v_idx integer := 0;
  v_match uuid;
  v_added integer := 0;
  v_missing integer := 0;
  v_added_names text[] := '{}';
  v_seen uuid[] := '{}';
begin
  -- admins, or the service role (Vercel /api/ingest). The anonymous API role has no user either,
  -- so "no user" alone is not enough (it was, before 0010).
  if not public.is_admin() and coalesce(public.request_role(), '') <> 'service_role' then
    raise exception 'only admins can import the master sheet' using errcode = '42501';
  end if;

  select id into v_existing from public.master_imports where content_hash = p_content_hash;
  if found then
    return jsonb_build_object('status', 'duplicate', 'import_id', v_existing);
  end if;

  select not exists (select 1 from public.master_imports) into v_baseline;
  insert into public.master_imports (file_name, source, content_hash, uploaded_by, is_baseline)
  values (p_file_name, p_source, p_content_hash, auth.uid(), v_baseline)
  returning id into v_import_id;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_match := null;

    if nullif(v_row ->> 'code', '') is not null then
      select id into v_match from public.group_projects
       where kind <> 'local_section' and upper(code) = upper(v_row ->> 'code')
         and not (id = any (v_seen))
       limit 1;
    end if;
    if v_match is null then
      select id into v_match from public.group_projects
       where kind <> 'local_section' and name_key = public.project_name_key(v_row ->> 'name')
         and not (id = any (v_seen))
       limit 1;
    end if;
    if v_match is null then
      select id into v_match from public.group_projects
       where kind <> 'local_section' and sheet_name_key = public.project_name_key(v_row ->> 'name')
         and not (id = any (v_seen))
       limit 1;
    end if;

    if v_match is null then
      insert into public.group_projects (code, name, kind, sort_order, first_seen_import_id, last_seen_import_id)
      values (nullif(v_row ->> 'code', ''), v_row ->> 'name', (v_row ->> 'kind')::public.project_kind,
              v_idx, v_import_id, v_import_id)
      returning id into v_match;
      v_added := v_added + 1;
      v_added_names := v_added_names || (v_row ->> 'name');
    else
      update public.group_projects
         set name = case when sheet_name is null then v_row ->> 'name' else name end,
             sheet_name = case when sheet_name is null then null else v_row ->> 'name' end,
             code = coalesce(nullif(v_row ->> 'code', ''), code),
             sort_order = v_idx,
             status = 'active',
             manual = false,
             last_seen_import_id = v_import_id
       where id = v_match;
    end if;
    v_seen := v_seen || v_match;
  end loop;

  update public.group_projects set status = 'missing'
   where kind <> 'local_section' and status <> 'missing' and not manual and not (id = any (v_seen));
  get diagnostics v_missing = row_count;

  update public.master_imports
     set total_count = v_idx, added_count = v_added, missing_count = v_missing
   where id = v_import_id;

  return jsonb_build_object(
    'status', 'imported', 'import_id', v_import_id, 'is_baseline', v_baseline,
    'total', v_idx, 'added', v_added, 'added_names', to_jsonb(v_added_names), 'missing', v_missing);
end $$;

-- tables and sequences: signed-in users and the service role (RLS decides the rows); nothing for anon
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- functions: not callable by anon (or PUBLIC, which anon is part of)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- the same for anything later migrations create
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
