import { Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { Fragment, useState } from 'react'
import { ColorMenu, Swatch } from '../../components/ColorMenu'
import { Button, Card, ErrorNote, Modal, Pill, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { diffMaster, isNewProject, manualProjectRow, type MasterDiff } from '../../domain/projects'
import type { GroupProject, MasterImportResult, MasterRow, ProjectKind } from '../../domain/types'
import { loadExcel, sha256Hex } from '../../lib/files'
import { categoryColor } from './colors'
import { GroupColorControl } from './GroupColor'
import { KIND_LABEL } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'
import { useColorPrefs } from './useColorPrefs'

const KINDS = ['project', 'timelog', 'local_section'] as const

interface Preview {
  fileName: string
  hash: string
  rows: MasterRow[]
  diff: MasterDiff
}

export function ProjectsPage() {
  const { store } = useStore()
  const user = useUser()
  const { projects, aliases, latestImport, reloadMaster } = useTimesheets()
  const isAdmin = user.role === 'admin'
  const canAlias = user.role !== 'viewer'
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<MasterImportResult | null>(null)
  const [filter, setFilter] = useState<'all' | ProjectKind>('all')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [draft, setDraft] = useState<{ name: string; kind: ProjectKind }>({ name: '', kind: 'project' })
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<GroupProject | null>(null)
  const [colorOf, setColorOf] = useState<{ project: GroupProject; anchor: DOMRect } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const colors = useColorPrefs()

  const newOnes = projects.filter((p) => !p.hidden && isNewProject(p, latestImport))
  const hiddenCount = projects.filter((p) => p.hidden).length
  const shown = projects.filter((p) => (showHidden || !p.hidden) && (filter === 'all' || p.kind === filter))
  // No: one running number over all listed projects in table order (대분류, then master-sheet order),
  // the same whichever filter is on; hidden rows get none
  const noOf = new Map(KINDS.flatMap((k) => projects.filter((p) => p.kind === k && !p.hidden)).map((p, i) => [p.id, i + 1]))

  async function onFile(file: File) {
    setError(null)
    setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const hash = await sha256Hex(buf)
      const x = await loadExcel()
      const rows = x.parseMasterWorkbook(await x.loadWorkbook(buf))
      setPreview({ fileName: file.name, hash, rows, diff: diffMaster(projects, rows) })
    } catch (e) {
      setError(e as Error)
    }
  }

  async function apply() {
    if (!preview) return
    setBusy(true)
    try {
      setResult(await store.applyMasterImport({ fileName: preview.fileName, contentHash: preview.hash, rows: preview.rows }))
      setPreview(null)
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  async function addAlias(projectId: string) {
    const text = (drafts[projectId] ?? '').trim()
    if (!text) return
    try {
      await store.addAlias(projectId, text)
      setDrafts({ ...drafts, [projectId]: '' })
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  async function removeAlias(id: string) {
    try {
      await store.deleteAlias(id)
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  async function addProject() {
    const row = manualProjectRow(draft.name, draft.kind)
    if (!row.name) return
    setError(null)
    try {
      await store.addProject({ ...row, kind: draft.kind })
      setDraft({ ...draft, name: '' })
      setNote(`‘${row.name}’ 추가됨 · Daily Log 드롭다운에서 바로 쓸 수 있습니다.`)
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  async function removeProject(p: GroupProject) {
    setConfirmDelete(null)
    setError(null)
    try {
      const how = await store.removeProject(p.id)
      setNote(
        how === 'deleted'
          ? `‘${p.name}’ 삭제됨`
          : `‘${p.name}’ 숨김 · 기존 기록은 그대로이고, 숨긴 항목 보기에서 되돌릴 수 있습니다.`,
      )
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  async function renameProject(p: GroupProject) {
    if (!renaming || renaming.name.trim() === p.name) return setRenaming(null)
    setError(null)
    try {
      await store.renameProject(p.id, renaming.name)
      setNote(`이름 변경: ‘${p.name}’ → ‘${renaming.name.replace(/\s+/g, ' ').trim()}’`)
      setRenaming(null)
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  async function restoreProject(p: GroupProject) {
    setError(null)
    try {
      await store.restoreProject(p.id)
      setNote(`‘${p.name}’ 되돌림`)
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Group master sheet">
          {isAdmin ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-control border-2 border-dashed border-line px-4 py-6 text-center hover:bg-sage-light">
              <Upload className="text-primary" />
              <span className="font-semibold">Drop group master sheet (.xlsx exported from SharePoint)</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                aria-label="Master sheet file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = '' // allow picking the same file again
                  if (file) void onFile(file)
                }}
              />
            </label>
          ) : (
            <p className="text-sm text-muted">Admins upload the group master sheet. You can add local aliases below.</p>
          )}
          <p className="mt-2 text-xs text-muted">
            {latestImport ? `Last import: ${latestImport.created_at.slice(0, 10)} · ${latestImport.file_name} (${latestImport.source})` : 'No import yet.'}
          </p>
        </Card>

        <Card tone={newOnes.length ? 'accent' : 'white'}>
          <div className="font-display text-6xl font-extrabold" data-testid="new-count">
            {newOnes.length}
          </div>
          <p className="font-semibold">New since last import</p>
          <ul className="mt-2 space-y-1 text-sm">
            {newOnes.map((p) => (
              <li key={p.id} className="truncate">
                • {p.name}
              </li>
            ))}
          </ul>
        </Card>

        <Card tone="sage" title="Automatic sync (Power Automate)">
          {isAdmin ? (
            <div className="space-y-1 text-sm">
              <p>POST the master .xlsx to:</p>
              <code className="block break-all rounded-chip bg-white px-2 py-1 text-xs">{window.location.origin}/api/ingest</code>
              <p>
                Header <code className="text-xs">x-timecrumbs-token</code> = <code className="text-xs">INGEST_TOKEN</code>. See README → Power Automate.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Configured by admins.</p>
          )}
        </Card>
      </div>

      <ErrorNote error={error} />
      {result && (
        <p className="rounded-control bg-sage px-4 py-2 text-sm font-semibold text-primary" role="status">
          {result.status === 'duplicate'
            ? 'This exact file was already imported — nothing changed.'
            : `Imported ${result.total} rows: ${result.added} new, ${result.missing} no longer listed${result.is_baseline ? ' (first import = baseline, nothing flagged NEW)' : ''}.`}
        </p>
      )}

      <Card
        title="Project mapping"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            {(['all', 'project', 'timelog', 'local_section'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cx('rounded-control px-3 py-1 text-sm font-semibold', filter === k ? 'bg-primary text-white' : 'bg-sage-light')}
              >
                {k === 'all' ? 'All' : KIND_LABEL[k]}
              </button>
            ))}
            {isAdmin && hiddenCount > 0 && (
              <button
                aria-pressed={showHidden}
                onClick={() => setShowHidden((v) => !v)}
                className={cx('ml-1 flex items-center gap-1 rounded-control px-3 py-1 text-sm font-semibold', showHidden ? 'bg-ink text-white' : 'bg-black/5 hover:bg-black/10')}
              >
                {showHidden ? <Eye size={14} /> : <EyeOff size={14} />} 숨긴 항목 보기 ({hiddenCount})
              </button>
            )}
          </div>
        }
      >
        {isAdmin && (
          <form
            className="mb-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void addProject()
            }}
          >
            <input
              aria-label="New project name"
              className="field !w-auto min-w-[260px] flex-1 !py-1.5 text-sm"
              placeholder="새 프로젝트 이름 (예: 2045--Compact Work Lamp)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <select
              aria-label="New project kind"
              className="field !w-auto !py-1.5 text-sm"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProjectKind })}
            >
              {(['project', 'timelog', 'local_section'] as const).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={!draft.name.trim()}>
              <Plus size={16} /> 추가
            </Button>
            <span className="w-full text-xs text-muted">
              직접 추가한 항목은 나중에 마스터 시트에 같은 이름으로 들어오면 자동으로 합쳐집니다(NEW 표시 없음). Timelog는 이름 앞에 <code>00.Timelog--</code>가 붙습니다.
            </span>
          </form>
        )}
        {note && (
          <p className="mb-3 rounded-control bg-sage px-3 py-1.5 text-sm font-semibold text-primary" role="status">
            {note}
          </p>
        )}
        <div className="overflow-auto">
          <table className="sheet">
            <thead>
              <tr>
                <th className="w-10">Color</th>
                <th className="num w-12">No</th>
                <th>Group Project</th>
                <th>Local aliases</th>
                <th>Status</th>
                {isAdmin && <th className="w-28" />}
              </tr>
            </thead>
            <tbody>
              {KINDS.map((kind) => {
                const rows = shown.filter((p) => p.kind === kind)
                if (!rows.length) return null
                const visible = rows.filter((p) => !p.hidden)
                return (
                  <Fragment key={kind}>
                    {/* 대분류 header: common colour / random colours for every 소분류 below */}
                    <tr data-testid={`group-${kind}`} className="bg-black/[0.03]">
                      <td colSpan={isAdmin ? 6 : 5} className="!py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupColorControl
                            label={KIND_LABEL[kind]}
                            items={visible.map((p) => ({ key: p.id, color: categoryColor('work', p, colors.prefs) }))}
                            colors={colors}
                          >
                            <span className="text-xs font-bold tracking-wide">{KIND_LABEL[kind]}</span>
                            <span className="text-xs text-muted">{visible.length}개</span>
                          </GroupColorControl>
                        </div>
                      </td>
                    </tr>
                    {rows.map((p) => (
                      <tr key={p.id} className={cx(p.hidden && 'opacity-60')}>
                        <td>
                          <span className="inline-flex" onClick={(e) => setColorOf({ project: p, anchor: e.currentTarget.getBoundingClientRect() })}>
                            <Swatch color={categoryColor('work', p, colors.prefs)} label={`Color of ${p.name}`} />
                          </span>
                        </td>
                        <td className="num font-mono text-xs text-muted">{noOf.get(p.id) ?? '–'}</td>
                        <td className="font-semibold">
                          {renaming?.id === p.id ? (
                            <form
                              className="flex items-center gap-1"
                              onSubmit={(e) => {
                                e.preventDefault()
                                void renameProject(p)
                              }}
                            >
                              <input
                                aria-label="Project name"
                                autoFocus
                                className="field !py-1 text-sm"
                                value={renaming.name}
                                onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                                onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                              />
                              <Button type="submit" className="whitespace-nowrap !px-2.5 !py-1 text-xs">
                                저장
                              </Button>
                            </form>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {p.name}
                              {/* Sections and hand-added rows can be renamed; master-sheet names come from the sheet */}
                              {isAdmin && !p.hidden && (p.kind === 'local_section' || p.manual) && (
                                <button
                                  aria-label={`Rename ${p.name}`}
                                  title="이름 바꾸기"
                                  className="rounded-chip p-1 text-muted hover:bg-black/5"
                                  onClick={() => setRenaming({ id: p.id, name: p.name })}
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1">
                            {aliases
                              .filter((a) => a.group_project_id === p.id)
                              .map((a) => (
                                <Pill key={a.id} tone="blue">
                                  {a.alias}
                                  {(isAdmin || a.created_by === user.id) && (
                                    <button aria-label={`Remove alias ${a.alias}`} className="ml-1" onClick={() => void removeAlias(a.id)}>
                                      <X size={12} />
                                    </button>
                                  )}
                                </Pill>
                              ))}
                            {canAlias && (
                              <span className="flex items-center">
                                <input
                                  aria-label={`Add alias for ${p.name}`}
                                  className="cell-input !w-28 text-xs"
                                  placeholder="+ alias"
                                  value={drafts[p.id] ?? ''}
                                  onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                                  onKeyDown={(e) => e.key === 'Enter' && void addAlias(p.id)}
                                />
                                {(drafts[p.id] ?? '').trim() && (
                                  <button aria-label="Save alias" className="rounded-control p-1 hover:bg-sage-light" onClick={() => void addAlias(p.id)}>
                                    <Plus size={14} />
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="flex flex-wrap gap-1">
                            {p.hidden ? (
                              <Pill>숨김</Pill>
                            ) : isNewProject(p, latestImport) ? (
                              <Pill tone="orange">NEW</Pill>
                            ) : p.status === 'missing' ? (
                              <Pill>Not in sheet</Pill>
                            ) : (
                              <Pill tone="green">Active</Pill>
                            )}
                            {p.manual && <Pill tone="blue">직접 추가</Pill>}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="text-right">
                            {p.hidden ? (
                              <Button variant="ghost" className="whitespace-nowrap !px-2 !py-1 text-xs" aria-label={`Restore ${p.name}`} onClick={() => void restoreProject(p)}>
                                <RotateCcw size={14} /> 되돌리기
                              </Button>
                            ) : p.system_key ? (
                              <span className="whitespace-nowrap text-xs text-muted" title="기본 항목은 삭제할 수 없습니다">기본 항목</span>
                            ) : (
                              <button
                                aria-label={`Remove ${p.name}`}
                                title={p.manual ? '삭제' : '숨기기 (되돌리기 가능)'}
                                className="rounded-control p-1.5 text-muted hover:bg-black/5 hover:text-[#9a3a0e]"
                                onClick={() => (p.manual ? setConfirmDelete(p) : void removeProject(p))}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {colorOf && (
        <ColorMenu
          key={colorOf.project.id}
          anchor={colorOf.anchor}
          title={colorOf.project.name}
          note="내 색상입니다. Daily Log의 같은 카테고리 색과 함께 바뀝니다."
          value={categoryColor('work', colorOf.project, colors.prefs)}
          isCustom={colors.isCustom(colorOf.project.id)}
          saved={colors.prefs.palette}
          onPick={(hex) => void colors.setCategoryColor(colorOf.project.id, hex)}
          onSave={(hex) => void colors.savePreset(hex)}
          onRemoveSaved={(hex) => void colors.removePreset(hex)}
          onClose={() => setColorOf(null)}
        />
      )}

      {confirmDelete && (
        <Modal title="프로젝트 삭제" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm">
            <strong>{confirmDelete.name}</strong>을(를) 삭제할까요?
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>아직 아무도 기록하지 않았다면 <strong className="text-ink">완전히 삭제</strong>되고 되돌릴 수 없습니다.</li>
            <li>이미 기록이나 반복 업무에 쓰였다면 숨김 처리되고, 숨긴 항목 보기에서 되돌릴 수 있습니다.</li>
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              취소
            </Button>
            <Button onClick={() => void removeProject(confirmDelete)}>삭제</Button>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title="Review master import" onClose={() => setPreview(null)} wide>
          <p className="mb-3 text-sm text-muted">
            {preview.fileName} · {preview.rows.length} numbered rows
            {!latestImport && ' · first import: it becomes the baseline, so nothing is flagged NEW'}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="mb-1 font-bold text-accent">New ({preview.diff.added.length})</h3>
              <ul className="space-y-1 text-sm">{preview.diff.added.map((a) => <li key={a.row.name}>+ {a.row.name}</li>)}</ul>
            </div>
            <div>
              <h3 className="mb-1 font-bold">Matched ({preview.diff.matched.length})</h3>
              <ul className="space-y-1 text-sm text-muted">
                {preview.diff.matched.map((m) => (
                  <li key={m.project.id}>{m.row.name !== m.project.name ? `${m.project.name} → ${m.row.name}` : m.row.name}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-bold">No longer listed ({preview.diff.missing.length})</h3>
              <ul className="space-y-1 text-sm text-muted">{preview.diff.missing.map((p) => <li key={p.id}>– {p.name}</li>)}</ul>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={() => void apply()} disabled={busy}>
              {busy ? 'Importing…' : 'Apply import'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
