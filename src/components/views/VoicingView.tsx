import { useCallback, useState } from 'react'
import { resolveEngineBaseUrl } from '../../stores/analysisStore'
import type { VoicingResponse } from '../../types/voicing'
import { PanelTitle } from '../PanelTitle'
import { VoicingCard } from '../VoicingCard'

const DEFAULT_PROGRESSION = 'C Am F G'
const PAGE_SIZE = 4

/** Voicing 视图：输入和弦进行 → 调 /api/voicing-candidates → 六弦网格指法候选 */
export function VoicingView() {
  const [progression, setProgression] = useState(DEFAULT_PROGRESSION)
  const [data, setData] = useState<VoicingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedChords, setExpandedChords] = useState<Set<string>>(new Set())

  const query = useCallback(async () => {
    const text = progression.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    try {
      const baseUrl = await resolveEngineBaseUrl()
      const response = await fetch(
        `${baseUrl}/api/voicing-candidates?progression=${encodeURIComponent(text)}&limit=12`,
      )
      if (!response.ok) throw new Error(`查询失败（HTTP ${response.status}）`)
      setData((await response.json()) as VoicingResponse)
      setExpandedChords(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [progression, loading])

  const toggleExpand = useCallback((chord: string) => {
    setExpandedChords((prev) => {
      const next = new Set(prev)
      if (next.has(chord)) next.delete(chord)
      else next.add(chord)
      return next
    })
  }, [])

  return (
    <div className="bg-atmosphere relative flex min-h-full flex-col gap-2 p-3">
      <section className="panel-pixel pixel-corners panel-tint-cool flex min-h-0 flex-1 flex-col px-3 py-2">
        <PanelTitle symbol="𝄞" className="mb-2">
          Voicing
        </PanelTitle>

        <div className="flex items-center gap-2">
          <input
            value={progression}
            onChange={(event) => setProgression(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void query()
            }}
            placeholder="输入和弦进行，如 C Am F G"
            spellCheck={false}
            className="min-w-0 flex-1 border-2 border-edge bg-base-deep px-2 py-1 font-vt text-base text-ink outline-none placeholder:text-ink-faint focus:border-edge-glow"
          />
          <button type="button" onClick={() => void query()} disabled={loading} className="btn-pixel disabled:opacity-40">
            {loading ? '查询中…' : '查询指法'}
          </button>
        </div>

        {error && <p className="mt-2 font-vt text-sm text-error">{error}</p>}
        {data && !data.database_available && (
          <p className="mt-2 font-vt text-sm text-error">指法数据库未就绪（resources/models/voicing/ 缺失）</p>
        )}

        <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {data?.database_available &&
            data.chords.map((chord) => {
              const candidates = data.candidates[chord] ?? []
              const expanded = expandedChords.has(chord)
              const visible = expanded ? candidates : candidates.slice(0, PAGE_SIZE)
              return (
                <section key={chord}>
                  <div className="mb-1 flex items-baseline gap-2">
                    <h3 className="font-pixel text-[10px] text-warm">{chord}</h3>
                    <span className="font-vt text-xs text-ink-faint">{candidates.length} 个候选</span>
                    {candidates.length > PAGE_SIZE && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(chord)}
                        className="font-vt text-xs text-cool-light underline decoration-dotted underline-offset-2 hover:text-warm"
                      >
                        {expanded ? '收起' : `展开全部`}
                      </button>
                    )}
                  </div>
                  {candidates.length === 0 ? (
                    <p className="font-vt text-sm text-ink-faint">数据库中暂无该和弦的指法</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {visible.map((candidate, index) => (
                        <VoicingCard key={`${candidate.annotation_key}-${index}`} candidate={candidate} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}

          {!data && !error && (
            <p className="pt-10 text-center font-vt text-sm text-ink-faint">
              输入和弦进行（空格分隔），回车或点「查询指法」
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
