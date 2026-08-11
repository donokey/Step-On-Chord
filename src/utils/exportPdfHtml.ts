import type { SongProject } from '../shared/project-model'

/** HTML 特殊字符转义（项目名/歌词可能含 <>&"） */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 由歌曲项目生成打印用乐谱 HTML（浅色底、A4 排版，供隐藏窗口 printToPDF）。
 *
 * 结构：标题 → 元信息（调性/调式/BPM/拍号）→ 按段落组织和弦（校正值）→ 歌词附文末。
 * 降级：无分析结果只出标题+歌词；无歌词只出乐谱部分。
 */
export function buildScoreHtml(project: SongProject): string {
  const title = esc(project.name.trim() || 'Untitled')
  const overall = project.analysis?.analysis.overall
  const metaParts: string[] = []
  if (overall?.key) metaParts.push(`调性 ${esc(overall.key)}${overall.mode ? ` ${esc(overall.mode)}` : ''}`)
  if (overall?.tempo_bpm != null) metaParts.push(`${overall.tempo_bpm} BPM`)
  if (overall?.time_signature) metaParts.push(`拍号 ${esc(overall.time_signature)}`)

  const sectionBlocks: string[] = []
  for (const section of project.analysis?.analysis.sections ?? []) {
    const chords = section.chords.map((event) => esc(event.display_chord ?? event.chord)).join('  ')
    sectionBlocks.push(
      `<section><h2>${esc(section.name)}</h2><p class="chords">${chords || '&nbsp;'}</p></section>`,
    )
  }

  const lyricsBlocks: string[] = []
  for (const section of project.lyrics.sections) {
    const label = esc(section.title.trim() || section.type)
    const body = esc(section.text.trim()).replace(/\n/g, '<br/>')
    lyricsBlocks.push(`<section><h2>${label}</h2><p class="lyrics">${body || '&nbsp;'}</p></section>`)
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; color: #1c1c1e; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  .meta { color: #555; font-size: 10.5pt; margin-bottom: 14pt; }
  h2 { font-size: 12pt; color: #7a5c1e; border-bottom: 1px solid #ddd; padding-bottom: 2pt; margin: 12pt 0 4pt; }
  .chords { font-family: Consolas, monospace; font-size: 11pt; letter-spacing: 0.5pt; white-space: pre-wrap; }
  .lyrics { font-size: 11pt; line-height: 1.8; white-space: pre-wrap; }
  .lyrics-title { margin-top: 18pt; font-size: 13pt; color: #333; }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${metaParts.length > 0 ? `<p class="meta">${metaParts.join(' · ')}</p>` : ''}
  ${sectionBlocks.join('\n  ')}
  ${lyricsBlocks.length > 0 ? `<h2 class="lyrics-title">歌词</h2>\n  ${lyricsBlocks.join('\n  ')}` : ''}
</body>
</html>`
}

/** PDF 导出默认文件名 */
export function scorePdfFileName(project: SongProject): string {
  return `${project.name.trim() || 'untitled'}.pdf`
}
