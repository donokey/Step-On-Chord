import { useMemo, useState } from 'react'
import { useAnalysisStore } from '../stores/analysisStore'
import { usePlayerStore } from '../stores/playerStore'
import type { ChordEvent } from '../types/analysis'
import { ChordEditor } from './ChordEditor'
import { PanelTitle } from './PanelTitle'

type Quality = 'major' | 'minor' | 'dominant7' | 'other'

/** 和弦性质 → 色块颜色：major=烛光金 / minor=石墙蓝 / dominant7=魔法紫 / 其他=暗灰 */
const QUALITY_COLORS: Record<Quality, string> = {
  major: '#d4a039',
  minor: '#3a6a7a',
  dominant7: '#7b5ea7',
  other: '#5a5248',
}

const QUALITY_LABELS: Record<Quality, string> = {
  major: 'Major',
  minor: 'Minor',
  dominant7: 'Dom7',
  other: 'Other',
}

function chordQuality(chord: string): Quality {
  const suffix = chord.replace(/^[A-G][#b]?/, '')
  if (/^(dim|aug|sus|alt|ø|\+)/i.test(suffix)) return 'other'
  if (suffix.startsWith('m') && !suffix.startsWith('maj')) return 'minor'
  if (/^(7|9|11|13)/.test(suffix)) return 'dominant7'
  return 'major'
}

/** 拍平后的和弦项（携带原 sections/chords 下标，手动校正定位用） */
interface FlatChord {
  event: ChordEvent
  sectionIndex: number
  chordIndex: number
}

/** 和弦时间轴：色块宽度按持续时长比例，点击弹出校正器（同时跳转播放），播放头金色竖线 */
export function ChordTimeline({ sparkles = false }: { sparkles?: boolean }) {
  const result = useAnalysisStore((s) => s.result)
  const applyChordOverride = useAnalysisStore((s) => s.applyChordOverride)
  const restoreChord = useAnalysisStore((s) => s.restoreChord)
  const restoreAllChords = useAnalysisStore((s) => s.restoreAllChords)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const [editing, setEditing] = useState<FlatChord | null>(null)

  const chords = useMemo<FlatChord[]>(() => {
    if (!result) return []
    const items: FlatChord[] = []
    result.analysis.sections.forEach((section, sectionIndex) => {
      section.chords.forEach((event, chordIndex) => items.push({ event, sectionIndex, chordIndex }))
    })
    return items.sort((a, b) => a.event.time_seconds - b.event.time_seconds)
  }, [result])

  const total = duration > 0 ? duration : fallbackDuration(chords.map((item) => item.event))
  const hasOverrides = chords.some((item) => item.event.manual_override)
  if (!result || chords.length === 0 || total <= 0) return null

  return (
    <section className="panel-pixel pixel-corners panel-tint-warm relative px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <PanelTitle symbol="♫" className="flex-1">
          Chord Timeline
        </PanelTitle>
        <div className="flex items-center gap-2">
          {hasOverrides && (
            <button
              type="button"
              onClick={restoreAllChords}
              className="btn-pixel px-1.5 py-0.5 text-xs text-magic-light"
              title="撤销全部手动校正，恢复模型原始输出"
            >
              恢复原始
            </button>
          )}
          {(Object.keys(QUALITY_COLORS) as Quality[]).map((quality) => (
            <span key={quality} className="flex items-center gap-1 font-vt text-xs text-ink-faint">
              <span className="inline-block h-2 w-2" style={{ backgroundColor: QUALITY_COLORS[quality] }} />
              {QUALITY_LABELS[quality]}
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-12 w-full overflow-hidden border border-edge bg-base-deep">
        {chords.map((item, index) => {
          const { event } = item
          const start = event.time_seconds
          const next = chords[index + 1]
          const end = event.end_seconds ?? next?.event.time_seconds ?? total
          if (end <= start) return null
          const width = ((end - start) / total) * 100
          const active = currentTime >= start && currentTime < end
          return (
            <button
              key={`${event.chord}-${start}-${index}`}
              type="button"
              title={`${event.display_chord ?? event.chord} · ${event.time}${event.end ? ` - ${event.end}` : ''}${event.manual_override ? '（已校正，点击修改）' : '（点击校正）'}`}
              onClick={() => {
                seekTo(start)
                setEditing(item)
              }}
              className={`pixel-gem chord-block absolute top-0 h-full border-r border-base-deep/70 transition-[filter] ${
                active ? 'chord-active z-10' : 'hover:brightness-110'
              }}`}
              style={{
                left: `${(start / total) * 100}%`,
                width: `${Math.max(width, 0.4)}%`,
                backgroundColor: QUALITY_COLORS[chordQuality(event.chord)],
              }}
            >
              {width > 2.5 && (
                <span className="absolute inset-0 flex items-center justify-center overflow-hidden whitespace-nowrap font-vt text-sm leading-none text-base-deep">
                  {event.display_chord ?? event.chord}
                  {event.manual_override && <span className="ml-0.5 text-[10px]">✎</span>}
                </span>
              )}
            </button>
          )
        })}

        {/* 播放头（金色竖线带微光 + 星尾微粒） */}
        <div
          className="pointer-events-none absolute top-0 z-20 h-full w-[2px] bg-edge-glow shadow-[0_0_6px_var(--border-glow)]"
          style={{ left: `${Math.min((currentTime / total) * 100, 100)}%` }}
        >
          <span className="playhead-trail" />
          <span className="playhead-spark" style={{ top: '15%' }} />
          <span className="playhead-spark" style={{ top: '55%', animationDelay: '0.6s' }} />
          <span className="playhead-spark" style={{ top: '85%', animationDelay: '1.1s' }} />
        </div>

        {/* 分析完成后的微弱金粒子 */}
        {sparkles && (
          <>
            <span className="timeline-sparkle" style={{ left: '20%', top: 2 }} />
            <span className="timeline-sparkle" style={{ left: '55%', top: 0, animationDelay: '0.8s' }} />
            <span className="timeline-sparkle" style={{ left: '80%', top: 3, animationDelay: '1.6s' }} />
          </>
        )}
      </div>

      {/* 手动校正弹窗 */}
      {editing && (
        <ChordEditor
          timeLabel={editing.event.time}
          currentChord={editing.event.display_chord ?? editing.event.chord}
          hasOverride={Boolean(editing.event.manual_override)}
          onApply={(symbol) => {
            applyChordOverride(editing.sectionIndex, editing.chordIndex, symbol)
            setEditing(null)
          }}
          onRestore={() => {
            restoreChord(editing.sectionIndex, editing.chordIndex)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

function fallbackDuration(chords: ChordEvent[]): number {
  const last = chords[chords.length - 1]
  if (!last) return 0
  return last.end_seconds ?? last.time_seconds + 4
}
