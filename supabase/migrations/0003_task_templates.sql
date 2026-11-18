-- JARVIS · personal "repeated tasks" (Notion-style select options for the Daily Log grid)

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.slot_kind not null default 'work',
  group_project_id uuid references public.group_projects (id) on delete set null,
  label text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (btrim(label) <> '' or btrim(description) <> '')
);
create index task_templates_user_idx on public.task_templates (user_id, sort_order);

alter table public.task_templates enable row level security;

-- Only your own templates; viewers cannot create any
create policy task_templates_select on public.task_templates for select to authenticated
  using (user_id = auth.uid());
create policy task_templates_write on public.task_templates for all to authenticated
  using (user_id = auth.uid() and public.current_app_role() <> 'viewer')
  with check (user_id = auth.uid() and public.current_app_role() <> 'viewer');
