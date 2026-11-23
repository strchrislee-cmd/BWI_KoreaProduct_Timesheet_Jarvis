-- TimeCrumbs · user levels L1 / L2 / L3 instead of member / viewer, and personal aliases.
--
-- Roles are now admin (sees and edits everything) and the levels l1 / l2 / l3. For now the three
-- levels have the same rights: log and see your own time, read the shared master data, keep your
-- own settings. Level-specific rules (e.g. an L2 reading the L1s in their group) come later.
-- Existing members become L1 and viewers L2 (renaming keeps every stored value).

alter type public.app_role rename value 'member' to 'l1';
alter type public.app_role rename value 'viewer' to 'l2';
alter type public.app_role add value if not exists 'l3';

-- time, leave and work days: your own rows; admins everything (the old viewer read-all is gone)
drop policy slots_select on public.time_slots;
drop policy slots_write on public.time_slots;
create policy slots_select on public.time_slots for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy slots_write on public.time_slots for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy leave_select on public.leave_requests;
drop policy leave_write on public.leave_requests;
create policy leave_select on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy leave_write on public.leave_requests for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy work_days_select on public.work_days;
drop policy work_days_write on public.work_days;
create policy work_days_select on public.work_days for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy work_days_write on public.work_days for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy task_templates_write on public.task_templates;
create policy task_templates_write on public.task_templates for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- aliases: user_id null = team alias (admins add / remove, everyone uses it);
-- user_id set = that user's personal alias, used only for their own time (they and admins see it)
alter table public.project_aliases
  add column user_id uuid references public.profiles (id) on delete cascade;

drop index public.project_aliases_alias_key;
create unique index project_aliases_team_key on public.project_aliases (public.project_name_key(alias)) where user_id is null;
create unique index project_aliases_personal_key on public.project_aliases (user_id, public.project_name_key(alias)) where user_id is not null;

-- aliases members added so far become their personal aliases
update public.project_aliases a set user_id = a.created_by
 where a.created_by is not null
   and exists (select 1 from public.profiles p where p.id = a.created_by and p.role <> 'admin');

drop policy aliases_select on public.project_aliases;
drop policy aliases_insert on public.project_aliases;
drop policy aliases_delete on public.project_aliases;
create policy aliases_select on public.project_aliases for select to authenticated
  using (user_id is null or user_id = auth.uid() or public.is_admin());
create policy aliases_insert on public.project_aliases for insert to authenticated
  with check (created_by = auth.uid() and (user_id = auth.uid() or (user_id is null and public.is_admin())));
create policy aliases_delete on public.project_aliases for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
