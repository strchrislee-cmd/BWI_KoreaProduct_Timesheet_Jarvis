-- TeamEmbedded · org chart (reporting line + team name) and reading other people's time by level.
--
-- Everyone can see the whole org chart (profiles were already readable by every signed-in user).
-- Only admins set someone's manager and team.
-- Reading time (30-min log, work days, Daily Kanban) now follows the chart:
--   L1  their own time only,
--   L2  + the L1s below them,
--   L3  + the L2s and L1s below them (every step down the line),
--   admin everyone (as before).
-- An L1 can ask an L2 to see that L2's time. The L2 approves for 1 hour, 1 day or 1 week (or
-- denies), and the L1 can read it until then. Reading only: nobody writes another person's time.

-- ── Who reports to whom ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists manager_id uuid references public.profiles (id) on delete set null,
  add column if not exists team text not null default '';
create index if not exists profiles_manager_idx on public.profiles (manager_id);

-- 0001 + admins alone change the reporting line and team, and the line never loops
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role
          or new.can_export is distinct from old.can_export
          or new.email is distinct from old.email
          or new.manager_id is distinct from old.manager_id
          or new.team is distinct from old.team) then
    raise exception 'only admins can change role, export permission, e-mail, manager or team' using errcode = '42501';
  end if;

  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'cannot remove the last admin' using errcode = '42501';
  end if;

  if new.manager_id is not null and new.manager_id is distinct from old.manager_id then
    if new.manager_id = new.id
       or exists (
         with recursive up (id) as (
           select new.manager_id
           union
           select p.manager_id from public.profiles p join up on p.id = up.id where p.manager_id is not null
         )
         select 1 from up where id = new.id
       ) then
      raise exception 'the reporting line cannot loop back to this person' using errcode = '22023';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

-- ── An L1 asking an L2 to see their time ────────────────────────────────────
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz,
  check (requester_id <> owner_id),
  check ((status = 'approved') = (expires_at is not null))
);
create unique index if not exists access_requests_one_pending on public.access_requests (requester_id, owner_id) where status = 'pending';
create index if not exists access_requests_owner_idx on public.access_requests (owner_id, status);

alter table public.access_requests enable row level security;
-- the two people involved (and admins) see a request
drop policy if exists access_requests_select on public.access_requests;
create policy access_requests_select on public.access_requests for select to authenticated
  using (requester_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
-- an L1 asks an L2; the answer comes only through decide_access_request()
drop policy if exists access_requests_insert on public.access_requests;
create policy access_requests_insert on public.access_requests for insert to authenticated
  with check (
    requester_id = auth.uid() and status = 'pending' and decided_at is null and expires_at is null
    and public.current_app_role() = 'l1'
    and exists (select 1 from public.profiles o where o.id = owner_id and o.role = 'l2')
  );

revoke all on public.access_requests from anon;
grant select, insert on public.access_requests to authenticated;
grant select, insert, update, delete on public.access_requests to service_role;

-- the L2 who was asked approves for 1, 24 or 168 hours, or denies
create or replace function public.decide_access_request(p_id uuid, p_approve boolean, p_hours integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.access_requests%rowtype;
begin
  select * into v from public.access_requests where id = p_id for update;
  if not found or v.owner_id is distinct from auth.uid() then
    raise exception 'only the person who was asked can answer this request' using errcode = '42501';
  end if;
  if v.status <> 'pending' then
    raise exception 'this request has already been answered' using errcode = '22023';
  end if;
  if p_approve and coalesce(p_hours, 0) not in (1, 24, 168) then
    raise exception 'approve for 1 hour, 1 day or 1 week' using errcode = '22023';
  end if;
  update public.access_requests
     set status = case when p_approve then 'approved' else 'denied' end,
         decided_at = now(),
         expires_at = case when p_approve then now() + make_interval(hours => p_hours) end
   where id = p_id;
end $$;
revoke execute on function public.decide_access_request(uuid, boolean, integer) from public, anon;
grant execute on function public.decide_access_request(uuid, boolean, integer) to authenticated, service_role;

-- ── Whose time you can read ─────────────────────────────────────────────────
-- yourself; everyone for admins; the people below you in the line who have a lower level
-- (L2 → their L1s, L3 → their L2s and L1s); an L2 who approved your request, until it ends
create or replace function public.visible_user_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive
    me as (select id, role from public.profiles where id = auth.uid()),
    below (id) as (
      select p.id from public.profiles p where p.manager_id = auth.uid()
      union
      select p.id from public.profiles p join below b on p.manager_id = b.id
    ),
    rank_of (role, n) as (values ('l1'::public.app_role, 1), ('l2', 2), ('l3', 3), ('admin', 4))
  select id from me
  union
  select p.id from public.profiles p, me where me.role = 'admin'
  union
  select p.id from below b
    join public.profiles p on p.id = b.id
    join rank_of rp on rp.role = p.role
    cross join me join rank_of rm on rm.role = me.role
   where rm.n > rp.n
  union
  select r.owner_id from public.access_requests r
   where r.requester_id = auth.uid() and r.status = 'approved' and r.expires_at > now()
$$;
revoke execute on function public.visible_user_ids() from public, anon;
grant execute on function public.visible_user_ids() to authenticated, service_role;

-- reading follows visible_user_ids(); writing stays your own (unchanged)
drop policy if exists slots_select on public.time_slots;
create policy slots_select on public.time_slots for select to authenticated
  using (user_id in (select public.visible_user_ids()));

drop policy if exists work_days_select on public.work_days;
create policy work_days_select on public.work_days for select to authenticated
  using (user_id in (select public.visible_user_ids()));

drop policy if exists kanban_cards_select on public.kanban_cards;
create policy kanban_cards_select on public.kanban_cards for select to authenticated
  using (user_id in (select public.visible_user_ids()));

drop policy if exists kanban_moves_select on public.kanban_moves;
create policy kanban_moves_select on public.kanban_moves for select to authenticated
  using (user_id in (select public.visible_user_ids()));
