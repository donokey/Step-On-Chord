import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { SongProject } from '../shared/project-model'

/**
 * 由歌曲项目的歌词生成 docx（base64 编码，供 save-binary IPC 写盘）。
 *
 * 结构：标题（项目名）→ 每节歌词 = 节标题（HEADING_2）+ 逐行正文。
 * 无歌词时仍生成只有标题的文档（不抛错，由调用方决定是否允许导出）。
 */
export async function buildLyricsDocxBase64(project: SongProject): Promise<string> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun(project.name.trim() || '歌词')],
    }),
  ]

  for (const section of project.lyrics.sections) {
    const label = section.title.trim() || section.type
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(label)],
      }),
    )
    for (const line of section.text.split('\n')) {
      children.push(new Paragraph({ children: [new TextRun(line)] }))
    }
  }

  const doc = new Document({
    creator: 'Step On Chord',
    title: project.name.trim() || '歌词',
    sections: [{ children }],
  })
  return Packer.toBase64String(doc)
}

/** docx 导出默认文件名 */
export function lyricsDocxFileName(project: SongProject): string {
  return `${project.name.trim() || 'untitled'}-歌词.docx`
}
