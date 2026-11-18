-- JARVIS · reference data that every installation needs.
-- MUST match src/domain/seed.ts (checked by tests/seed.test.ts).

insert into public.org_settings (id) values (1) on conflict (id) do nothing;

insert into public.group_projects (name, kind, system_key, counts_toward_total, sort_order) values
  ('00.Timelog--Change Requests (non-project) 변경 요청 대응 (프로젝트 외 업무)', 'timelog', null, true, 101),
  ('00.Timelog--Innovation / Pre-Project work (No project listed) 신규 기술 개발 및 프로젝트 착수 전 업무', 'timelog', null, true, 102),
  ('00.Timelog--Leave(휴가 및 휴무)', 'timelog', 'leave', true, 103),
  ('00.Timelog--Quality issue resolution & testing (Existing products) 기존 제품 품질 문제 해결 및 시험', 'timelog', null, true, 104),
  ('00.Timelog--Quotation Support (non-project) 견적 검토 및 지원 (프로젝트 외 업무)', 'timelog', null, true, 105),
  ('00.Timelog--Third Party Product Benchmarking 타사 제품 벤치마킹 및 분석', 'timelog', null, true, 106),
  ('00.Timelog--Training & Self Development 교육 및 자기계발', 'timelog', null, true, 107),
  ('일반업무(Mail발송, 미팅조율, 리소스정리, 개발 등)', 'local_section', 'general', true, 201),
  ('회의(개발, 품질, Gemba walk, etc..)', 'local_section', 'meeting', true, 202),
  ('Support (생산, SCM 등)', 'local_section', 'support', true, 203),
  ('금형 Support', 'local_section', 'mold_support', true, 204),
  ('Company Leave(회사지정휴가)', 'local_section', 'company_leave', true, 205),
  ('P&C(TownHall, plogging, 소방교육및훈련,청소)', 'local_section', 'pnc', true, 206),
  ('Biz Trip', 'local_section', 'biz_trip', false, 207);

insert into public.project_aliases (group_project_id, alias)
select id, a.alias
  from (values ('일반', 'general'), ('회의', 'meeting'), ('휴가', 'leave'), ('지원', 'support')) as a (alias, system_key)
  join public.group_projects gp on gp.system_key = a.system_key;
