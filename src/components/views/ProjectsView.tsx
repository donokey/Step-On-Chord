import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge } from '../../bridge'
import { useProjectStore } from '../../stores/projectStore'
import { PanelTitle } from '../PanelTitle'
import { PixelBuddy } from '../PixelBuddy'

/** 项目视图（v0.2.0 工作台）：歌曲项目列表，新建/打开/删除 */
export function ProjectsView() {
  const { projects, loading, error, current, refresh, createProject, openProject, deleteProject, closeProject } =
    useProjectStore()
  const [creating, setCreating] = useState(false)
  const [pendingParentDir, setPendingParentDir] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  const startCreate = useCallback(async () => {
    // 集中目录：新建项目统一建在根目录下，不再每次弹框选位置
    const root = await bridge.projects.getRoot()
    if (!root) return
    setPendingParentDir(root)
    setCreating(true)
    setNameInput('')
  }, [])

  const confirmCreate = useCallback(async () => {
    const name = nameInput.trim()
    if (!name || busy || !pendingParentDir) return
    setBusy(true)
    try {
      const ok = await createProject(pendingParentDir, name)
      if (ok) setCreating(false)
    } finally {
      setBusy(false)
    }
  }, [nameInput, busy, pendingParentDir, createProject])

  const confirmDelete = useCallback(
    async (folderPath: string) => {
      if (!window.confirm('删除项目会把整个文件夹移入回收站，确定继续吗？')) return
      await deleteProject(folderPath)
    },
    [deleteProject],
  )

  return (
    <div className="bg-atmosphere relative flex min-h-full flex-col gap-2 p-3">
      <section className="panel-pixel pixel-corners panel-tint-cool flex min-h-0 flex-1 flex-col px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <PanelTitle symbol="▣">Projects</PanelTitle>
          <button type="button" onClick={() => void startCreate()} className="btn-pixel px-2 py-1 text-xs">
            ＋ 新建项目
          </button>
        </div>

        {creating && (
          <div className="mb-2 border border-edge bg-base-deep px-2 py-1.5">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void confirmCreate()
                  if (event.key === 'Escape') setCreating(false)
                }}
                placeholder="输入项目名（歌曲名）"
                className="min-w-0 flex-1 border border-edge bg-base px-2 py-1 font-vt text-sm text-ink outline-none focus:border-warm"
              />
              <button type="button" onClick={() => void confirmCreate()} disabled={busy} className="btn-pixel px-2 py-1 text-xs">
                创建
              </button>
              <button type="button" onClick={() => setCreating(false)} className="btn-pixel px-2 py-1 text-xs">
                取消
              </button>
            </div>
            <p className="mt-1 truncate font-vt text-xs text-ink-faint">将保存到集中目录：{pendingParentDir}</p>
          </div>
        )}

        {error && <p className="mb-1 font-vt text-sm text-error">{error}</p>}

        {current && (
          <div className="mb-2 flex items-center gap-3 border border-edge-glow bg-base-deep px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-vt text-lg text-warm">📂 {current.project.name}</p>
              <p className="truncate font-vt text-xs text-ink-faint">{current.folderPath}</p>
              {current.audioMissing && (
                <p className="font-vt text-xs text-error">⚠ 音频文件缺失，可在详情页重新定位</p>
              )}
            </div>
            <button type="button" onClick={closeProject} className="btn-pixel px-2 py-1 text-xs">
              关闭
            </button>
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center font-vt text-lg text-ink-dim">整理书架中…</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <PixelBuddy state="idle" scale={4} orbit />
            <p className="font-vt text-lg text-ink-dim">还没有歌曲项目</p>
            <p className="font-vt text-sm text-ink-faint">点「新建项目」把分析、歌词和伴奏收拢到一首歌名下</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {projects.map((item) => (
              <li key={item.id}>
                <div className="group flex items-center gap-3 border border-edge bg-base-deep px-3 py-2 transition-colors hover:border-edge-glow">
                  <button
                    type="button"
                    onClick={() => void openProject(item.folderPath)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-vt text-lg leading-tight text-ink group-hover:text-warm">{item.name}</p>
                    <p className="truncate font-vt text-xs text-ink-faint">
                      {formatDate(item.updatedAt)} · {item.folderPath}
                    </p>
                  </button>
                  <button
                    type="button"
                    title="在资源管理器中显示"
                    onClick={() => void bridge.shell.openPath(item.folderPath)}
                    className="btn-pixel h-6 w-6 shrink-0 justify-center px-0 text-xs"
                  >
                    ⌖
                  </button>
                  <button
                    type="button"
                    title="删除项目（移入回收站）"
                    onClick={() => void confirmDelete(item.folderPath)}
                    className="btn-pixel h-6 w-6 shrink-0 justify-center px-0 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
