import { useMemo, useState } from 'react'
import { bridge } from '../bridge'
import { useAnalysisStore } from '../stores/analysisStore'
import { buildChordSheet } from '../utils/exportSheet'
import { formatTime } from '../utils/time'
import { PanelTitle } from './PanelTitle'

/** 分析详情：RPG 风属性卡片 + 可展开完整和弦列表 */
export function AnalysisPanel() {
  const result = useAnalysisStore((s) => s.result)
  const [expanded, setExpanded] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)

  const allChords = useMemo(() => {
    if (!result) return []
    return result.analysis.sections.flatMap((section) =>
      section.chords.map((event, index) => ({
        key: `${section.name}-${event.time_seconds}-${index}`,
        time: event.time,
        start: event.time_seconds,
        end: event.end_seconds,
        chord: event.display_chord ?? event.chord,
        section: section.name,
      })),
    )
  }, [result])

  if (!result) return null
  const { analysis } = result
  const overall = analysis.overall

  const handleExport = async (format: 'md' | 'txt') => {
    const content = buildChordSheet(result, format)
    const baseName = (analysis.title_guess ?? result.file.name.replace(/\.[^.]+$/, '')) || 'chord-sheet'
    const saved = await bridge.dialog.saveFile({
      title: '导出和弦谱',
      defaultName: `${baseName}.${format}`,
      filters:
        format === 'md'
          ? [
              { name: 'Markdown', extensions: ['md'] },
              { name: '纯文本', extensions: ['txt'] },
            ]
          : [
              { name: '纯文本', extensions: ['txt'] },
              { name: 'Markdown', extensions: ['md'] },
            ],
      content,
    })
    setExportNote(saved ? `已导出 ${saved.split(/[\\/]/).pop()}` : null)
  }

  const stats = [
    { label: 'KEY', value: overall.key ? `${overall.key} ${overall.mode ?? ''}`.trim() : '—' },
    { label: 'BPM', value: overall.tempo_bpm !== null ? String(overall.tempo_bpm) : '—' },
    { label: 'TIME', value: overall.time_signature ?? '—' },
    { label: 'CHORDS', value: String(allChords.length) },
    { label: 'SECTIONS', value: String(analysis.sections.length) },
    { label: 'CONF', value: overall.confidence ?? '—' },
  ]

  return (
    <section className="panel-pixel pixel-corners panel-tint-magic flex min-h-0 flex-1 flex-col px-2 py-1.5">
      <div className="mb-1.5 flex items-center gap-2">
        <PanelTitle symbol="✦" className="flex-1">
          Analysis
        </PanelTitle>
        <button type="button" onClick={() => void handleExport('md')} className="btn-pixel px-1.5 py-0.5 text-xs">
          ↓ MD
        </button>
        <button type="button" onClick={() => void handleExport('txt')} className="btn-pixel px-1.5 py-0.5 text-xs">
          ↓ TXT
        </button>
      </div>

      {/* 属性卡片（RPG 角色面板风） */}
      <div className="grid grid-cols-3 gap-1.5">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-edge bg-base-deep px-2 py-1">
            <div className="font-pixel text-[7px] leading-relaxed text-ink-faint">{stat.label}</div>
            <div className="stat-value-glow truncate font-vt text-xl leading-tight text-warm">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* 低置信度提示（自制 demo / 多轨混音等输入模型准确率下降，预期内） */}
      {overall.confidence === 'low' && (
        <p className="mt-1 font-vt text-xs text-ink-dim">
          <span className="text-magic-light">◇</span> 置信度低，建议人工核对（非商业录音、人声/多轨混音场景识别准确率会下降）
        </p>
      )}

      {/* 完整和弦列表（可展开） */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1.5 flex items-center justify-between border border-edge bg-base-deep px-2 py-1 font-vt text-sm text-ink-dim transition-colors hover:border-edge-glow hover:text-ink"
      >
        <span>完整和弦列表（{allChords.length}）</span>
        <span className="font-pixel text-[7px]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-1 min-h-0 flex-1 overflow-auto border border-edge bg-base-deep">
          <table className="w-full font-vt text-sm">
            <thead className="sticky top-0 bg-panel text-left text-ink-faint">
              <tr>
                <th className="px-2 py-0.5 font-normal">时间</th>
                <th className="px-2 py-0.5 font-normal">和弦</th>
                <th className="px-2 py-0.5 font-normal">段落</th>
                <th className="px-2 py-0.5 text-right font-normal">时长</th>
              </tr>
            </thead>
            <tbody>
              {allChords.map((item) => (
                <tr key={item.key} className="border-t border-edge/40 text-ink-dim hover:bg-panel-light/40 hover:text-ink">
                  <td className="px-2 py-0.5">{item.time}</td>
                  <td className="px-2 py-0.5 text-warm">{item.chord}</td>
                  <td className="px-2 py-0.5">{item.section}</td>
                  <td className="px-2 py-0.5 text-right">
                    {item.end !== undefined && item.end > item.start ? `${(item.end - item.start).toFixed(1)}s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 练习建议 */}
      {analysis.practice_tips && analysis.practice_tips.length > 0 && (
        <div className="mt-2">
          <h3 className="mb-0.5 font-pixel text-[7px] uppercase tracking-wider text-ink-faint">Practice</h3>
          <ul className="space-y-0.5 font-vt text-sm leading-snug text-ink-dim">
            {analysis.practice_tips.map((tip) => (
              <li key={tip} className="flex gap-1.5">
                <span className="text-warm">◆</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 不确定点（有则显示） */}
      {analysis.uncertain_points && analysis.uncertain_points.length > 0 && (
        <div className="mt-2 border border-error/50 bg-error/10 px-2 py-1">
          <h3 className="mb-0.5 font-pixel text-[7px] uppercase tracking-wider text-error">Uncertain</h3>
          <ul className="space-y-0.5 font-vt text-sm leading-snug text-ink-dim">
            {analysis.uncertain_points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-auto pt-1 text-right font-vt text-xs text-ink-faint">
        {exportNote && <span className="mr-2 text-success">{exportNote}</span>}
        分析耗时 {result.total_seconds > 0 ? `${result.total_seconds.toFixed(1)}s` : '—'} ·{' '}
        {formatTime(allChords[allChords.length - 1]?.end ?? 0)}
      </p>
    </section>
  )
}
