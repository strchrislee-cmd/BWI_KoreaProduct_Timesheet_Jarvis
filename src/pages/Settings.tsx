import { Bell, ImagePlus, Layers, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BACKGROUND_CHANGED, fetchDailyPhoto } from '../components/BackgroundLayer'
import { ColorMenu, Swatch } from '../components/ColorMenu'
import { FlowCanvas } from '../components/FlowCanvas'
import { PageTitle } from '../components/Shell'
import { TimeRangePicker } from '../components/TimeRangePicker'
import { Button, Card, ErrorNote, Field } from '../components/ui'
import { LocalStore } from '../data/localStore'
import { useStore, useUser } from '../data/StoreContext'
import { usePreferences } from '../data/usePreferences'
import { FLOW_SPEEDS, type BackgroundMode, type Prefs, type UiStyle } from '../data/preferences'
import { isSelectable, sortProjects } from '../domain/projects'
import { todayLocal } from '../domain/time'
import type { OrgSettings, Profile } from '../domain/types'
import { crossSeconds } from '../lib/flowGradient'
import { compressImage } from '../lib/files'
import { FONT_CHOICES, loadFont } from '../lib/fonts'
import { LANG_CHOICES, useT } from '../lib/i18n'
import { supportsRefraction } from '../lib/liquidGlass'
import { PANEL_OPACITY_DEFAULT, PANEL_OPACITY_MIN, applyPanelOpacity } from '../lib/panelOpacity'
import { useAsync } from '../lib/hooks'
import { NONWORK_KEY, categoryColor } from './timesheets/colors'
import { GroupColorControl } from './timesheets/GroupColor'
import { KIND_LABEL, displayName } from './timesheets/projectUi'
import { useColorPrefs } from './timesheets/useColorPrefs'

type ProfileForm = Pick<
  Profile,
  'name' | 'engineer_code' | 'timezone' | 'work_start' | 'work_end' | 'lunch_start' | 'lunch_end' | 'daily_target_hours' | 'template_style'
>

