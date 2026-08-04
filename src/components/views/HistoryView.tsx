import { useCallback, useEffect, useState } from 'react'
import type { HistorySummary } from '../../../electron/types'
import { bridge } from '../../bridge'
import { useAnalysisStore } from '../../stores/analysisStore'
import { useUiStore } from '../../stores/uiStore'
import type { AnalysisResult } from '../../types/analysis'
import { PanelTitle } from '../PanelTitle'
import { PixelBuddy } from '../PixelBuddy'

/** 历史视图：SQLite 归档的分析记录列表，点击直接载入结果（不重新分析），支持单条删除 */
export function HistoryView() {
  const [entries, setEntries] = useState<HistorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadResult = useAnalysisStore((s) => s.loadResult)
  const setActiveView = useUiStore((s) => s.setActiveView)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await bridge.history.list())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openEntry = useCallback(
    async (id: number) => {
      const record = await bridge.history.get(id)
      if (!record) return
      try {
        const result = JSON.parse(record.result_json) as AnalysisResult
        loadResult(record.file_name, record.file_path, result, record.id)
        setActiveView('analyze')
      } catch {
        setError('记录解析失败（数据已损坏）')
      }
    },
    [loadResult, setActiveView],
  )

  const removeEntry = useCallback(async (id: number) => {
    await bridge.history.remove(id)
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
  }, [])

  return (
    <div className="bg-atmosphere relative flex min-h-full flex-col gap-2 p-3">
      <section className="panel-pixel pixel-corners panel-tint-cool flex min-h-0 flex-1 flex-col px-3 py-2">
        <PanelTitle symbol="❏" className="mb-2">
          History
        </PanelTitle>

        {loading ? (
          <p className="py-12 text-center font-vt text-lg text-ink-dim">翻找档案中…</p>
        ) : error ? (
          <p className="py-12 text-center font-vt text-lg text-error">{error}</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <PixelBuddy state="idle" scale={4} orbit />
            <p className="font-vt text-lg text-ink-dim">书房里还没有乐谱档案</p>
            <p className="font-vt text-sm text-ink-faint">到「分析」页拖入一首歌，完成后会自动归档到这里</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => void openEntry(entry.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void openEntry(entry.id)
                  }}
                  className="group flex cursor-pointer items-center gap-3 border border-edge bg-base-deep px-3 py-2 transition-colors hover:border-edge-glow"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-vt text-lg leading-tight text-ink group-hover:text-warm">
                      {entry.file_name}
                    </p>
                    <p className="truncate font-vt text-xs text-ink-faint">
                      {formatDate(entry.created_at)} · {entry.key_text ?? '未知调'} · {entry.bpm ?? '—'} BPM ·{' '}
                      {entry.chord_count} 和弦 · {entry.section_count} 段落
                    </p>
                  </div>
                  <span className="shrink-0 font-vt text-xs text-ink-faint group-hover:text-ink-dim">载入 →</span>
                  <button
                    type="button"
                    title="删除这条记录"
                    onClick={(event) => {
                      event.stopPropagation()
                      void removeEntry(entry.id)
                    }}
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
