-- TimeCrumbs · B5: admins add projects by hand and remove ("hide") projects in Projects → Project mapping.
--
-- hidden: removed from lists and dropdowns but kept, so existing logs stay mapped, a master
--         re-import does not bring it back as NEW, and an admin can restore it.
-- manual: added in the app, not (yet) in the master sheet. Never marked "missing" by an import;
--         when the master sheet later lists the same name/code it is merged (manual = false) and
--         not flagged NEW (first_seen_import_id stays null).

alter table public.group_projects
  add column hidden boolean not null default false,
  add column manual boolean not null default false;

-- Same as 0001 apply_master_import(), plus: merged manual rows become master rows, and manual
-- rows are never marked missing. Hidden rows are matched like any other, so they stay hidden.
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
      insert into public.group_projects (code, name, kind, sort_order, first_seen_import_id, last_seen_import_id)
      values (nullif(v_row ->> 'code', ''), v_row ->> 'name', (v_row ->> 'kind')::public.project_kind,
              v_idx, v_import_id, v_import_id)
      returning id into v_match;
      v_added := v_added + 1;
      v_added_names := v_added_names || (v_row ->> 'name');
    else
      update public.group_projects
         set name = v_row ->> 'name',
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

-- Add a project by hand (admins). Duplicate names (same matching key, hidden rows included) are refused.
create or replace function public.add_group_project(p_name text, p_code text, p_kind public.project_kind)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_hidden boolean;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can add projects' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'project name is required' using errcode = '22023';
  end if;
  select hidden into v_hidden from public.group_projects where name_key = public.project_name_key(v_name) limit 1;
  if found then
    if v_hidden then
      raise exception '숨긴 항목에 같은 이름이 있습니다: % (숨긴 항목 보기 → 되돌리기)', v_name using errcode = '23505';
    end if;
    raise exception '이미 있는 프로젝트입니다: %', v_name using errcode = '23505';
  end if;
  insert into public.group_projects (name, code, kind, manual, sort_order)
  values (v_name, nullif(btrim(coalesce(p_code, '')), ''), p_kind, true,
          coalesce((select max(sort_order) from public.group_projects where kind = p_kind), 0) + 1)
  returning id into v_id;
  return v_id;
end $$;

-- Remove a project (admins). A manual project nobody has used yet (no logs, no repeated tasks) is
-- deleted; anything else is hidden. Built-in rows (system_key) cannot be removed.
create or replace function public.remove_group_project(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.group_projects%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only admins can remove projects' using errcode = '42501';
  end if;
  select * into v from public.group_projects where id = p_id;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if v.system_key is not null then
    raise exception 'built-in rows cannot be removed' using errcode = '42501';
  end if;
  if v.manual
     and not exists (select 1 from public.time_slots where group_project_id = p_id)
     and not exists (select 1 from public.task_templates where group_project_id = p_id) then
    delete from public.group_projects where id = p_id;
    return 'deleted';
  end if;
  update public.group_projects set hidden = true where id = p_id;
  return 'hidden';
end $$;
