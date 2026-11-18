import { Plus, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, ErrorNote, Modal, Pill, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { diffMaster, isNewProject, type MasterDiff } from '../../domain/projects'
import type { MasterImportResult, MasterRow, ProjectKind } from '../../domain/types'
import { loadExcel, sha256Hex } from '../../lib/files'
import { KIND_LABEL } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'

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

  const newOnes = projects.filter((p) => isNewProject(p, latestImport))
  const shown = projects.filter((p) => filter === 'all' || p.kind === filter)

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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Group master sheet">
          {isAdmin ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center hover:bg-sage-light">
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
          <div className="text-6xl font-extrabold" data-testid="new-count">
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
              <code className="block break-all rounded-lg bg-white px-2 py-1 text-xs">{window.location.origin}/api/ingest</code>
              <p>
                Header <code className="text-xs">x-jarvis-token</code> = <code className="text-xs">INGEST_TOKEN</code>. See README → Power Automate.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Configured by admins.</p>
          )}
        </Card>
      </div>

      <ErrorNote error={error} />
      {result && (
        <p className="rounded-xl bg-sage px-4 py-2 text-sm font-semibold text-primary" role="status">
          {result.status === 'duplicate'
            ? 'This exact file was already imported — nothing changed.'
            : `Imported ${result.total} rows: ${result.added} new, ${result.missing} no longer listed${result.is_baseline ? ' (first import = baseline, nothing flagged NEW)' : ''}.`}
        </p>
      )}

      <Card
        title="Project mapping"
        action={
          <div className="flex gap-1">
            {(['all', 'project', 'timelog', 'local_section'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cx('rounded-full px-3 py-1 text-sm font-semibold', filter === k ? 'bg-primary text-white' : 'bg-sage-light')}
              >
                {k === 'all' ? 'All' : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-auto">
          <table className="sheet">
            <thead>
              <tr>
                <th>Group Project</th>
                <th>Kind</th>
                <th>Local aliases</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name}</td>
                  <td className="text-muted">{KIND_LABEL[p.kind]}</td>
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
                            <button aria-label="Save alias" className="rounded-full p-1 hover:bg-sage-light" onClick={() => void addAlias(p.id)}>
                              <Plus size={14} />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {isNewProject(p, latestImport) ? (
                      <Pill tone="orange">NEW</Pill>
                    ) : p.status === 'missing' ? (
                      <Pill>Not in sheet</Pill>
                    ) : (
                      <Pill tone="green">Active</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
