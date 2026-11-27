# 백업 (되돌아갈 수 있는 버전)

이름을 말하면 그 버전으로 되돌립니다. 커밋은 `claude/wizardly-wozniak-og2kdd` 브랜치에 그대로 남아 있습니다.

| 백업 이름 | 커밋 | 배포(그 버전 그대로) | 내용 |
|---|---|---|---|
| `backup-kanban-v1` | `5c73eb2` | `teamembedded-n1qnex2qm-chris-hobby.vercel.app` (Vercel에서 Promote to Production으로 바로 복귀 가능) | 2026-11-27 칸반 재설계 전. Daily Kanban: 고른 날짜의 카드만, 하루 되감기 슬라이더(위에 고정), Kanban Flow(카드별 상태 흐름), 팀원 카드·사람별 색·색 필터 / AI 정리·수정 제안 / 조직도·단계별 열람 |

되돌리는 방법(작업자용): `git checkout 5c73eb2 -- src api supabase tests README.md` 로 파일을 그 버전으로 되돌린 뒤 새 커밋(이력은 지우지 않음). DB 마이그레이션은 되돌리지 않습니다(0014까지 그대로 써도 그 버전은 동작).
