# BWI Korea Product · TimeCrumbs

**TimeCrumbs**(시간 부스러기, 이전 이름 JARVIS)는 사내 그룹웨어 헬퍼 웹앱의 첫 모듈 **Timesheets**입니다(데모: https://timecrumbs.vercel.app). 30분 단위 업무 기록을 그룹 지정 프로젝트명으로 매핑해 **그룹 timesheet 포맷**과 **업무진행세부계획(주간계획)**을 만들고, 새 그룹 프로젝트가 생기면 알려 줍니다.

- UI 컨셉과 요구사항: [`concept-design/`](./concept-design/README.md), 압축 컨텍스트: [`concept-design/CONTEXT.md`](./concept-design/CONTEXT.md)
- 날짜별 작업 기록(작업 내용·결과): [`docs/worklog/`](./docs/worklog/README.md)
- 스택: React 19 + Vite + TypeScript · Tailwind v4 · Supabase(Postgres, Auth, RLS) · ExcelJS · Vercel(정적 호스팅 + `/api` 함수)

## 1단계에 들어간 기능

| 화면 | 기능 |
|---|---|
| **Daily Log** | 엑셀/노션식 30분 그리드(카테고리, 업무, **업무내용**(자유 메모)), 자동 저장. 기본 행 높이 '좁게'로 하루가 한 화면에 들어오고, 넓은 화면에서는 카드가 왼쪽 메뉴 높이에 맞춰짐. 날짜별 시작(07:00–10:00)·종료 시간, 카테고리·반복 업무 색상 지정. 여러 칸 선택 후 한 번에 입력, 엑셀과 Ctrl+C/V 호환, 되돌리기. 카테고리·업무는 노션식 드롭다운(옵션 선택 또는 생성, 옵션별 `…` 메뉴, 이름·생성일 정렬, 드래그 이동). **반복 업무** 등록 후 칩/드롭다운으로 적용. 열 너비·행 높이 조절. 점심시간은 기본 '점심'(변경 가능). 신규 프로젝트 알림, 미매핑 카테고리 즉시 매핑 |
| **알림** | 근무시간 중 30분마다 브라우저 알림(비어 있는 칸만, 점심·주말 제외). Settings에서 켜기 |
| **스마트폰** | 화면 폭 768px 미만이면 휴대폰 화면: 아래 탭 바(Home·Timesheets·Admin·Settings), 30분 기록은 칸을 누르면 아래에서 올라오는 입력 창(카테고리 검색·반복 업무 칩·Task·업무내용·이어서 N칸 채우기·저장 후 다음 칸). 오늘이면 지금 칸으로 자동 스크롤. 모든 화면이 옆 스크롤 없이 들어감(넓은 표는 카드 안에서 스크롤) |
| **화면 스타일·배경** | 블러(기본) 또는 **리퀴드 글래스**(맑은 유리, Chrome·Edge에서는 가장자리가 휘어 보임). 배경은 무작위 그라데이션(기본, WebGL로 **물결처럼 흐름**, 속도 3단계·Settings에서 실시간 미리보기), 내 사진 업로드, Unsplash 오늘의 사진(키 설정 시) 중 선택. 모서리는 아이폰 같은 작은 R(카드 16 · 메뉴 12 · 버튼 10 · 칩 6px). 폰트: 본문 Pretendard, 제목·큰 숫자 Bricolage Grotesque, 시간 JetBrains Mono(앱에 포함) |
| **Import 마법사** | 개인 30분 로그 .xlsx(시트 1개 = 하루, `날짜` 행이나 시트명에서 날짜 인식) → 담당자 지정 → 로컬 카테고리 매핑 → 일괄 저장 |
| **Weekly Plan** | 연속된 같은 업무를 1행으로 병합. 기존 주간계획 9개 열 + Group Project 열로 .xlsx 내보내기 |
| **Group Timesheet** | 그룹 시트와 같은 행 구성(프로젝트 → 00.Timelog → 일반업무·회의… → Individual Sum). 일별 검증(목표시간, 미입력, 미매핑). .xlsx 내보내기 |
| **Projects** | 그룹 마스터 시트 업로드 → 미리보기(신규, 일치, 빠진 항목) → 반영. **첫 업로드는 기준선**이라 NEW로 표시하지 않음. 같은 파일을 다시 올리면 무시. 로컬 별칭(팀 공용) 관리. **관리자는 프로젝트를 직접 추가·삭제(숨김)·되돌리기**, 누구나 **개인 색상** 지정(Daily Log와 연동) |
| **Leave** | 월간 캘린더와 휴가 신청. 연차·반차·병가는 `00.Timelog--Leave`, 회사지정휴가와 출장은 각자의 행에 자동 반영 |
| **Settings** | 프로필, 엔지니어 코드, 근무시간, 목표시간, 템플릿 스타일, 조직 AI 설정(관리자) |
| **Admin** | 사용자 초대(이메일), 역할(Admin/Member/Viewer), 내보내기 권한, 초대 취소 |
| **Home** | 요청대로 위젯 자리만 있음(내용 미정) |
| **`/api/ingest`** | Power Automate가 마스터 .xlsx를 POST하면 자동으로 반영(토큰 인증, 중복 파일 무시) |

2단계로 미룬 것: AI 매핑 제안, 엑셀 템플릿 3종 다운로드, 신규 프로젝트 메일 알림, 관리자용 팀 매트릭스(하루 × 전원) 내보내기.

## 로컬 실행

```bash
npm install
```

```bash
npm run dev
```

`.env`에 Supabase 값이 없으면 **데모 모드**로 실행됩니다. 데이터는 그 브라우저(localStorage)에만 저장되고, 로그인 없이 관리자 권한으로 모든 화면을 써볼 수 있습니다.

| 명령 | 내용 |
|---|---|
| `npm test` | 도메인 로직, 엑셀 입출력, ingest 핸들러 단위 테스트(Vitest) |
| `npm run test:db` | 마이그레이션을 임시 로컬 Postgres(15+)에 적용하고 권한(RLS)·트리거·마스터 반영 동작 테스트 |
| `npm run typecheck` / `npm run build` | 타입 검사 / 프로덕션 빌드 |

## 운영 설정

### 1. Supabase
1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다(리전: Seoul `ap-northeast-2` 권장).
2. **SQL Editor**에서 `supabase/migrations/`의 SQL 파일(`0001_init.sql` → `0002_seed.sql` → `0003_task_templates.sql` → `0004_work_days_colors.sql` → `0005_user_backgrounds.sql` → `0006_project_manage.sql` → `0007_slot_details.sql`)을 **번호 순서대로** 실행합니다. Supabase CLI를 쓴다면 `supabase db push`도 됩니다. 이미 앞 파일을 실행했다면 새로 추가된 파일만 실행하면 됩니다.
3. **Authentication → URL Configuration**: Site URL과 Redirect URL에 Vercel 주소를 넣습니다.
4. **Authentication → SMTP Settings**: **외부 SMTP를 반드시 연결**하세요. 기본 발송기는 시간당 2통, 그것도 Supabase 팀 멤버에게만 보냅니다. 회사 SMTP나 Resend·Brevo 등을 쓰면 됩니다.
5. (권장) Authentication → Providers → Email에서 공개 가입(Allow new users to sign up)을 끕니다. 이걸 켜 두더라도 DB 트리거가 **초대받지 않은 가입을 거부**합니다.
6. **첫 관리자 만들기**: Authentication → Users → **Invite user**로 본인 이메일을 초대합니다. **처음 생성되는 계정은 자동으로 Admin**이 되고, 이후 사용자는 TimeCrumbs Admin 화면에서 초대합니다.

> 무료 플랜: DB 500 MB, 일주일간 접속이 없으면 프로젝트 일시정지, 자동 백업 없음. 시범 운영은 무료로 하고 정식 운영 때 Pro로 올리길 권합니다.

### 2. Vercel
1. 이 레포를 Import합니다. Framework는 Vite로 자동 인식되고, 함수 리전은 `vercel.json`에 서울(`icn1`)로 지정돼 있습니다.
2. **Environment Variables** (`.env.example` 참고):

| 변수 | 값 | 노출 |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | 브라우저 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면(service_role 키) | 서버 전용 |
| `INGEST_TOKEN` | 임의의 긴 비밀값 | 서버 전용 |
| `APP_URL` | 배포 주소(초대 메일이 돌아올 곳) | 서버 전용 |
| `UNSPLASH_ACCESS_KEY` (선택) | [unsplash.com/developers](https://unsplash.com/developers)에서 앱을 만들면 무료 발급. 없으면 Unsplash 배경만 꺼지고 그라데이션·내 사진은 그대로 동작 | 서버 전용 |
| `UNSPLASH_QUERY` (선택) | 오늘의 사진 검색어(기본 `nature landscape`). 결과는 한국 자정까지 캐시되어 하루 1회 정도만 호출 | 서버 전용 |

> Vercel Hobby(무료) 플랜은 약관상 개인·비상업 용도 전용입니다. 사내 업무용은 **Pro 플랜**이 필요합니다.

### 3. Power Automate → `/api/ingest` (선택)
1. 트리거: SharePoint **When a file is created or modified (properties only)**. 마스터 파일이 있는 라이브러리/폴더를 지정하고, 필요하면 파일명 조건을 추가합니다.
2. SharePoint **Get file content**
3. **HTTP** 액션(Premium 커넥터):
   - Method `POST`, URI `https://<배포 주소>/api/ingest`
   - Headers: `x-timecrumbs-token: <INGEST_TOKEN>`(예전 이름 `x-jarvis-token`도 계속 받음), `Content-Type: application/octet-stream`, `x-file-name: <파일명>`
   - Body: 2번의 File Content
   - 설정에서 **Secure inputs**를 켜서 실행 기록에 토큰이 남지 않게 합니다.
4. 응답 예: `{"status":"imported","added":1,"added_names":["…"],"missing":0,"rows":28}`. 같은 파일이 다시 오면 `"duplicate"`가 반환되고 아무것도 바뀌지 않습니다.

> Premium 라이선스가 없으면 Projects 화면에서 수동으로 올리면 됩니다. 신규 감지 로직은 똑같습니다. 회사 데이터를 Microsoft 365 밖으로 보내는 것은 사내 보안 정책을 먼저 확인하세요.

## Daily Log 사용법

| 동작 | 방법 |
|---|---|
| 여러 칸 선택 | 클릭 후 드래그, Shift+클릭, Shift+방향키. 시간 칸을 누르면 행 전체, Ctrl+A는 전체 |
| 입력 | 칸을 고르고 바로 타이핑(한글 가능) → Enter. **여러 칸을 선택했으면 전부에 적용** |
| 드롭다운 | Enter / F2 / 더블클릭 / ▾. 입력하면 걸러지고, ↑↓로 고른 뒤 Enter. 카테고리는 별칭으로도 검색. 목록에 없으면 맨 아래 **+ “입력값” 생성** |
| 옵션 메뉴 | 옵션 오른쪽 `…`: 반복 업무는 이름 변경·삭제·색, 카테고리는 색(이름은 그룹 마스터에서 관리) |
| 정렬·순서 | 드롭다운 위 입력칸 오른쪽 `…` → 수동 / 이름순 / 이름 역순 / 생성일순 / 최신순. 옵션 왼쪽 ⋮⋮ 손잡이나 반복 업무 칩을 끌면 순서가 바뀌고 정렬은 ‘수동’이 됨 |
| 열 너비·행 높이 | 헤더의 Time·Category 경계선을 끌어 조절(더블클릭하면 기본값). 표 아래의 좁게(기본)/보통/넓게로 행 높이 선택 |
| 업무내용 | 맨 오른쪽 칸에 그 30분 동안 한 일을 자유롭게 적음(최대 2000자). 예전 몰입도(0–3) 칸은 화면에서 빠졌고, 저장돼 있던 값은 그대로 보관 |
| 복사·붙여넣기 | Ctrl+C / Ctrl+X / Ctrl+V. 엑셀·구글시트와 서로 주고받을 수 있음. 값 하나를 범위에 붙여넣으면 전체가 채워짐 |
| 지우기 / 채우기 / 되돌리기 | Delete(또는 Backspace) / Ctrl+D(맨 윗행을 아래로) / Ctrl+Z |
| 이동 | 방향키, Tab / Shift+Tab, Esc는 편집 취소 |
| 반복 업무 | 행을 고르고 오른쪽 **반복 업무 → 선택한 행 저장**, 또는 Task 칸 드롭다운의 **+ 반복 업무로 등록**. 칩을 누르면 선택한 행에 카테고리+업무가 함께 들어감. 개인별로 저장 |
| 점심 | Settings의 점심시간(기본 12:00–13:00)은 '점심 (기본)'으로 표시됨. 다른 값을 넣으면 그 값이 우선하고, 지우면 다시 점심 |
| 현재 시간 | 오늘 날짜를 보면 지금 시각 위치에 빨간 선과 `10:17` 같은 시각이 표시되고 1분마다 움직임 |
| 근무 시간 | 30-min Log 위의 **시작 → 종료**를 날짜별로 고름. 시작은 07:00–10:00(30분 단위). 시작을 바꾸면 종료는 **시작 + 근무 8h + 점심 1h**(점심이 그 사이에 있을 때)로 맞춰지고, 그 뒤로 늘릴 수 있음(“+1h 연장” 표시). 새 날짜의 기본값은 Settings → Work hours |
| 색상 | 드롭다운 옵션·반복 업무 칩의 `…`, Projects → Project mapping의 색상 칸, 또는 Settings → **카테고리 색상**(모두 같은 개인 색상). **랜덤 / 랜덤 (파스텔)**, 노션 9색, RGB/Hex/색상환으로 직접 지정. **프리셋에 저장**한 색은 “내 색상”에 보관. **기본**으로 되돌리기. 개인별 설정 |
| 알림 | Settings → **알림**에서 켜고 브라우저 권한 허용. 근무시간 중 :00·:30마다 직전 칸이 비어 있으면 알림(점심·주말 제외). TimeCrumbs 탭이 열려 있어야 함 |
| 화면 스타일·글꼴 | Settings → **화면 스타일**: 블러(기본) / 리퀴드 글래스, **글꼴**: Pretendard(기본) / IBM Plex Sans KR / 고운돋움 / 나눔명조(고를 때만 내려받음). 드롭다운·메뉴·창은 항상 불투명 |
| 배경 | Settings → **배경**: 무작위 그라데이션(매일 자동 또는 고정). **물결처럼 흐르기**를 켜면 물결 모양 색 띠가 화면 오른쪽에서 왼쪽으로 흐르고, 물결 모양은 패턴마다 다름. 속도 느리게 24초 / 보통 12초(기본) / 빠르게 6초 = 물결이 화면을 지나가는 시간, 미리보기에 바로 반영. 내 사진 업로드, Unsplash 오늘의 사진(키 설정 시)도 가능. 다른 탭을 보는 동안과 OS ‘동작 줄이기’가 켜져 있으면 멈춤 |
| 프로젝트 추가·삭제 | Projects → Project mapping(관리자). 이름과 종류를 넣고 **추가**. 🗑 → 마스터 시트에서 온 항목은 **숨김**(기존 기록 유지, 다시 올려도 NEW 안 뜸, **숨긴 항목 보기 → 되돌리기**), 직접 추가한 항목은 확인 후 삭제(이미 쓰였으면 숨김). 기본 항목(휴가·회의 등)은 삭제 불가. Section과 직접 추가한 항목은 ✏로 **이름 변경**(관리자). 마스터 시트에서 온 이름은 시트를 따름 |

Mac에서는 Ctrl 대신 ⌘를 씁니다.

## 권한

| 역할 | 할 수 있는 일 |
|---|---|
| Admin | 전원 기록 조회·수정, 마스터 업로드, 사용자 초대와 역할 변경, 조직 설정. 마지막 Admin은 강등할 수 없음 |
| Member | 본인 기록과 휴가, 팀 공용 별칭 추가(본인이 만든 것만 삭제) |
| Viewer | 전원 기록 읽기 전용 |

모든 권한은 Postgres RLS로 강제되며, `tests/db/rls.sql`에서 검증합니다.

## 구조

```
api/                     Vercel 함수: ingest.ts, admin/invite.ts, _lib/ (공용, 라우트 아님)
src/domain/              순수 로직: 슬롯·주차, 프로젝트명 매칭, 주간계획/그룹 집계, 시드
src/excel/               ExcelJS 읽기(마스터, 개인 로그) / 쓰기(그룹 포맷, 주간계획)
src/data/                DataStore 인터페이스 + SupabaseStore / LocalStore(데모)
src/pages/               화면 (timesheets/*, Settings, Admin, Login, Home)
supabase/migrations/     스키마 + RLS + 트리거 + apply_master_import(), 시드
tests/                   Vitest 단위 테스트, tests/db/ (SQL 동작 테스트)
```

`src/domain`, `src/excel`은 Vercel 함수(Node ESM)도 import하므로 상대 경로에 `.js` 확장자를 붙입니다.
