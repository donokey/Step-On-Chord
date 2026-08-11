import { describe, expect, it } from 'vitest'
import { buildScoreHtml } from '../exportPdfHtml'
import { buildLyricsDocxBase64, lyricsDocxFileName } from '../exportLyricsDocx'
import { createProject } from '../../shared/project-model'

describe('buildScoreHtml', () => {
  it('包含标题与转义后的歌词', () => {
    const project = createProject('我的<歌>')
    project.lyrics.sections = [{ id: 's1', type: 'verse', title: '主歌', text: '第一行\n第二行' }]
    const html = buildScoreHtml(project)
    expect(html).toContain('我的&lt;歌&gt;')
    expect(html).not.toContain('我的<歌>')
    expect(html).toContain('第一行<br/>第二行')
    expect(html).toContain('歌词')
  })

  it('无分析无歌词也能出合法 HTML', () => {
    const html = buildScoreHtml(createProject('空白'))
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('空白')
  })
})

describe('buildLyricsDocxBase64', () => {
  it('生成合法 ZIP（PK 头）且含 document.xml', async () => {
    const project = createProject('晴天')
    project.lyrics.sections = [{ id: 's1', type: 'verse', title: '主歌1', text: '故事的小黄花' }]
    const base64 = await buildLyricsDocxBase64(project)
    const bytes = Buffer.from(base64, 'base64')
    // ZIP 魔数 PK\x03\x04
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(bytes.toString('latin1')).toContain('word/document.xml')
  })

  it('无歌词时不抛错', async () => {
    const base64 = await buildLyricsDocxBase64(createProject('空白'))
    expect(base64.length).toBeGreaterThan(100)
  })
})

describe('lyricsDocxFileName', () => {
  it('项目名-歌词.docx', () => {
    expect(lyricsDocxFileName(createProject('晴天'))).toBe('晴天-歌词.docx')
  })
})
