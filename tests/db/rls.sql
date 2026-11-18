-- Behaviour tests for 0001_init.sql / 0002_seed.sql. Run via scripts/test-db.sh.
-- Users: a = admin (first user), c = member, d = viewer, e = member2

-- ── Seed ─────────────────────────────────────────────────────────────────────
select pg_temp.check((select count(*) from group_projects where kind = 'timelog') = 7, 'seed: 7 timelog rows');
select pg_temp.check((select count(*) from group_projects where kind = 'local_section') = 7, 'seed: 7 local sections');
select pg_temp.check((select count(*) from project_aliases) = 4, 'seed: 4 aliases');
select pg_temp.check((select count(*) from org_settings) = 1, 'seed: org settings row');

-- ── Sign-up rules ────────────────────────────────────────────────────────────
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'admin@example.com');
select pg_temp.check((select role from profiles where email = 'admin@example.com') = 'admin', 'first user becomes admin');

select pg_temp.expect_error(
  $$insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'stranger@example.com')$$,
  'uninvited sign-up is rejected');

insert into invitations (email, role) values
  ('member@example.com', 'member'), ('viewer@example.com', 'viewer'), ('member2@example.com', 'member');
select pg_temp.expect_error($$insert into invitations (email) values ('Mixed@Example.com')$$, 'invitation e-mails must be lower-case');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000c', 'member@example.com', '{"name":"Min"}'),
  ('00000000-0000-0000-0000-00000000000d', 'Viewer@Example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000e', 'member2@example.com', '{}');
select pg_temp.check((select role from profiles where lower(email) = 'viewer@example.com') = 'viewer', 'invited role applied (case-insensitive e-mail)');
select pg_temp.check((select name from profiles where email = 'member@example.com') = 'Min', 'name taken from metadata');
select pg_temp.check((select name from profiles where email = 'member2@example.com') = 'member2', 'name falls back to e-mail local part');
select pg_temp.check((select count(*) from invitations where status = 'accepted') = 3, 'invitations marked accepted');

-- ── Member ───────────────────────────────────────────────────────────────────
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000c');

select pg_temp.check(pg_temp.affected($$update profiles set name = 'Min Seo', work_start = '08:00' where id = '00000000-0000-0000-0000-00000000000c'$$) = 1, 'member edits own profile');
select pg_temp.expect_error($$update profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000c'$$, 'member cannot promote self');
select pg_temp.check(pg_temp.affected($$update profiles set name = 'x' where id = '00000000-0000-0000-0000-00000000000e'$$) = 0, 'member cannot edit others');
select pg_temp.check((select count(*) from profiles) = 4, 'member sees the team');

insert into time_slots (user_id, work_date, slot_index, label) values ('00000000-0000-0000-0000-00000000000c', '2026-11-16', 15, '일반');
select pg_temp.expect_error($$insert into time_slots (user_id, work_date, slot_index) values ('00000000-0000-0000-0000-00000000000e', '2026-11-16', 15)$$, 'member cannot write others'' slots');
insert into leave_requests (user_id, leave_type, start_date, end_date, hours_per_day) values ('00000000-0000-0000-0000-00000000000c', 'annual', '2026-11-20', '2026-11-20', 8);

select pg_temp.expect_error($$insert into group_projects (name, kind) values ('X', 'project')$$, 'member cannot add group projects');
select pg_temp.expect_error($$select apply_master_import('m.xlsx', 'manual', 'h0', '[]'::jsonb)$$, 'member cannot import master');
select pg_temp.check(pg_temp.affected($$update org_settings set ai_enabled = true where id = 1$$) = 0, 'member cannot change org settings');

insert into project_aliases (group_project_id, alias, created_by)
  select id, '워크램프', '00000000-0000-0000-0000-00000000000c' from group_projects where system_key = 'general';
select pg_temp.expect_error($$insert into project_aliases (group_project_id, alias, created_by) select id, 'x', '00000000-0000-0000-0000-00000000000a' from group_projects where system_key = 'general'$$, 'member cannot add alias as someone else');
select pg_temp.expect_error($$insert into project_aliases (group_project_id, alias, created_by) select id, ' 워크램프', '00000000-0000-0000-0000-00000000000c' from group_projects where system_key = 'meeting'$$, 'duplicate alias (same name key) rejected');
select pg_temp.check(pg_temp.affected($$delete from project_aliases where alias = '일반'$$) = 0, 'member cannot delete seeded alias');
select pg_temp.check((select count(*) from invitations) = 0, 'member cannot read invitations');

reset role;
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
insert into time_slots (user_id, work_date, slot_index, label) values ('00000000-0000-0000-0000-00000000000e', '2026-11-16', 16, '회의');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from time_slots) = 1, 'member only sees own slots');
select pg_temp.check((select count(*) from leave_requests) = 1, 'member sees own leave');

