# BWI Korea Product · TeamEmbedded

**TeamEmbedded**(Gods of Team Embedded, 이전 이름 TimeCrumbs · JARVIS)는 사내 그룹웨어 헬퍼 웹앱의 첫 모듈 **Timesheets**입니다(데모: https://teamembedded.vercel.app, 예전 주소 timecrumbs.vercel.app은 자동 이동). 30분 단위 업무 기록을 그룹 지정 프로젝트명으로 매핑해 **그룹 timesheet 포맷**과 **업무진행세부계획(주간계획)**을 만들고, 새 그룹 프로젝트가 생기면 알려 줍니다.

- UI 컨셉과 요구사항: [`concept-design/`](./concept-design/README.md), 압축 컨텍스트: [`concept-design/CONTEXT.md`](./concept-design/CONTEXT.md)
- 날짜별 작업 기록(작업 내용·결과): [`docs/worklog/`](./docs/worklog/README.md)
- 스택: React 19 + Vite + TypeScript · Tailwind v4 · Supabase(Postgres, Auth, RLS) · ExcelJS · Vercel(정적 호스팅 + `/api` 함수)

## 1단계에 들어간 기능

| 화면 | 기능 |
|---|---|
| **Daily Log** | 엑셀/노션식 30분 그리드(영문 Time · Category · MID · Sub Category · Content / 한국어 시간 · 대분류 · 중분류 · 업무분류 · 업무내용(자유 메모)), 자동 저장. **MID(중분류)**는 일의 종류(개발-신규, 지원-8D, 회의-INT 등)로 선택 사항이며 목록은 관리자가 Projects 화면에서 관리. 행 앞 **+**를 누르면 그 행의 대분류·MID·업무분류가 반복 업무로 추가(업무내용·시간 제외). 엑셀에서 대분류 칸에 2~3칸을 붙이면 예전처럼 대분류·업무분류(·업무내용)로 들어가고, 4칸이면 MID 포함 순서대로(Daily Log 안에서 복사한 것은 같은 칸 순서로). 대분류 드롭다운의 각 프로젝트 왼쪽에 Project mapping의 **No** 표시. 기본 행 높이 '좁게'로 하루가 한 화면에 들어오고, 넓은 화면에서는 카드가 창 아래까지 채움. 오른쪽 **Today** 카드는 제목줄을 끌어 떼어 내 띄울 수 있고, 오른쪽 끝에 놓으면 자석처럼 다시 붙음(위치는 브라우저에 기억). 날짜별 시작(07:00–10:00)·종료 시간, 카테고리·반복 업무 색상 지정. 여러 칸 선택 후 한 번에 입력, 엑셀과 Ctrl+C/V 호환, 되돌리기. 카테고리·업무는 노션식 드롭다운(옵션 선택 또는 생성, 옵션별 `…` 메뉴, 이름·생성일 정렬, 드래그 이동). **반복 업무** 등록 후 칩/드롭다운으로 적용. 열 너비·행 높이 조절. 점심시간은 기본 '점심'(변경 가능). 신규 프로젝트 알림, 미매핑 카테고리 즉시 매핑 |
| **알림** | 근무시간 중 30분마다 브라우저 알림(비어 있는 칸만, 점심·주말 제외). Settings에서 켜기 |
| **스마트폰** | 화면 폭 768px 미만이면 휴대폰 화면: 아래 탭 바(Home·Timesheets·Admin·Settings), 30분 기록은 칸을 누르면 아래에서 올라오는 입력 창(카테고리 검색·반복 업무 칩·Task·업무내용·이어서 N칸 채우기·저장 후 다음 칸). 오늘이면 지금 칸으로 자동 스크롤. 모든 화면이 옆 스크롤 없이 들어감(넓은 표는 카드 안에서 스크롤) |
| **화면 스타일·배경** | 블러(기본) 또는 **리퀴드 글래스**(맑은 유리, Chrome·Edge에서는 가장자리가 휘어 보임). **패널 불투명도 슬라이더**(스타일마다 따로 저장). 배경은 무작위 그라데이션(기본, WebGL로 하늘에서 내려다본 바다처럼 **오른쪽 → 왼쪽으로 한 방향 흐름**, 속도 3단계·Settings에서 실시간 미리보기), 내 사진 업로드, Unsplash 오늘의 사진(키 설정 시) 중 선택. 모서리는 아이폰 같은 작은 R(카드 16 · 메뉴 12 · 버튼 10 · 칩 6px). 폰트: 본문 Pretendard, 제목·큰 숫자 Bricolage Grotesque, 시간 JetBrains Mono(앱에 포함) |
| **Import 마법사** | 개인 30분 로그 .xlsx(시트 1개 = 하루, `날짜` 행이나 시트명에서 날짜 인식) → 담당자 지정 → 로컬 카테고리 매핑 → 일괄 저장 |
| **Weekly Result** (이전 이름 Weekly Plan) | 연속된 같은 업무(대분류·MID·업무분류가 같은 칸)를 1행으로 병합. Local Project는 Daily Log의 Category와 같은 이름·색으로 표시. Work 열은 MID가 있으면 MID, 없으면 회의/기타(화면·엑셀 모두). 기존 주간계획 9개 열 + Group Project 열로 .xlsx 내보내기 |
| **Group Timesheet** | 그룹 시트와 같은 행 구성(프로젝트 → 00.Timelog → 일반업무·회의… → Individual Sum). 일별 검증(목표시간, 미입력, 미매핑). .xlsx 내보내기 |
| **Projects** | 그룹 마스터 시트 업로드 → 미리보기(신규, 일치, 빠진 항목) → 반영. **첫 업로드는 기준선**이라 NEW로 표시하지 않음. 같은 파일을 다시 올리면 무시. 별칭: 관리자가 넣은 **팀 별칭**(모두에게 적용, L1–L3에는 🔒 수정 불가)과 각자 넣는 **내 별칭**(나에게만 적용). L1–L3에게는 프로젝트 목록이 '관리자 설정 · 수정 불가'로 보임. **관리자는 프로젝트를 직접 추가·삭제(숨김)·되돌리기**, 누구나 **개인 색상** 지정(Daily Log와 연동) |
| **Leave** | 월간 캘린더와 휴가 신청. 연차·반차·병가는 `00.Timelog--Leave`, 회사지정휴가와 출장은 각자의 행에 자동 반영 |
| **Settings** | 프로필, 엔지니어 코드, 근무시간, 목표시간, 템플릿 스타일, 조직 AI 설정(관리자) |
| **Admin** | 사용자 초대(이메일), 등급(Admin / L1 / L2 / L3), 내보내기 권한, 초대 취소 |
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
| `npm run test:e2e` | 브라우저 테스트(Playwright·Chromium). 데모 빌드와 가상 Supabase 빌드를 띄우고 `tests/e2e/*.e2e.cjs`를 모두 실행. `npm run test:e2e -- batchL batchM`처럼 이름을 주면 그것만 |
| `REPORT=1 npm run test:e2e -- batchL` | 위와 같고, 검증 보고서도 만듭니다(아래) |

### 검증 보고서 (`docs/test-reports/`)
기능마다 **무엇을 확인했고 어떻게 PASS로 판정했는지**를 남긴 HTML입니다. `docs/test-reports/index.html`이 목록이고, 기능별 폴더에 보고서와 증적 화면이 있습니다.
- 머리말: 날짜, 확인한 커밋, 테스트 파일(스위트), 브라우저·화면 크기.
- 요청과 인수 기준(통과 조건), 테스트 케이스 표(기대 결과 / 실제 결과 / 판정 근거 / PASS·FAIL).
- 주석 스크린샷: 확인한 요소에 빨간 테두리와 테스트 케이스 번호. 표의 번호를 누르면 그 화면으로 갑니다.
- 끝에 용어 설명(테스트 케이스, 인수 기준, 단언, 증적, 회귀 테스트 등).

보고서를 만드는 테스트는 `tests/e2e/report.cjs`의 `report.check({ name, expected, actual, how, pass })`와 `report.shot(page, { caption, marks })`로 씁니다(예: `tests/e2e/batchL.e2e.cjs`). 날짜를 정하려면 `REPORT_DATE=2026-11-26`. 레포가 공개이므로 데모·가상 데이터만 씁니다. 실제 마스터 파일을 쓰는 예전 테스트 3개(batchD/F/G)는 레포에 넣지 않았습니다.

## 운영 설정

### 1. Supabase
1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다(리전: Seoul `ap-northeast-2` 권장).
2. **SQL Editor**에서 `supabase/migrations/`의 SQL 파일(`0001_init.sql` → `0002_seed.sql` → `0003_task_templates.sql` → `0004_work_days_colors.sql` → `0005_user_backgrounds.sql` → `0006_project_manage.sql` → `0007_slot_details.sql` → `0008_project_edit.sql` → `0009_levels_personal_aliases.sql` → `0010_api_privileges.sql` → `0011_work_types.sql`)을 **번호 순서대로** 실행합니다. Supabase CLI를 쓴다면 `supabase db push`도 됩니다. 이미 앞 파일을 실행했다면 새로 추가된 파일만 실행하면 됩니다.
3. **Authentication → URL Configuration**: Site URL과 Redirect URL에 Vercel 주소를 넣습니다.
4. **Authentication → SMTP Settings**: **외부 SMTP를 반드시 연결**하세요. 기본 발송기는 시간당 2통, 그것도 Supabase 팀 멤버에게만 보냅니다. 회사 SMTP나 Resend·Brevo 등을 쓰면 됩니다.
5. **Authentication → Sign In / Providers**에서 공개 가입(**Allow new users to sign up**)을 끕니다. DB 트리거가 초대받지 않은 가입은 거부하지만, 켜 두면 초대 대기 중인 주소로 다른 사람이 먼저 비밀번호를 정해 가입할 수 있습니다. 꺼도 TeamEmbedded의 초대·계정 만들기는 그대로 동작합니다.
6. **첫 관리자 만들기**: Authentication → Users → **Add user → Create new user**에서 이메일과 비밀번호를 넣고(Auto Confirm 켬) 만들면, 사이트에서 그 이메일·비밀번호로 바로 로그인합니다. **처음 생성되는 계정은 자동으로 Admin**이 되고, 이후 사용자는 TeamEmbedded Admin 화면에서 초대합니다.

**로그인 방식**
- 평소에는 **이메일 + 비밀번호**로 로그인합니다. 각자 **설정 → 비밀번호**에서 정하거나 바꿉니다.
- 비밀번호가 없거나 잊었으면 로그인 화면의 **Forgot password?**로 메일 링크를 받습니다. 링크로 들어오면 설정의 비밀번호 칸으로 바로 이동합니다.
- 회사 메일 보안(예: Outlook Safe Links)이 링크를 먼저 열어 버리면 링크가 만료됩니다. 이때 로그인 화면에 이유가 나오며, 관리자가 임시 비밀번호로 열어 주면 됩니다.
- 관리자가 초대할 때 **임시 비밀번호**를 넣으면 메일 없이 바로 계정이 생깁니다. 이미 계정이 있는 주소라면 비밀번호가 그 값으로 바뀝니다. 비워 두면 초대 메일을 보냅니다.
- 관리 화면 **Users** 표의 각 줄에서 **비밀번호**(임시 비밀번호로 바꾸기, 메일 없음)와 **삭제**(로그인 계정과 그 사람의 기록 모두 삭제, 되돌릴 수 없음)를 할 수 있습니다. 본인과 마지막 관리자는 지울 수 없습니다. Invitations 표의 삭제는 초대 기록만 지웁니다.
- 한 PC에서 두 계정을 동시에 쓰려면 일반 창과 시크릿 창(또는 다른 브라우저)으로 나눕니다. 크롬의 시크릿 창끼리는 로그인을 공유합니다.

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
   - Headers: `x-teamembedded-token: <INGEST_TOKEN>`(예전 이름 `x-timecrumbs-token`, `x-jarvis-token`도 계속 받음), `Content-Type: application/octet-stream`, `x-file-name: <파일명>`
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
| 정렬·순서 | 드롭다운 위 입력칸 오른쪽 `…` → 수동 / 이름순 / 이름 역순 / 생성일순 / 최신순 / 타임시트 번호순(대분류 칸만, Project mapping의 No 순서). 옵션 왼쪽 ⋮⋮ 손잡이나 반복 업무 칩을 끌면 순서가 바뀌고 정렬은 ‘수동’이 됨 |
| 열 너비·행 높이 | 헤더의 Time·Category(시간·대분류) 경계선을 끌어 조절(더블클릭하면 기본값). 표 아래의 좁게(기본)/보통/넓게로 행 높이 선택 |
| 업무내용 (Content) | 맨 오른쪽 칸에 그 30분 동안 한 일을 자유롭게 적음(최대 2000자). 예전 몰입도(0–3) 칸은 화면에서 빠졌고, 저장돼 있던 값은 그대로 보관 |
| 복사·붙여넣기 | Ctrl+C / Ctrl+X / Ctrl+V. 엑셀·구글시트와 서로 주고받을 수 있음. 값 하나를 범위에 붙여넣으면 전체가 채워짐 |
| 지우기 / 채우기 / 되돌리기 | Delete(또는 Backspace) / Ctrl+D(맨 윗행을 아래로) / Ctrl+Z |
| 이동 | 방향키, Tab / Shift+Tab, Esc는 편집 취소 |
| 반복 업무 | 행 앞의 **+**, 행을 고르고 오른쪽 **반복 업무 → 선택한 행 저장**, 또는 Sub Category(업무분류) 칸 드롭다운의 **+ 반복 업무로 등록**. 대분류·MID·업무분류가 저장되고(업무내용 제외), 칩을 누르면 선택한 행에 함께 들어감(MID 없는 반복 업무는 행의 MID를 그대로 둠). 개인별로 저장 |
| 점심 | Settings의 점심시간(기본 12:00–13:00)은 '점심 (기본)'으로 표시됨. 다른 값을 넣으면 그 값이 우선하고, 지우면 다시 점심 |
| 현재 시간 | 오늘 날짜를 보면 지금 시각 위치에 빨간 선과 `10:17` 같은 시각이 표시되고 1분마다 움직임 |
| 근무 시간 | 30-min Log 위의 **시작 → 종료**를 날짜별로 고름. 시작은 07:00–10:00(30분 단위). 시작을 바꾸면 종료는 **시작 + 근무 8h + 점심 1h**(점심이 그 사이에 있을 때)로 맞춰지고, 그 뒤로 늘릴 수 있음(“+1h 연장” 표시). 새 날짜의 기본값은 Settings → Work hours |
| 색상 | 드롭다운 옵션·반복 업무 칩의 `…`, Projects → Project mapping의 색상 칸, 또는 Settings → **카테고리 색상**(모두 같은 개인 색상). **대분류**(PROJECT RND / PROJECT CO-WORK / PROJECT NON-RND) 옆 색 칸으로 아래 소분류 전체에 **공통 색**, **모두 랜덤**으로 소분류마다 랜덤 색(이후 소분류별로 다시 변경 가능). **랜덤 / 랜덤 (파스텔)**, 노션 9색, RGB/Hex/색상환으로 직접 지정. **프리셋에 저장**한 색은 “내 색상”에 보관. **기본**으로 되돌리기. 개인별 설정 |
| 알림 | Settings → **알림**에서 켜고 브라우저 권한 허용. 근무시간 중 :00·:30마다 직전 칸이 비어 있으면 알림(점심·주말 제외). TeamEmbedded 탭이 열려 있어야 함. 알림 때 화면 오른쪽 아래에 **입력 창**이 떠서 Daily Log와 같은 3칸(Category·Sub Category·Content)으로 바로 저장하거나, **이전 업무 계속**으로 마지막 기록을 그 뒤 빈 칸에 모두 채움(점심·이미 적은 칸 제외, 채울 시간대를 버튼 아래에 미리 표시). **나중에**는 닫기만 함. 브라우저 알림 창 자체에는 입력칸을 넣을 수 없어, 알림을 누르면 탭이 앞으로 나옴. **입력 창 띄워 보기**로 바로 시험 가능 |
| 화면 스타일·글꼴 | Settings → **화면 스타일**: 블러(기본) / 리퀴드 글래스, **패널 불투명도**(높을수록 배경이 덜 비침, 기본 블러 58% · 리퀴드 22%, 스타일마다 따로 저장), **언어**(English 기본 / 한국어: 메뉴·탭·제목·표 머리글, Timesheets 제목은 그대로), **글꼴**: Pretendard(기본) / IBM Plex Sans KR / 고운돋움 / 나눔명조(고를 때만 내려받음). 드롭다운·메뉴·창은 항상 불투명 |
| 배경 | Settings → **배경**: 무작위 그라데이션(매일 자동 또는 고정). **물결처럼 흐르기**를 켜면 물결 모양 색 띠가 화면 오른쪽에서 왼쪽으로 흐르고, 물결 모양은 패턴마다 다름. 속도 느리게 24초 / 보통 12초(기본) / 빠르게 6초 = 물결이 화면을 지나가는 시간, 미리보기에 바로 반영. 내 사진 업로드, Unsplash 오늘의 사진(키 설정 시)도 가능. 다른 탭을 보는 동안과 OS ‘동작 줄이기’가 켜져 있으면 멈춤 |
| 프로젝트 추가·삭제 | Projects → Project mapping(관리자). 표는 대분류(PROJECT RND / CO-WORK / NON-RND)별로 묶여 보이고, **No**는 전체 이어지는 번호(대분류 → 마스터 시트 순서, 숨긴 항목은 –)입니다. 이름과 대분류를 넣고 **추가**. 🗑 → 마스터 시트에서 온 항목은 **숨김**(기존 기록 유지, 다시 올려도 NEW 안 뜸, **숨긴 항목 보기 → 되돌리기**), 직접 추가한 항목은 확인 후 삭제(이미 쓰였으면 숨김). 기본 항목(휴가·회의 등)은 삭제 불가. 관리자는 **No와 이름을 더블클릭**(또는 ✏)해서 고침: No를 바꾸면 같은 대분류 안에서 그 자리로 옮겨지고(Daily Log 번호순에도 반영), 마스터 시트에서 온 이름을 바꾸면 원래 시트 이름을 기억해(이름 아래 '시트 이름') 예전 시트를 다시 올려도 같은 항목으로 맞춰지고 앱 이름이 유지됨. **목록 저장 (.json)** / **목록 불러오기**(관리자): 대분류·No 순서·이름·시트 이름·별칭·숨김을 TeamEmbedded 파일로 저장하고(이름을 바꾸기 전 TimeCrumbs 파일도 읽음), 불러올 때는 바뀌는 내용을 미리 보여 준 뒤 적용(같은 항목은 이름·순서 갱신, 새 항목 추가, 별칭 추가, 파일에 없는 항목은 그대로). 다른 브라우저·폰으로 옮길 때도 사용 |
| MID(중분류) | Projects 화면 아래 **MID** 카드(관리자): 추가(**MID 추가**), 이름 더블클릭 수정, ↑↓ 순서, 색(팀 공통), 삭제(이미 쓰였으면 숨김 → 숨긴 항목 보기 → 되돌리기). 처음 목록 12개: 개발-신규·파생·설계변경·선행검토, 검증-시험·인증·시제품, 지원-생산·8D·견적, 회의-INT·EXT, 일반-이메일 및 일반업무. L1~L3는 읽기만 |
| 메뉴(Dock) | PC: 화면 아래 가운데 Dock. 평소엔 숨어 있고 마우스를 화면 아래 끝으로 가져가면 나타남. 아이콘에 마우스를 올리면 커지며 이름(Home · Olympus 등) 표시. 휴대폰은 하단 탭 바 |

Mac에서는 Ctrl 대신 ⌘를 씁니다.

## 권한

| 역할 | 할 수 있는 일 |
|---|---|
| Admin | 모든 화면과 자료 조회·수정: 전원 기록, 마스터 업로드, 프로젝트 목록(No·이름·추가·숨김), 팀 별칭, 사용자 초대와 등급 변경, 조직 설정. 마지막 Admin은 강등할 수 없음 |
| L1 · L2 · L3 | **지금은 셋 다 같은 권한**: 본인 기록·휴가·근무시간·반복 업무, 프로젝트 목록과 팀 별칭은 읽기만(🔒 관리자 설정), **내 별칭**(본인 기록에만 적용)과 색·정렬 등 개인 설정. 등급별 차이(예: L2가 자기 그룹의 L1 기록 보기)는 다음 단계 |

예전 Member는 L1, Viewer는 L2가 됩니다(`0009_levels_personal_aliases.sql`). 데모 모드에서는 Settings → Data → **데모: 등급 바꿔 보기**로 L1–L3 화면을 미리 볼 수 있습니다.

모든 권한은 Postgres RLS로 강제되며, `tests/db/rls.sql`에서 검증합니다.

## 구조

```
api/                     Vercel 함수: ingest.ts, background.ts, admin/invite.ts, admin/user.ts, _lib/ (공용, 라우트 아님)
src/domain/              순수 로직: 슬롯·주차, 프로젝트명 매칭, 주간계획/그룹 집계, 시드
src/excel/               ExcelJS 읽기(마스터, 개인 로그) / 쓰기(그룹 포맷, 주간계획)
src/data/                DataStore 인터페이스 + SupabaseStore / LocalStore(데모)
src/pages/               화면 (timesheets/*, Settings, Admin, Login, Home)
supabase/migrations/     스키마 + RLS + 트리거 + apply_master_import(), 시드
tests/                   Vitest 단위 테스트, tests/db/ (SQL 동작 테스트)
```

`src/domain`, `src/excel`은 Vercel 함수(Node ESM)도 import하므로 상대 경로에 `.js` 확장자를 붙입니다.
