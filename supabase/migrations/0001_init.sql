-- TimeCrumbs · initial schema (Supabase / Postgres 15+)
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- ── Types ────────────────────────────────────────────────────────────────────
create type public.app_role as enum ('admin', 'member', 'viewer');
create type public.project_kind as enum ('project', 'timelog', 'local_section');
create type public.project_status as enum ('active', 'missing');
create type public.slot_kind as enum ('work', 'nonwork');
create type public.leave_type as enum ('annual', 'half_am', 'half_pm', 'company', 'biz_trip', 'sick');
create type public.invite_status as enum ('pending', 'accepted', 'revoked');

-- Matching key for project names. MUST stay identical to projectNameKey() in
-- src/domain/projects.ts (both are tested against tests/fixtures/name-keys.json).
create or replace function public.project_name_key(p_name text)
returns text language sql immutable parallel safe as $$
  select lower(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(normalize(p_name, NFKC), '[–—]', '-', 'g'),
      '\s*(-+)\s*', '\1', 'g'),
    '\s+', ' ', 'g')))
$$;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  engineer_code text not null default '',
  role public.app_role not null default 'member',
  can_export boolean not null default true,
  timezone text not null default 'Asia/Seoul',
  work_start text not null default '07:30' check (work_start ~ '^\d{2}:\d{2}$'),
  work_end text not null default '16:30' check (work_end ~ '^\d{2}:\d{2}$'),
  lunch_start text not null default '12:00' check (lunch_start ~ '^\d{2}:\d{2}$'),
  lunch_end text not null default '13:00' check (lunch_end ~ '^\d{2}:\d{2}$'),
  daily_target_hours numeric(4, 1) not null default 8.0 check (daily_target_hours between 0 and 24),
  template_style text not null default 'detailed' check (template_style in ('compact', 'detailed', 'project_first')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Single-row organisation settings
create table public.org_settings (
  id integer primary key default 1 check (id = 1),
  ai_enabled boolean not null default false,
  ai_model text not null default 'claude-opus-5-5',
  updated_at timestamptz not null default now()
);

create table public.master_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source text not null check (source in ('manual', 'ingest')),
  content_hash text not null unique,
  uploaded_by uuid references public.profiles (id) on delete set null,
  is_baseline boolean not null default false,
  total_count integer not null default 0,
  added_count integer not null default 0,
  missing_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.group_projects (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  name_key text generated always as (public.project_name_key(name)) stored,
  kind public.project_kind not null,
  system_key text unique,
  counts_toward_total boolean not null default true,
  sort_order integer not null default 0,
  status public.project_status not null default 'active',
  first_seen_import_id uuid references public.master_imports (id) on delete set null,
  last_seen_import_id uuid references public.master_imports (id) on delete set null,
  created_at timestamptz not null default now()
);
create index group_projects_name_key_idx on public.group_projects (name_key);

create table public.project_aliases (
  id uuid primary key default gen_random_uuid(),
  group_project_id uuid not null references public.group_projects (id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index project_aliases_alias_key on public.project_aliases (public.project_name_key(alias));

create table public.time_slots (
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  slot_index smallint not null check (slot_index between 0 and 47),
  kind public.slot_kind not null default 'work',
  group_project_id uuid references public.group_projects (id) on delete set null,
  label text not null default '',
  description text not null default '',
  focus smallint check (focus between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (user_id, work_date, slot_index)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  leave_type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  hours_per_day numeric(4, 1) not null check (hours_per_day > 0 and hours_per_day <= 24),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_user_idx on public.leave_requests (user_id, start_date);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  role public.app_role not null default 'member',
  can_export boolean not null default true,
  invited_by uuid references public.profiles (id) on delete set null,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- ── Role helpers (security definer so RLS policies can call them) ──────────────
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ── New auth user → profile (invite-only) ────────────────────────────────────
-- The very first user becomes admin. Everyone else needs a pending invitation,
-- otherwise sign-up is rejected at the database level.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first boolean;
  v_inv public.invitations%rowtype;
begin
  select not exists (select 1 from public.profiles) into v_first;
  select * into v_inv from public.invitations
   where lower(email) = lower(new.email) and status = 'pending' limit 1;

  if not v_first and v_inv.id is null then
    raise exception 'TimeCrumbs is invite-only: % has no pending invitation', new.email
      using errcode = '42501';
  end if;

  insert into public.profiles (id, email, name, role, can_export)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    case when v_first then 'admin'::public.app_role else v_inv.role end,
    coalesce(v_inv.can_export, true)
  );

  if v_inv.id is not null then
    update public.invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins may edit their own profile but not their role/permissions/e-mail.
-- The last admin cannot be demoted.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role
          or new.can_export is distinct from old.can_export
          or new.email is distinct from old.email) then
    raise exception 'only admins can change role, export permission or e-mail' using errcode = '42501';
  end if;

  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'cannot remove the last admin' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger time_slots_touch before update on public.time_slots
  for each row execute function public.touch_updated_at();
create trigger org_settings_touch before update on public.org_settings
  for each row execute function public.touch_updated_at();

-- ── Master import (used by the Projects page and /api/ingest) ─────────────────
-- p_rows: [{ "name": text, "code": text|null, "kind": "project"|"timelog" }, …]
-- Matching rules mirror diffMaster() in src/domain/projects.ts: code first, then name key.
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
             last_seen_import_id = v_import_id
       where id = v_match;
    end if;
    v_seen := v_seen || v_match;
  end loop;

  update public.group_projects set status = 'missing'
   where kind <> 'local_section' and status <> 'missing' and not (id = any (v_seen));
  get diagnostics v_missing = row_count;

  update public.master_imports
     set total_count = v_idx, added_count = v_added, missing_count = v_missing
   where id = v_import_id;

  return jsonb_build_object(
    'status', 'imported', 'import_id', v_import_id, 'is_baseline', v_baseline,
    'total', v_idx, 'added', v_added, 'added_names', to_jsonb(v_added_names), 'missing', v_missing);
end $$;

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.org_settings enable row level security;
alter table public.master_imports enable row level security;
alter table public.group_projects enable row level security;
alter table public.project_aliases enable row level security;
alter table public.time_slots enable row level security;
alter table public.leave_requests enable row level security;
alter table public.invitations enable row level security;

-- profiles: everyone signed in can see the team; edit yourself (admins: anyone)
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- org settings: read for all, write for admins
create policy org_settings_select on public.org_settings for select to authenticated using (true);
create policy org_settings_update on public.org_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- master data: read for all, write for admins (imports go through apply_master_import)
create policy master_imports_select on public.master_imports for select to authenticated using (true);
create policy group_projects_select on public.group_projects for select to authenticated using (true);
create policy group_projects_write on public.group_projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- aliases: team-wide; members add their own, delete their own; admins manage all
create policy aliases_select on public.project_aliases for select to authenticated using (true);
create policy aliases_insert on public.project_aliases for insert to authenticated
  with check (created_by = auth.uid() and public.current_app_role() <> 'viewer');
create policy aliases_delete on public.project_aliases for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- time slots & leave: own rows (not viewers); admins everything; viewers read everything
create policy slots_select on public.time_slots for select to authenticated
  using (user_id = auth.uid() or public.current_app_role() in ('admin', 'viewer'));
create policy slots_write on public.time_slots for all to authenticated
  using ((user_id = auth.uid() and public.current_app_role() <> 'viewer') or public.is_admin())
  with check ((user_id = auth.uid() and public.current_app_role() <> 'viewer') or public.is_admin());

create policy leave_select on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or public.current_app_role() in ('admin', 'viewer'));
create policy leave_write on public.leave_requests for all to authenticated
  using ((user_id = auth.uid() and public.current_app_role() <> 'viewer') or public.is_admin())
  with check ((user_id = auth.uid() and public.current_app_role() <> 'viewer') or public.is_admin());

-- invitations: admins only (the invite e-mail itself is sent by /api/admin/invite)
create policy invitations_admin on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
