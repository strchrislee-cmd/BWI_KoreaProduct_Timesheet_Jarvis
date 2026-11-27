-- TeamEmbedded · Daily Kanban: one card per task (Project · Type · Task) on a personal board with the
-- columns Backlog, ToDo, Wait, Doing, DoneCheck, Done. The Daily Log moves cards (the task logged now
-- goes to Doing, the one before it to Wait); people move them too. Every move is kept in
-- kanban_moves so the journey of a task (e.g. Doing > Wait > Doing …) can be looked at later.

do $$ begin
  create type public.kanban_status as enum ('backlog', 'todo', 'wait', 'doing', 'donecheck', 'done');
exception when duplicate_object then null; end $$;

create table if not exists public.kanban_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_project_id uuid references public.group_projects (id) on delete set null,
  -- the project text as typed when it is not mapped to a group project yet
  label text not null default '',
  work_type_id uuid references public.work_types (id) on delete set null,
  -- the Task
  description text not null default '',
  status public.kanban_status not null default 'backlog',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- when it last reached Done (null while it is not done)
  done_at timestamptz,
  check (group_project_id is not null or btrim(label) <> '' or btrim(description) <> '')
);
-- one card per task and person
create unique index if not exists kanban_cards_task_key on public.kanban_cards (
  user_id,
  coalesce(group_project_id::text, ''),
  (case when group_project_id is null then btrim(label) else '' end),
  coalesce(work_type_id::text, ''),
  btrim(description)
);
create index if not exists kanban_cards_board_idx on public.kanban_cards (user_id, status, sort_order);

create table if not exists public.kanban_moves (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.kanban_cards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- null = the card was just made
  from_status public.kanban_status,
  to_status public.kanban_status not null,
  -- manual = moved on the board, log = moved by the Daily Log
  reason text not null default 'manual' check (reason in ('manual', 'log')),
  moved_at timestamptz not null default now()
);
create index if not exists kanban_moves_card_idx on public.kanban_moves (card_id, moved_at);

-- your own board; admins can look at everyone's
alter table public.kanban_cards enable row level security;
drop policy if exists kanban_cards_select on public.kanban_cards;
create policy kanban_cards_select on public.kanban_cards for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists kanban_cards_write on public.kanban_cards;
create policy kanban_cards_write on public.kanban_cards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.kanban_moves enable row level security;
drop policy if exists kanban_moves_select on public.kanban_moves;
create policy kanban_moves_select on public.kanban_moves for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists kanban_moves_insert on public.kanban_moves;
create policy kanban_moves_insert on public.kanban_moves for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.kanban_cards c where c.id = card_id and c.user_id = auth.uid()));

-- same privileges as the other tables (0010): signed-in users through RLS, nothing for anon.
-- Moves are a history: they are added, never changed (deleting a card removes its moves).
revoke all on public.kanban_cards, public.kanban_moves from anon;
grant select, insert, update, delete on public.kanban_cards to authenticated, service_role;
grant select, insert on public.kanban_moves to authenticated;
grant select, insert, update, delete on public.kanban_moves to service_role;
