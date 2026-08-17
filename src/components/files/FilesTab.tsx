import { useCallback, useState } from 'react'
import { ATTACHMENT_KINDS, updateAttachment, type AttachmentKind, type ProjectAttachment } from '../../shared/project-model'
import { useProjectStore } from '../../stores/projectStore'
import { useAccompanimentStore } from '../../stores/accompanimentStore'
import { isAudioFileName } from '../../utils/audio'
import { IconPause, IconPlay } from '../icons'
import { bridge } from '../../bridge'

/** 附件类型中文名（用户视角：伴奏 / demo / 成品） */
const KIND_LABELS: Record<AttachmentKind, string> = {
  accompaniment: '伴奏',
  arrangement: '成品',
  demo: 'Demo',
  other: '其他',
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 附件收纳（workbench 阶段 4）：伴奏 / 编曲 / demo 等文件管理。
 * - 导入时复制进项目 attachments/ 目录；打开用系统默认应用；移除进回收站（不永久删除）
 * - 元数据存于 project.soc.json，磁盘文件缺失的附件标灰提示
 */
export function FilesTab() {
  const { current, openProject, updateProject } = useProjectStore()
  const [kind, setKind] = useState<AttachmentKind>('other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const attachments = current?.project.attachments ?? []
  const missingIds = current?.attachmentMissing ?? []

  // 伴奏播放器状态（用于标记当前正在播放的附件）
  const activeTrack = useAccompanimentStore((s) => s.trackPath)
  const activePlaying = useAccompanimentStore((s) => s.isPlaying)

  /** 音频附件播放/暂停：首次加载进播放器，再点则切换播放状态 */
  const toggleAttachment = useCallback(
    (attachment: ProjectAttachment) => {
      if (!current) return
      const fullPath = `${current.folderPath}/${attachment.rel_path}`
      const store = useAccompanimentStore.getState()
      if (store.trackPath === fullPath) {
        store.toggle()
      } else {
        void store.playTrack(fullPath, attachment.name)
      }
    },
    [current],
  )

  const importAttachment = useCallback(async () => {
    if (!current || busy) return
    const sourcePath = await bridge.dialog.openAttachment()
    if (!sourcePath) return
    setBusy(true)
    setError(null)
    try {
      await bridge.projects.addAttachment(current.folderPath, sourcePath, kind, '')
      // 重新打开以刷新元数据与缺失状态
      await openProject(current.folderPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [current, busy, kind, openProject])

  const openAttachment = useCallback(
    async (relPath: string) => {
      if (!current) return
      await bridge.shell.openPath(`${current.folderPath}/${relPath}`)
    },
    [current],
  )

  const removeAttachment = useCallback(
    async (attachmentId: string) => {
      if (!current || busy) return
      setBusy(true)
      setError(null)
      try {
        await bridge.projects.removeAttachment(current.folderPath, attachmentId)
        await openProject(current.folderPath)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [current, busy, openProject],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* 工具条 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as AttachmentKind)}
            className="border border-edge bg-base-deep px-2 py-1 font-vt text-sm text-ink"
          >
            {ATTACHMENT_KINDS.map((item) => (
              <option key={item} value={item}>
                {KIND_LABELS[item]}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void importAttachment()} disabled={busy} className="btn-pixel px-2 py-1 text-xs">
            + 导入附件
          </button>
        </div>
        {error && <p className="font-vt text-xs text-error">{error}</p>}
      </div>

      {attachments.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10">
          <p className="font-vt text-lg text-ink-dim">还没有附件</p>
          <p className="font-vt text-sm text-ink-faint">点「+ 导入附件」添加伴奏 / demo / 工程文件（复制进项目，可回收站移除）</p>
        </div>
      ) : (
        <div className="min-h-0 space-y-1 overflow-y-auto pr-1">
          {attachments.map((attachment) => {
            const missing = missingIds.includes(attachment.id)
            return (
              <div
                key={attachment.id}
                className={`flex items-center gap-2 border px-2 py-1.5 ${missing ? 'border-edge bg-base opacity-50' : 'border-edge bg-base-deep'}`}
              >
                <select
                  value={attachment.kind}
                  onChange={(event) =>
                    void updateProject((project) =>
                      updateAttachment(project, attachment.id, { kind: event.target.value as AttachmentKind }),
                    )
                  }
                  title="附件类型（伴奏会自动加载到播放器）"
                  className="shrink-0 border border-edge bg-base px-1 py-0 font-vt text-[10px] text-warm outline-none focus:border-warm"
                >
                  {ATTACHMENT_KINDS.map((item) => (
                    <option key={item} value={item}>
                      {KIND_LABELS[item]}
                    </option>
                  ))}
                </select>
                <span className={`min-w-0 flex-1 truncate font-vt text-sm ${missing ? 'text-ink-faint' : 'text-ink'}`}>
                  {attachment.name}
                  {missing && <span className="ml-1 text-error">（文件缺失）</span>}
                </span>
                <span className="shrink-0 font-vt text-xs text-ink-faint">{formatSize(attachment.size)}</span>
                <span className="shrink-0 font-vt text-xs text-ink-faint">{formatTime(attachment.added_at)}</span>
                <div className="flex shrink-0 gap-1">
                  {isAudioFileName(attachment.name) && !missing && (
                    <button
                      type="button"
                      onClick={() => toggleAttachment(attachment)}
                      className={`btn-pixel px-1.5 py-0.5 text-xs ${activeTrack === `${current?.folderPath}/${attachment.rel_path}` ? 'text-warm' : ''}`}
                      title={activeTrack === `${current?.folderPath}/${attachment.rel_path}` && activePlaying ? '暂停' : '播放'}
                    >
                      {activeTrack === `${current?.folderPath}/${attachment.rel_path}` && activePlaying ? (
                        <IconPause width={16} height={16} />
                      ) : (
                        <IconPlay width={16} height={16} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void openAttachment(attachment.rel_path)}
                    disabled={missing}
                    className="btn-pixel px-1.5 py-0.5 text-xs disabled:opacity-30"
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeAttachment(attachment.id)}
                    disabled={busy}
                    className="btn-pixel px-1.5 py-0.5 text-xs text-error disabled:opacity-30"
                  >
                    移除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
