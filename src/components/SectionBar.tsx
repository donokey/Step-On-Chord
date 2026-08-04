import { useMemo } from 'react'
import { useAnalysisStore } from '../stores/analysisStore'
import { usePlayerStore } from '../stores/playerStore'
import { parseTimeString } from '../utils/time'
import { PanelTitle } from './PanelTitle'

/** 段落类型 → 色调（Verse=暗褐、Chorus=暗金、Bridge=魔法紫、Intro/Outro=石墙蓝） */
const SECTION_COLORS: Record<string, string> = {
  Intro: '#3a6a7a',
  Verse: '#4a3828',
  'Pre-Chorus': '#3a6a7a',
  Chorus: '#8a6a28',
  Bridge: '#7b5ea7',
  Interlude: '#3a5a44',
  Solo: '#6a3a3a',
  Outro: '#3a6a7a',
  Other: '#4a4440',
}

/** 段落结构条：水平堆叠，宽度按时长比例，hover 显示时间范围，点击跳转 */
export function SectionBar() {
  const result = useAnalysisStore((s) => s.result)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const seekTo = usePlayerStore((s) => s.seekTo)

  const spans = useMemo(() => {
    if (!result) return []
    return result.analysis.sections
      .map((section) => {
        const start =
          section.child_sections?.[0]?.start_seconds ?? parseTimeString(section.start) ?? 0
        const end =
          section.child_sections?.[0]?.end_seconds ??
          parseTimeString(section.end) ??
          start
        return { name: section.name, type: section.section_type, start, end }
      })
      .filter((span) => span.end > span.start)
  }, [result])

  const total = duration > 0 ? duration : Math.max(...spans.map((s) => s.end), 0)
  if (spans.length === 0 || total <= 0) return null

  return (
    <section className="panel-pixel panel-tint-cool px-2 py-1.5">
      <PanelTitle symbol="▤" className="mb-1">
        Sections
      </PanelTitle>
      <div className="flex h-9 w-full overflow-hidden border border-edge bg-base-deep">
        {spans.map((span) => {
          const width = ((span.end - span.start) / total) * 100
          const active = currentTime >= span.start && currentTime < span.end
          return (
            <button
              key={`${span.name}-${span.start}`}
              type="button"
              title={`${span.name} · ${formatRange(span.start)} - ${formatRange(span.end)}`}
              onClick={() => seekTo(span.start)}
              className={`pixel-gem relative h-full border-r border-base-deep/70 transition-[filter] last:border-r-0 ${
                active ? 'z-10 brightness-125' : 'hover:brightness-110'
              }}`}
              style={{
                width: `${width}%`,
                backgroundColor: SECTION_COLORS[span.type] ?? SECTION_COLORS.Other,
                boxShadow: active
                  ? 'inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -1px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--border-glow)'
                  : undefined,
              }}
            >
              {width > 6 && (
                <span className="absolute inset-0 flex items-center justify-center overflow-hidden whitespace-nowrap font-vt text-sm leading-none text-ink">
                  {span.name}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function formatRange(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
