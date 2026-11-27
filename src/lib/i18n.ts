// Screen language (Settings → 화면 스타일 → 언어): English labels (default) or Korean for menus,
// tabs, titles and table headers. "Timesheets" and the 대분류 names stay as they are.
import { readPrefs } from '../data/preferences'
import { useStore } from '../data/StoreContext'

export type Lang = 'en' | 'ko'

export const LANG_CHOICES: { value: Lang; label: string; desc: string }[] = [
  { value: 'en', label: 'English', desc: '영문 메뉴·제목 (기본)' },
  { value: 'ko', label: '한국어', desc: '메뉴·탭·제목·표 머리글을 한국어로' },
]

/** Korean for each English label; the English text is the key. */
const KO = {
  // navigation and page titles
  Home: '홈',
  Admin: '관리',
  Settings: '설정',
  'Welcome back,': '다시 오셨네요,',
  // Timesheets tabs
  'Daily Log': '일일 기록',
  'Daily Kanban': '데일리 칸반',
  'Weekly Result': '주간 결과',
  'Group Timesheet': '그룹 타임시트',
  Projects: '프로젝트',
  Leave: '휴가',
  // Daily Log
  '30-min Log': '30분 간격 기록',
  Time: '시간',
  Project: '프로젝트',
  Type: '유형',
  Task: '업무',
  Content: '업무내용',
  'Quick add': '빠른 등록',
  'Non-work': '비업무',
  Today: '오늘',
  target: '목표',
  'Unmapped categories': '매핑 안 된 카테고리',
  // Weekly Result
  'Weekly Task Result': '주간 업무 결과',
  Week: '주차',
  Date: '날짜',
  'Local Project': '로컬 프로젝트',
  'Group Project': '그룹 프로젝트',
  Work: '업무',
  Item: '항목',
  Hours: '시간 수',
  Unmapped: '미매핑',
  'This week': '이번 주',
  'Top projects': '주요 프로젝트',
  // Group Timesheet
  'Group format preview': '그룹 양식 미리보기',
  Total: '합계',
  'Project subtotal': '프로젝트 소계',
  Validation: '검증',
  // Projects
  'Group master sheet': '그룹 마스터 시트',
  'New since last import': '지난 업로드 이후 신규',
  'Automatic sync (Power Automate)': '자동 동기화 (Power Automate)',
  'Project mapping': '프로젝트 매핑',
  All: '전체',
  Color: '색',
  'Local aliases': '로컬 별칭',
  Status: '상태',
  Active: '사용 중',
  'Not in sheet': '시트에 없음',
  // Leave
  'Request leave': '휴가 신청',
  'This month': '이번 달',
  'No leave.': '휴가 없음',
} as const

export type TextKey = keyof typeof KO

export function translate(lang: Lang, text: TextKey): string {
  return lang === 'ko' ? KO[text] : text
}

/** The signed-in user's screen language (English when signed out). */
export function useLang(): Lang {
  const { user } = useStore()
  return readPrefs(user?.preferences ?? {}).language
}

/** `t('Daily Log')` → the label in the user's language. */
export function useT(): (text: TextKey) => string {
  const lang = useLang()
  return (text) => translate(lang, text)
}
