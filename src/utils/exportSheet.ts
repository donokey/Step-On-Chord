import type { AnalysisResult } from '../types/analysis'

/** 导出文件的基名：歌名猜测 → 音频文件名去扩展名 */
export function chordSheetBaseName(result: AnalysisResult): string {
  return (result.analysis.title_guess ?? result.file.name.replace(/\.[^.]+$/, '')) || 'chord-sheet'
}

/**
 * 由分析结果生成和弦谱文本（md / txt 两种格式）。
 * 直接读取当前 result 对象——手动校正后的和弦即时生效，
 * 校正过的和弦以 * 标注。
 */
export function buildChordSheet(result: AnalysisResult, format: 'md' | 'txt'): string {
  const { analysis, elapsed_seconds } = result
  const { overall, sections, practice_tips } = analysis

  const title = chordSheetBaseName(result)
  const keyText = overall.key ? `${overall.key} ${overall.mode ?? ''}`.trim() : '未知'
  const bpmText = overall.tempo_bpm !== null ? `${overall.tempo_bpm} BPM` : '未知'
  const timeText = overall.time_signature ?? '未知'
  const confText = overall.confidence ?? '未知'
  const hasOverrides = sections.some((section) => section.chords.some((event) => event.manual_override))

  const sectionBlocks = sections.map((section) => {
    const chordLine = section.chords
      .map((event) => `${event.display_chord ?? event.chord}${event.manual_override ? '*' : ''} (${event.time})`)
      .join('  ')
    return { name: section.name, start: section.start, end: section.end, chordLine }
  })

  if (format === 'txt') {
    const lines = [
      title,
      `调性：${keyText} · 速度：${bpmText} · 拍号：${timeText} · 置信度：${confText}`,
      `分析耗时：${elapsed_seconds > 0 ? `${elapsed_seconds.toFixed(1)}s` : '—'}${hasOverrides ? ' · 含手动校正（* 标记）' : ''}`,
      '',
    ]
    for (const block of sectionBlocks) {
      lines.push(`[${block.name}] ${block.start} - ${block.end}`)
      lines.push(block.chordLine || '（无和弦）')
      lines.push('')
    }
    if (practice_tips && practice_tips.length > 0) {
      lines.push('练习建议：')
      for (const tip of practice_tips) lines.push(`- ${tip}`)
    }
    return lines.join('\n')
  }

  // Markdown
  const lines = [
    `# ${title}`,
    '',
    `- **调性**：${keyText}`,
    `- **速度**：${bpmText}`,
    `- **拍号**：${timeText}`,
    `- **置信度**：${confText}`,
    `- **分析耗时**：${elapsed_seconds > 0 ? `${elapsed_seconds.toFixed(1)}s` : '—'}`,
    '',
  ]
  if (hasOverrides) {
    lines.push('> `*` = 手动校正过的和弦', '')
  }
  for (const block of sectionBlocks) {
    lines.push(`## ${block.name} [${block.start} - ${block.end}]`)
    lines.push('')
    lines.push(block.chordLine || '（无和弦）')
    lines.push('')
  }
  if (practice_tips && practice_tips.length > 0) {
    lines.push('## 练习建议', '')
    for (const tip of practice_tips) lines.push(`- ${tip}`)
    lines.push('')
  }
  return lines.join('\n')
}
