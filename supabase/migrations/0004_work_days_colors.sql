-- JARVIS · per-day work hours and user-chosen colors

-- Start/end of a working day (the Daily Log shows these rows). Without a row the
-- profile's work_start / work_end are used.
create table public.work_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null check (end_time ~ '^\d{2}:\d{2}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, work_date),
  check (end_time > start_time and end_time <= '24:00')
);

alter table public.work_days enable row level security;

-- same rules as time_slots: own rows (not viewers); admins everything; viewers read everything
create policy work_days_select on public.work_days for select to authenticated
  using (user_id = auth.uid() or public.current_app_role() in ('admin', 'viewer'));
create policy work_days_write on public.work_days for all to authenticated
  using ((user_id = auth.uid() and public.current_app_role() <> 'viewer') or public.is_admin())
  with check ((user_id = auth.uid() and public.current_app_role() <> 'viewer') or public.is_admin());

create trigger work_days_touch before update on public.work_days
  for each row execute function public.touch_updated_at();

-- Optional color per repeated task (#RRGGBB). Category colors and the saved palette
-- are personal preferences in profiles.preferences ({ categoryColors, palette }).
alter table public.task_templates
  add column color text check (color ~ '^#[0-9A-Fa-f]{6}$');
