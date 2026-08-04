import { useState } from 'react'
import { useBatchStore, type BatchItemStatus } from '../stores/batchStore'
import { PanelTitle } from './PanelTitle'

const STATUS_META: Record<BatchItemStatus, { icon: string; className: string; label: string }> = {
  pending: { icon: '·', className: 'text-ink-faint', label: '等待' },
  analyzing: { icon: '♪', className: 'animate-pulse text-warm', label: '分析中' },
  done: { icon: '✓', className: 'text-success', label: '完成' },
  error: { icon: '✗', className: 'text-error', label: '失败' },
}

/** 批量处理面板：文件夹音频队列的串行分析进度 + 批量导出和弦谱 */
export function BatchPanel() {
  const items = useBatchStore((s) => s.items)
  const running = useBatchStore((s) => s.running)
  const cancelBatch = useBatchStore((s) => s.cancelBatch)
  const clearBatch = useBatchStore((s) => s.clearBatch)
  const exportAll = useBatchStore((s) => s.exportAll)
  const [exportNote, setExportNote] = useState<string | null>(null)

  const finishedCount = items.filter((item) => item.status === 'done' || item.status === 'error').length
  const doneCount = items.filter((item) => item.status === 'done').length
  const allFinished = items.length > 0 && finishedCount === items.length

  const handleExport = async (format: 'md' | 'txt') => {
    setExportNote(null)
    const outcome = await exportAll(format)
    if (outcome) setExportNote(`已导出 ${outcome.count} 个和弦谱到 ${outcome.directory}`)
  }

  return (
    <section className="panel-pixel pixel-corners panel-tint-warm flex min-h-0 flex-1 flex-col px-3 py-2">
      <div className="mb-2 flex items-center gap-2">
        <PanelTitle symbol="▤" className="flex-1">
          Batch
        </PanelTitle>
        {running ? (
          <button type="button" onClick={cancelBatch} className="btn-pixel px-1.5 py-0.5 text-xs text-error">
            取消后续
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleExport('md')}
              disabled={doneCount === 0}
              className="btn-pixel px-1.5 py-0.5 text-xs disabled:opacity-40"
            >
              ↓ 批量 MD
            </button>
            <button
              type="button"
              onClick={() => void handleExport('txt')}
              disabled={doneCount === 0}
              className="btn-pixel px-1.5 py-0.5 text-xs disabled:opacity-40"
            >
              ↓ 批量 TXT
            </button>
            <button type="button" onClick={clearBatch} className="btn-pixel px-1.5 py-0.5 text-xs">
              清空
            </button>
          </>
        )}
      </div>

      <p className="mb-1.5 font-vt text-sm text-ink-dim">
        {finishedCount}/{items.length} 完成
        {running ? '（串行分析中，CPU 推理不并发）' : allFinished ? `（成功 ${doneCount} · 失败 ${finishedCount - doneCount}）` : ''}
      </p>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {items.map((item) => {
          const meta = STATUS_META[item.status]
          return (
            <li key={item.path} className="flex items-center gap-2 border border-edge bg-base-deep px-2 py-1">
              <span className={`w-4 shrink-0 text-center font-vt text-sm ${meta.className}`} title={meta.label}>
                {meta.icon}
              </span>
              <span className="min-w-0 flex-1 truncate font-vt text-base text-ink" title={item.path}>
                {item.name}
              </span>
              <span
                className={`shrink-0 font-vt text-xs ${item.status === 'error' ? 'text-error' : 'text-ink-faint'}`}
                title={item.error ?? undefined}
              >
                {item.status === 'done' && item.elapsedSeconds !== null
                  ? `${item.elapsedSeconds.toFixed(0)}s`
                  : item.status === 'error'
                    ? (item.error ?? '失败')
                    : meta.label}
              </span>
            </li>
          )
        })}
      </ul>

      {exportNote && <p className="mt-1 truncate font-vt text-xs text-success" title={exportNote}>{exportNote}</p>}
    </section>
  )
}
