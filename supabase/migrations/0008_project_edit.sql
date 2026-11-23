-- TimeCrumbs · admins edit the No (order) and name of any project in Projects → Project mapping,
-- and save / load the list as a TimeCrumbs file. Order and names are plain updates (admin RLS).
--
-- sheet_name: when an admin renames a row that came from the master sheet, the name the sheet
-- uses is remembered here, so importing the original sheet again still finds the row (and keeps
-- the name chosen in the app). Null when the app name and the sheet name are the same.

alter table public.group_projects
  add column sheet_name text,
  add column sheet_name_key text generated always as (public.project_name_key(sheet_name)) stored;
create index group_projects_sheet_name_key_idx on public.group_projects (sheet_name_key);

-- remember the sheet's name on the first rename of a master-sheet row; forget it once the
-- name is the sheet's again (same rules as sheetNameAfterRename() in src/domain/projects.ts)
create or replace function public.remember_sheet_name() returns trigger language plpgsql as $$
begin
  if new.sheet_name is null and old.sheet_name is null and new.kind <> 'local_section' and not old.manual
     and public.project_name_key(new.name) is distinct from old.name_key then
    new.sheet_name := old.name;
  end if;
  if new.sheet_name is not null and public.project_name_key(new.sheet_name) = public.project_name_key(new.name) then
    new.sheet_name := null;
  end if;
  return new;
end $$;

create trigger group_projects_remember_sheet_name
  before update of name, sheet_name on public.group_projects
  for each row execute function public.remember_sheet_name();

-- Same as 0006 apply_master_import(), plus: a row an admin renamed is also found by its sheet
-- name, and keeps its app name (the sheet's current spelling goes to sheet_name).
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
  -- auth.uid() is null for the service role (Vercel function); otherwise admins only
  if auth.uid() is not null and not public.is_admin() then
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