export function Settings() {
  const tr = useT()
  const { store, refreshUser } = useStore()
  const user = useUser()
  const isAdmin = user.role === 'admin'
  const [form, setForm] = useState<ProfileForm>(user)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const org = useAsync(() => store.getOrgSettings(), [store])
  const [orgForm, setOrgForm] = useState<OrgSettings | null>(null)
  useEffect(() => {
    if (org.data) setOrgForm(org.data)
  }, [org.data])

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setForm({ ...form, [k]: v })

  async function saveProfile() {
    try {
      if (!/^\d{2}:\d{2}$/.test(form.work_start) || !/^\d{2}:\d{2}$/.test(form.work_end)) throw new Error('Use HH:MM for work hours')
      await store.updateProfile(user.id, form)
      await refreshUser()
      setSaved('Profile saved')
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
  }

  async function saveOrg() {
    if (!orgForm) return
    try {
      await store.updateOrgSettings(orgForm)
      setSaved('Organisation settings saved')
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
  }

  return (
    <div>
      <PageTitle>{tr('Settings')}</PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorNote error={error ?? org.error} />
        {saved && <p className="rounded-control bg-sage px-4 py-2 text-sm font-semibold text-primary" role="status">{saved}</p>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Profile">
          <div className="space-y-3">
            <Field label="E-mail">
              <input className="field" value={user.email} disabled />
            </Field>
            <Field label="Name">
              <input className="field" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Engineer code" hint="Matches your column header in the group timesheet">
              <input className="field" value={form.engineer_code} onChange={(e) => set('engineer_code', e.target.value)} />
            </Field>
            <Field label="Time zone">
              <input className="field" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Work hours">
          <div className="space-y-3">
            <Field label="Default start → end" hint="New days start with these hours; each day can be changed in the Daily Log.">
              <TimeRangePicker
                start={form.work_start}
                end={form.work_end}
                targetHours={form.daily_target_hours}
                lunchStart={form.lunch_start}
                lunchEnd={form.lunch_end}
                onChange={(r) => setForm({ ...form, work_start: r.start, work_end: r.end })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Lunch start">
                <input type="time" step="1800" className="field" value={form.lunch_start} onChange={(e) => set('lunch_start', e.target.value)} />
              </Field>
              <Field label="Lunch end">
                <input type="time" step="1800" className="field" value={form.lunch_end} onChange={(e) => set('lunch_end', e.target.value)} />
              </Field>
            </div>
            <Field label="Daily target (h)">
              <input type="number" step="0.5" className="field" value={form.daily_target_hours} onChange={(e) => set('daily_target_hours', Number(e.target.value))} />
            </Field>
            <Field label="Excel template style" hint="Template download arrives in phase 2">
              <select className="field" value={form.template_style} onChange={(e) => set('template_style', e.target.value as Profile['template_style'])}>
                <option value="compact">Compact</option>
                <option value="detailed">Detailed</option>
                <option value="project_first">Project-first</option>
              </select>
            </Field>
            <Button onClick={() => void saveProfile()}>Save profile</Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card tone="sage" title={<span className="flex items-center gap-2"><Sparkles size={18} /> AI provider</span>}>
            {orgForm ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" disabled={!isAdmin} checked={orgForm.ai_enabled} onChange={(e) => setOrgForm({ ...orgForm, ai_enabled: e.target.checked })} />
                  Enable AI mapping suggestions (phase 2)
                </label>
                <Field label="Model">
                  <input className="field" disabled={!isAdmin} value={orgForm.ai_model} onChange={(e) => setOrgForm({ ...orgForm, ai_model: e.target.value })} />
                </Field>
                <p className="text-xs text-muted">The API key is never stored in the browser or the database: set ANTHROPIC_API_KEY in Vercel → Environment Variables.</p>
                {isAdmin && (
                  <Button variant="outline" onClick={() => void saveOrg()}>
                    Save organisation settings
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            )}
          </Card>
          <Card title="Data">
            <p className="text-sm">
              Mode: <strong>{store.mode === 'demo' ? 'Demo (this browser only)' : 'Supabase'}</strong>
            </p>
            {store.mode === 'demo' && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  if (confirm('Delete all demo data in this browser?')) {
                    LocalStore.reset()
                    window.location.reload()
                  }
                }}
              >
                Reset demo data
              </Button>
            )}
          </Card>
        </div>
        <NotificationsCard />
        <UiStyleCard />
        <BackgroundCard />
        <CategoryColorsCard />
      </div>
    </div>
  )
}

/** Personal colors for every category (Daily Log rows, dropdowns, Today) and the saved palette. */
function CategoryColorsCard() {
  const { store } = useStore()
  const projectsQ = useAsync(() => store.listProjects(), [store])
  const colors = useColorPrefs()
  const [open, setOpen] = useState<{ key: string; name: string; anchor: DOMRect } | null>(null)
  const active = sortProjects((projectsQ.data ?? []).filter(isSelectable))
  const groups = [
    ...(['project', 'timelog', 'local_section'] as const).map((kind) => ({
      title: KIND_LABEL[kind],
      major: true,
      items: active.filter((p) => p.kind === kind).map((p) => ({ key: p.id, name: displayName(p), color: categoryColor('work', p, colors.prefs) })),
    })),
    { title: 'Non-work', major: false, items: [{ key: NONWORK_KEY, name: 'Non-work (점심·휴식·퇴근)', color: categoryColor('nonwork', undefined, colors.prefs) }] },
  ].filter((g) => g.items.length)

  return (
    <Card title="카테고리 색상" className="lg:col-span-3">
      <p className="mb-3 text-sm text-muted">Daily Log의 행·드롭다운·Today에 쓰이는 색입니다. 나에게만 적용됩니다. 그리드에서 카테고리 칸을 고른 뒤 ● 를 눌러도 바꿀 수 있습니다.</p>
      <ErrorNote error={colors.error ?? projectsQ.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => (
          <div key={g.title} className="min-w-0">
            {g.major ? (
              <h3 className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-muted">
                <GroupColorControl label={g.title} items={g.items} colors={colors}>
                  <span>{g.title}</span>
                </GroupColorControl>
              </h3>
            ) : (
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{g.title}</h3>
            )}
            <ul>
              {g.items.map((it) => (
                <li key={it.key} className="flex items-center gap-2 py-1 text-sm">
                  <span onClick={(e) => setOpen({ key: it.key, name: it.name, anchor: (e.target as HTMLElement).getBoundingClientRect() })}>
                    <Swatch color={it.color} label={`Color of ${it.name}`} />
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={it.name}>
                    {it.name}
                  </span>
                  {colors.isCustom(it.key) && <span className="shrink-0 text-[11px] text-muted">사용자 지정</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {open && (
        <ColorMenu
          key={open.key}
          anchor={open.anchor}
          title={open.name}
          note="그룹 프로젝트 이름은 마스터 시트에서 관리되어 여기서는 색만 바꿀 수 있습니다."
          value={groups.flatMap((g) => g.items).find((it) => it.key === open.key)?.color ?? '#A3A3A3'}
          isCustom={colors.isCustom(open.key)}
          saved={colors.prefs.palette}
          onPick={(hex) => void colors.setCategoryColor(open.key, hex)}
          onSave={(hex) => void colors.savePreset(hex)}
          onRemoveSaved={(hex) => void colors.removePreset(hex)}
          onClose={() => setOpen(null)}
        />
      )}
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">내 색상 프리셋</h3>
      {colors.prefs.palette.length === 0 ? (
        <p className="text-sm text-muted">색상 선택 창에서 “프리셋에 저장”을 누르면 여기에 보관됩니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="saved-palette">
          {colors.prefs.palette.map((c) => (
            <li key={c} className="flex items-center gap-1 rounded-chip border border-line py-0.5 pl-1 pr-2 font-mono text-xs">
              <span className="h-4 w-4 rounded-[4px] border border-black/15" style={{ backgroundColor: c }} />
              {c}
              <button aria-label={`Remove saved color ${c}`} className="text-muted hover:text-ink" onClick={() => void colors.removePreset(c)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** 30-minute browser reminders (A4). */
function NotificationsCard() {
  const { prefs, update, error } = usePreferences()
  const supported = typeof Notification !== 'undefined'
  const [permission, setPermission] = useState<string>(supported ? Notification.permission : 'unsupported')
  const [msg, setMsg] = useState('')

  async function toggle(on: boolean) {
    setMsg('')
    if (on && supported && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission()
      setPermission(p)
      if (p !== 'granted') {
        setMsg('브라우저에서 알림이 차단되어 있습니다. 주소창의 사이트 설정에서 알림을 허용해 주세요.')
        return
      }
    }
    await update((p) => ({ ...p, notifications: on }))
  }

  const status = { granted: '허용됨', denied: '차단됨', default: '아직 묻지 않음', unsupported: '이 브라우저는 지원하지 않음' }[permission] ?? permission

  return (
    <Card title={<span className="flex items-center gap-2"><Bell size={18} /> 알림</span>}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" aria-label="30-minute reminders" checked={prefs.notifications} disabled={!supported} onChange={(e) => void toggle(e.target.checked)} />
        30분마다 기록 알림
      </label>
      <p className="mt-2 text-xs text-muted">매시 정각·30분에, 방금 끝난 30분이 비어 있으면 알려 드립니다. 평일 근무시간에만, 점심은 제외합니다.</p>
      <p className="mt-1 text-xs text-muted">TimeCrumbs 탭이 열려 있어야 합니다(최소화·다른 탭은 괜찮음).</p>
      <p className="mt-2 text-sm">
        브라우저 권한: <strong data-testid="notification-permission">{status}</strong>
      </p>
      <ErrorNote error={error ?? (msg || null)} />
      {supported && permission === 'granted' && (
        <Button variant="outline" className="mt-2" onClick={() => new Notification('TimeCrumbs · 테스트 알림', { body: '알림이 정상적으로 동작합니다.' })}>
          테스트 알림
        </Button>
      )}
    </Card>
  )
}

/** Glass UI background: random gradient pattern, Unsplash daily photo, or an uploaded photo (A8). */
const UI_STYLES: { value: UiStyle; label: string; desc: string }[] = [
  { value: 'blur', label: '블러', desc: '뿌옇게 흐린 유리. 배경이 은은하게 비칩니다.' },
  { value: 'liquid', label: '리퀴드 글래스', desc: '맑은 유리. 배경이 그대로 비치고, 가장자리가 렌즈처럼 휘어 보입니다.' },
]

function UiStyleCard() {
  const { prefs, update, error } = usePreferences()
  // load every font once so each option previews in its own typeface
  useEffect(() => FONT_CHOICES.forEach((f) => void loadFont(f.value)), [])
  return (
    <Card title={<span className="flex items-center gap-2"><Layers size={18} /> 화면 스타일</span>}>
      <ErrorNote error={error} />
      <div className="grid gap-2 sm:grid-cols-2">
        {UI_STYLES.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer flex-col gap-1 rounded-control border p-3 text-sm ${prefs.uiStyle === o.value ? 'border-primary bg-white/60' : 'border-white/60 bg-white/30'}`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <input type="radio" name="ui-style" aria-label={o.label} checked={prefs.uiStyle === o.value} onChange={() => void update((p) => ({ ...p, uiStyle: o.value }))} />
              {o.label}
              {o.value === 'blur' && <span className="text-xs font-normal text-muted">(기본)</span>}
            </span>
            <span className="text-xs text-muted">{o.desc}</span>
          </label>
        ))}
      </div>
      {prefs.uiStyle === 'liquid' && !supportsRefraction() && (
        <p className="mt-2 text-xs text-muted">이 브라우저에서는 가장자리 휘어짐 없이 맑은 유리로만 보입니다. Chrome·Edge에서는 휘어짐까지 보입니다.</p>
      )}
      <PanelOpacitySlider
        key={prefs.uiStyle}
        style={prefs.uiStyle}
        value={prefs.panelOpacity[prefs.uiStyle]}
        onCommit={(style, v) => void update((p) => ({ ...p, panelOpacity: { ...p.panelOpacity, [style]: v } }))}
      />
      <h3 className="mb-1.5 mt-4 text-sm font-semibold text-muted">글꼴</h3>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Font">
        {FONT_CHOICES.map((f) => (
          <label
            key={f.value}
            className={`flex cursor-pointer flex-col gap-0.5 rounded-control border p-3 ${prefs.font === f.value ? 'border-primary bg-white/60' : 'border-white/60 bg-white/30'}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name="font" aria-label={f.label} checked={prefs.font === f.value} onChange={() => void update((p) => ({ ...p, font: f.value }))} />
              {f.label}
            </span>
            <span className="text-[15px]" style={{ fontFamily: f.family }} data-testid={`font-sample-${f.value}`}>
              30분 기록 · 회의 08:30
            </span>
            <span className="text-xs text-muted">{f.desc}</span>
          </label>
        ))}
      </div>
      <h3 className="mb-1.5 mt-4 text-sm font-semibold text-muted">언어 · Language</h3>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Language">
        {LANG_CHOICES.map((l) => (
          <label
            key={l.value}
            className={`flex cursor-pointer flex-col gap-0.5 rounded-control border p-3 ${prefs.language === l.value ? 'border-primary bg-white/60' : 'border-white/60 bg-white/30'}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name="language" aria-label={l.label} checked={prefs.language === l.value} onChange={() => void update((p) => ({ ...p, language: l.value }))} />
              {l.label}
            </span>
            <span className="text-xs text-muted">{l.desc}</span>
          </label>
        ))}
      </div>
    </Card>
  )
}

/** How much background shows through the panels, per UI style: previews live, saves when you stop dragging. */
function PanelOpacitySlider({ style, value, onCommit }: { style: UiStyle; value: number; onCommit: (style: UiStyle, v: number) => void }) {
  const [draft, setDraft] = useState(value)
  const pending = useRef<{ timer: number; value: number } | null>(null)
  const commit = useRef(onCommit)
  commit.current = onCommit
  const flush = () => {
    if (!pending.current) return
    window.clearTimeout(pending.current.timer)
    commit.current(style, pending.current.value)
    pending.current = null
  }
  useEffect(() => flush, []) // save a change still waiting when the slider unmounts (style switch, leaving Settings)
  const change = (v: number) => {
    setDraft(v)
    applyPanelOpacity(style, v)
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = { value: v, timer: window.setTimeout(flush, 400) }
  }
  const def = PANEL_OPACITY_DEFAULT[style]
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-sm font-semibold text-muted">
        <span>패널 불투명도 · {UI_STYLES.find((o) => o.value === style)?.label}</span>
        <span className="font-mono text-ink" data-testid="panel-opacity-value">
          {draft}%
        </span>
      </div>
      <input
        type="range"
        aria-label="Panel opacity"
        min={PANEL_OPACITY_MIN}
        max={100}
        step={1}
        value={draft}
        onChange={(e) => change(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        높을수록 배경이 덜 비칩니다 (기본 {def}%)
        {draft !== def && (
          <button type="button" className="underline hover:text-ink" onClick={() => change(def)}>
            기본값으로
          </button>
        )}
      </p>
    </div>
  )
}

function BackgroundCard() {
  const { store } = useStore()
  const user = useUser()
  const { prefs, update, error } = usePreferences()
  const [unsplash, setUnsplash] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [upload, setUpload] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Error | null>(null)
  const mode = prefs.background.mode

  useEffect(() => {
    void fetchDailyPhoto().then((p) => setUnsplash(p ? 'available' : 'unavailable'))
    void store.getBackground(user.id).then(setUpload, () => setUpload(null))
  }, [store, user.id])

  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const setBackground = (patch: Partial<Prefs['background']>) =>
    update((p) => ({ ...p, background: { ...p.background, ...patch } }))

  async function onFile(file: File) {
    setBusy(true)
    setErr(null)
    try {
      const data = await compressImage(file)
      await store.saveBackground(user.id, data)
      setUpload(data)
      await setBackground({ mode: 'upload' })
      window.dispatchEvent(new Event(BACKGROUND_CHANGED))
    } catch (e) {
      setErr(e as Error)
    } finally {
      setBusy(false)
    }
  }

  async function removeUpload() {
    try {
      await store.saveBackground(user.id, null)
      setUpload(null)
      if (mode === 'upload') await setBackground({ mode: 'gradient' })
      window.dispatchEvent(new Event(BACKGROUND_CHANGED))
    } catch (e) {
      setErr(e as Error)
    }
  }

  // called as a function, not <Option>: a component defined inside this one would remount its
  // children (and restart the live preview) on every render
  const Option = ({ value, label, children, disabled }: { value: BackgroundMode; label: string; children?: ReactNode; disabled?: boolean }) => (
    <div key={value} className={`rounded-control border p-3 ${mode === value ? 'border-primary bg-white/60' : 'border-white/60 bg-white/30'} ${disabled ? 'opacity-60' : ''}`}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="radio" name="background" aria-label={label} checked={mode === value} disabled={disabled} onChange={() => void setBackground({ mode: value })} />
        {label}
      </label>
      {children}
    </div>
  )

  return (
    <Card title={<span className="flex items-center gap-2"><ImagePlus size={18} /> 배경</span>} className="lg:col-span-2">
      <ErrorNote error={err ?? error} />
      <div className="grid gap-3 md:grid-cols-3">
        {Option({
          value: 'gradient',
          label: '무작위 그라데이션 패턴',
          children: (
            <>
              {/* live preview: the same flowing gradient at the chosen speed */}
              <FlowCanvas
                testId="gradient-preview"
                className="mt-2 block h-20 w-full rounded-control border border-white/60"
                seed={prefs.background.seed ?? todayLocal()}
                speed={prefs.background.speed}
                animate={prefs.background.animate}
                scale={1}
              />
              <p className="mt-1 text-xs text-muted">{prefs.background.seed ? '고정된 패턴' : '매일 새로운 패턴'}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button variant="outline" className="!px-2.5 !py-1 text-xs" onClick={() => void setBackground({ mode: 'gradient', seed: Math.random().toString(36).slice(2, 10) })}>
                  <RefreshCw size={12} /> 다른 패턴
                </Button>
                {prefs.background.seed && (
                  <Button variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => void setBackground({ seed: null })}>
                    매일 자동으로
                  </Button>
                )}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" aria-label="Flowing gradient" checked={prefs.background.animate} onChange={(e) => void setBackground({ animate: e.target.checked })} />
                물결처럼 흐르기 (오른쪽 → 왼쪽)
              </label>
              {prefs.background.animate && (
                <div role="group" aria-label="Flow speed" className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
                  <span className="mr-1 whitespace-nowrap text-muted">속도</span>
                  {FLOW_SPEEDS.map((sp) => (
                    <button
                      key={sp.value}
                      aria-pressed={prefs.background.speed === sp.value}
                      className={`whitespace-nowrap rounded-chip px-2 py-0.5 ${prefs.background.speed === sp.value ? 'bg-primary text-white' : 'bg-black/5 hover:bg-black/10'}`}
                      onClick={() => void setBackground({ speed: sp.value })}
                    >
                      {sp.label} <span className="opacity-70">{crossSeconds(sp.value)}초</span>
                    </button>
                  ))}
                </div>
              )}
              {prefs.background.animate && (
                <p className="mt-1 text-xs text-muted" data-testid="flow-speed-hint">
                  물결이 오른쪽→왼쪽으로 화면을 지나가는 데 약 {crossSeconds(prefs.background.speed)}초 · 위 미리보기가 이 속도로 흐릅니다
                </p>
              )}
              {prefs.background.animate && reducedMotion && <p className="mt-1 text-xs text-muted">OS의 ‘동작 줄이기’가 켜져 있어 움직이지 않습니다.</p>}
            </>
          ),
        })}
        {Option({
          value: 'unsplash',
          label: 'Unsplash 오늘의 사진',
          disabled: unsplash !== 'available',
          children: (
            <>
              <p className="mt-2 text-xs text-muted">
                {unsplash === 'checking'
                  ? '확인 중…'
                  : unsplash === 'available'
                    ? '매일 한 장씩 바뀌는 무료 사진입니다. 화면 오른쪽 아래에 작가가 표시됩니다.'
                    : '사용하려면 Vercel 환경변수 UNSPLASH_ACCESS_KEY가 필요합니다(무료 발급, README 참고). 지금은 그라데이션을 씁니다.'}
              </p>
            </>
          ),
        })}
        {Option({
          value: 'upload',
          label: '내 사진',
          disabled: !upload,
          children: (
            <>
              {upload && <img src={upload} alt="Uploaded background" className="mt-2 h-16 w-full rounded-control object-cover" />}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-primary bg-white px-2.5 py-1 text-xs font-semibold text-primary hover:bg-sage-light">
                  <ImagePlus size={12} /> {busy ? '올리는 중…' : '사진 업로드'}
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="Background photo"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) void onFile(f)
                    }}
                  />
                </label>
                {upload && (
                  <Button variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => void removeUpload()}>
                    삭제
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">긴 변 1920px로 줄여 저장합니다. 나에게만 보입니다.</p>
            </>
          ),
        })}
      </div>
    </Card>
  )
}
