import type { SongProject } from '../shared/project-model'

/**
 * 由歌曲项目生成 ChordPro 文本（.cho）。
 *
 * 方言约定（spec 3.4，2026-09-10 修订为标准兼容）：
 * - 头部指令：{title} / {key} / {tempo}
 * - 段落标题用 {comment: 段落名}（标准 [xxx] 是行内和弦标记，作段落头会被第三方解析器拆成假和弦）
 * - 和弦序列为纯和弦行：[C] [G] [Am]（歌词与和弦不对齐，v1 不做行内嵌和弦）
 * - 歌词附在文末 {comment: 歌词} 之后，按分节给出
 * - 降级：无分析结果只出头部+歌词；无歌词只出头部+和弦；两者皆无只出头部
 */
export function buildChordPro(project: SongProject): string {
  const lines: string[] = []
  const title = project.name.trim() || 'Untitled'
  lines.push(`{title: ${title}}`)

  const overall = project.analysis?.analysis.overall
  if (overall?.key) {
    lines.push(`{key: ${overall.key}${overall.mode ? ` ${overall.mode}` : ''}}`)
  }
  if (overall?.tempo_bpm != null) {
    lines.push(`{tempo: ${overall.tempo_bpm}}`)
  }
  lines.push('')

  const sections = project.analysis?.analysis.sections ?? []
  for (const section of sections) {
    lines.push(`{comment: ${section.name}}`)
    const chordLine = section.chords
      .map((event) => `[${event.display_chord ?? event.chord}]`)
      .join('  ')
    if (chordLine) lines.push(chordLine)
    lines.push('')
  }

  const lyricsSections = project.lyrics.sections
  if (lyricsSections.length > 0) {
    lines.push('{comment: 歌词}')
    lines.push('')
    for (const section of lyricsSections) {
      const label = section.title.trim() || section.type
      lines.push(`{comment: ${label}}`)
      const text = section.text.trim()
      if (text) lines.push(text)
      lines.push('')
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/** 导出文件基名（项目名），供保存对话框默认文件名用 */
export function chordProFileName(project: SongProject): string {
  return `${project.name.trim() || 'untitled'}.cho`
}
