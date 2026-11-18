import type { GroupProject, SystemKey } from './types.js'

// Reference rows that exist in every installation.
// MUST match supabase/migrations/0002_seed.sql (checked in tests/seed.test.ts).

type SeedProject = Pick<GroupProject, 'name' | 'kind' | 'system_key' | 'counts_toward_total' | 'sort_order'>

export const SEED_PROJECTS: SeedProject[] = [
  { kind: 'timelog', sort_order: 101, system_key: null, counts_toward_total: true, name: '00.Timelog--Change Requests (non-project) 변경 요청 대응 (프로젝트 외 업무)' },
  { kind: 'timelog', sort_order: 102, system_key: null, counts_toward_total: true, name: '00.Timelog--Innovation / Pre-Project work (No project listed) 신규 기술 개발 및 프로젝트 착수 전 업무' },
  { kind: 'timelog', sort_order: 103, system_key: 'leave', counts_toward_total: true, name: '00.Timelog--Leave(휴가 및 휴무)' },
  { kind: 'timelog', sort_order: 104, system_key: null, counts_toward_total: true, name: '00.Timelog--Quality issue resolution & testing (Existing products) 기존 제품 품질 문제 해결 및 시험' },
  { kind: 'timelog', sort_order: 105, system_key: null, counts_toward_total: true, name: '00.Timelog--Quotation Support (non-project) 견적 검토 및 지원 (프로젝트 외 업무)' },
  { kind: 'timelog', sort_order: 106, system_key: null, counts_toward_total: true, name: '00.Timelog--Third Party Product Benchmarking 타사 제품 벤치마킹 및 분석' },
  { kind: 'timelog', sort_order: 107, system_key: null, counts_toward_total: true, name: '00.Timelog--Training & Self Development 교육 및 자기계발' },
  { kind: 'local_section', sort_order: 201, system_key: 'general', counts_toward_total: true, name: '일반업무(Mail발송, 미팅조율, 리소스정리, 개발 등)' },
  { kind: 'local_section', sort_order: 202, system_key: 'meeting', counts_toward_total: true, name: '회의(개발, 품질, Gemba walk, etc..)' },
  { kind: 'local_section', sort_order: 203, system_key: 'support', counts_toward_total: true, name: 'Support (생산, SCM 등)' },
  { kind: 'local_section', sort_order: 204, system_key: 'mold_support', counts_toward_total: true, name: '금형 Support' },
  { kind: 'local_section', sort_order: 205, system_key: 'company_leave', counts_toward_total: true, name: 'Company Leave(회사지정휴가)' },
  { kind: 'local_section', sort_order: 206, system_key: 'pnc', counts_toward_total: true, name: 'P&C(TownHall, plogging, 소방교육및훈련,청소)' },
  { kind: 'local_section', sort_order: 207, system_key: 'biz_trip', counts_toward_total: false, name: 'Biz Trip' },
]

export const SEED_ALIASES: { alias: string; system_key: SystemKey }[] = [
  { alias: '일반', system_key: 'general' },
  { alias: '회의', system_key: 'meeting' },
  { alias: '휴가', system_key: 'leave' },
  { alias: '지원', system_key: 'support' },
]
