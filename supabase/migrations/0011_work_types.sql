-- TeamEmbedded · MID (중분류): the kind of work done in a half hour (개발-신규, 지원-8D, 회의-INT, …),
-- logged next to the category (which project). Optional on every slot; repeated tasks can carry one.
-- Admins manage the list (Projects → MID); everyone else picks from it.

create table if not exists public.work_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  name_key text generated always as (public.project_name_key(name)) stored,
  sort_order integer not null default 0,
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- removed by an admin while still used: kept so old slots keep their MID, but not offered any more
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists work_types_name_key on public.work_types (name_key);

alter table public.time_slots add column if not exists work_type_id uuid references public.work_types (id) on delete set null;
alter table public.task_templates add column if not exists work_type_id uuid references public.work_types (id) on delete set null;

alter table public.work_types enable row level security;
drop policy if exists work_types_select on public.work_types;
create policy work_types_select on public.work_types for select to authenticated using (true);
drop policy if exists work_types_write on public.work_types;
create policy work_types_write on public.work_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- same privileges as the other tables (0010): signed-in users through RLS, nothing for anon
revoke all on public.work_types from anon;
grant select, insert, update, delete on public.work_types to authenticated, service_role;

-- Admins: delete a MID nobody has used yet, otherwise hide it (old slots keep showing it).
create or replace function public.remove_work_type(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can remove MID entries' using errcode = '42501';
  end if;
  if not exists (select 1 from public.work_types where id = p_id) then
    raise exception 'MID not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.time_slots where work_type_id = p_id)
     and not exists (select 1 from public.task_templates where work_type_id = p_id) then
    delete from public.work_types where id = p_id;
    return 'deleted';
  end if;
  update public.work_types set hidden = true where id = p_id;
  return 'hidden';
end $$;
revoke execute on function public.remove_work_type(uuid) from public, anon;
grant execute on function public.remove_work_type(uuid) to authenticated, service_role;

-- Starting list (admins can rename, reorder, recolor, add and remove)
insert into public.work_types (name, sort_order, color) values
  ('개발-신규', 1, '#2E9E5B'),
  ('개발-파생', 2, '#57B894'),
  ('개발-설계변경', 3, '#8BC34A'),
  ('개발-선행검토', 4, '#1E88A8'),
  ('검증-시험·인증', 5, '#7E57C2'),
  ('검증-시제품', 6, '#AB47BC'),
  ('지원-생산', 7, '#F28C28'),
  ('지원-8D', 8, '#E5534B'),
  ('지원-견적', 9, '#D4A017'),
  ('회의-INT', 10, '#3B82F6'),
  ('회의-EXT', 11, '#0EA5E9'),
  ('일반-이메일 및 일반업무', 12, '#94A3B8')
on conflict (name_key) do nothing;