-- ── Viewer ───────────────────────────────────────────────────────────────────
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) from time_slots) = 2, 'viewer reads all slots');
select pg_temp.expect_error($$insert into time_slots (user_id, work_date, slot_index) values ('00000000-0000-0000-0000-00000000000d', '2026-11-16', 15)$$, 'viewer cannot write slots');
select pg_temp.expect_error($$insert into project_aliases (group_project_id, alias, created_by) select id, 'v', '00000000-0000-0000-0000-00000000000d' from group_projects where system_key = 'general'$$, 'viewer cannot add aliases');

-- ── Admin ────────────────────────────────────────────────────────────────────
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from time_slots) = 2, 'admin reads all slots');
select pg_temp.check(pg_temp.affected($$update time_slots set description = 'fixed' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 1, 'admin can fix others'' slots');
select pg_temp.check(pg_temp.affected($$update profiles set role = 'viewer', can_export = false where id = '00000000-0000-0000-0000-00000000000e'$$) = 1, 'admin changes roles');
select pg_temp.expect_error($$update profiles set role = 'member' where id = '00000000-0000-0000-0000-00000000000a'$$, 'last admin cannot be demoted');
select pg_temp.check(pg_temp.affected($$update org_settings set ai_enabled = true where id = 1$$) = 1, 'admin changes org settings');
select pg_temp.check(pg_temp.affected($$delete from project_aliases where alias = '워크램프'$$) = 1, 'admin deletes any alias');

-- master import: baseline
select pg_temp.check(
  (select r ->> 'status' = 'imported' and (r ->> 'is_baseline')::boolean and (r ->> 'added')::int = 2 and (r ->> 'missing')::int = 6
     from (select apply_master_import('m1.xlsx', 'manual', 'hash1',
       '[{"name":"2041--Utility Work Lamps","code":"2041","kind":"project"},
         {"name":"LED Bar Redesign","code":null,"kind":"project"},
         {"name":"00.Timelog--Leave(휴가 및 휴무)","code":null,"kind":"timelog"}]'::jsonb) as r) x),
  'baseline import: 2 added, seeded timelog matched, 6 unseen timelog rows missing');

-- second import: rename by code, new project, one dropped
select pg_temp.check(
  (select r ->> 'status' = 'imported' and not (r ->> 'is_baseline')::boolean and (r ->> 'added')::int = 1
          and (r ->> 'missing')::int = 1 and r -> 'added_names' = '["2071 -- Marine Flood Light"]'::jsonb
     from (select apply_master_import('m2.xlsx', 'manual', 'hash2',
       '[{"name":"2041--Utility Work Lamp Series","code":"2041","kind":"project"},
         {"name":"00.Timelog--Leave(휴가 및 휴무)","code":null,"kind":"timelog"},
         {"name":"2071 -- Marine Flood Light","code":"2071","kind":"project"}]'::jsonb) as r) x),
  'second import: 1 added, 1 missing');
select pg_temp.check((select name from group_projects where code = '2041') = '2041--Utility Work Lamp Series', 'renamed project keeps identity');
select pg_temp.check((select status from group_projects where name = 'LED Bar Redesign') = 'missing', 'dropped project marked missing');
select pg_temp.check(
  (select gp.first_seen_import_id = mi.id from group_projects gp, master_imports mi where gp.code = '2071' and mi.content_hash = 'hash2'),
  'new project linked to the import that introduced it');
select pg_temp.check(
  (select apply_master_import('m2-again.xlsx', 'ingest', 'hash2', '[]'::jsonb) ->> 'status') = 'duplicate',
  'same file twice is a no-op');
select pg_temp.check((select count(*) from group_projects where kind = 'local_section' and status = 'active') = 7, 'local sections untouched by imports');

reset role;
-- service role (auth.uid() null) may import, like /api/ingest
select pg_temp.login('');
select pg_temp.check(
  (select apply_master_import('m3.xlsx', 'ingest', 'hash3', '[{"name":"2041--Utility Work Lamp Series","code":"2041","kind":"project"}]'::jsonb) ->> 'status') = 'imported',
  'service role can import');
