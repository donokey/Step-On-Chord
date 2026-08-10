import { describe, it, expect } from 'vitest'
import {
  PROJECT_FORMAT,
  PROJECT_VERSION,
  createProject,
  validateProject,
  parseProject,
  serializeProject,
  setProjectAudio,
  clearProjectAudio,
  setProjectAnalysis,
  upsertLyricsSection,
  removeLyricsSection,
  reorderLyricsSections,
  addAttachment,
  updateAttachment,
  removeAttachment,
  touchProject,
} from '../project-model'

const NOW = 1_730_000_000_000

describe('createProject', () => {
  it('创建基础项目（空歌词/无附件/无音频）', () => {
    const p = createProject('晴天', NOW)
    expect(p.format).toBe(PROJECT_FORMAT)
    expect(p.version).toBe(PROJECT_VERSION)
    expect(p.name).toBe('晴天')
    expect(p.created_at).toBe(NOW)
    expect(p.updated_at).toBe(NOW)
    expect(p.audio).toBeNull()
    expect(p.analysis).toBeNull()
    expect(p.lyrics.sections).toEqual([])
    expect(p.attachments).toEqual([])
  })

  it('项目名去空格，空名抛错', () => {
    expect(createProject('  晴 天  ', NOW).name).toBe('晴 天')
    expect(() => createProject('   ', NOW)).toThrow('项目名不能为空')
  })
})

describe('validateProject / parseProject / serializeProject', () => {
  it('序列化-解析往返保持一致', () => {
    const p = createProject('demo', NOW)
    const p2 = setProjectAudio(p, { mode: 'reference', path: 'D:/music/a.mp3', file_name: 'a.mp3' })
    const parsed = parseProject(serializeProject(p2))
    expect(parsed).toEqual(p2)
  })

  it('格式不符抛错', () => {
    expect(() => validateProject({ format: 'other', version: 1, name: 'x' })).toThrow('格式不匹配')
  })

  it('版本不支持抛错', () => {
    expect(() => validateProject({ format: PROJECT_FORMAT, version: 99, name: 'x' })).toThrow('版本不支持')
  })

  it('非法 JSON 抛错', () => {
    expect(() => parseProject('{not json')).toThrow('不是合法 JSON')
  })

  it('歌词节类型不合法抛错', () => {
    const bad = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      name: 'x',
      lyrics: { sections: [{ id: 's1', type: 'weird', title: '', text: '' }] },
    }
    expect(() => validateProject(bad)).toThrow('歌词节类型不合法')
  })

  it('附件类型不合法抛错', () => {
    const bad = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      name: 'x',
      attachments: [{ id: 'a1', kind: 'weird' }],
    }
    expect(() => validateProject(bad)).toThrow('附件类型不合法')
  })

  it('缺省字段自动补默认值', () => {
    const parsed = validateProject({ format: PROJECT_FORMAT, version: PROJECT_VERSION, name: 'x' })
    expect(parsed.lyrics.sections).toEqual([])
    expect(parsed.attachments).toEqual([])
    expect(parsed.audio).toBeNull()
  })
})

describe('不可变操作', () => {
  it('touchProject 只更新 updated_at，不修改原对象', () => {
    const p = createProject('a', NOW)
    const touched = touchProject(p, NOW + 1000)
    expect(p.updated_at).toBe(NOW)
    expect(touched.updated_at).toBe(NOW + 1000)
  })

  it('setProjectAudio / clearProjectAudio', () => {
    let p = createProject('a', NOW)
    p = setProjectAudio(p, { mode: 'copy', path: 'D:/x.mp3', file_name: 'x.mp3' })
    expect(p.audio?.mode).toBe('copy')
    p = clearProjectAudio(p)
    expect(p.audio).toBeNull()
  })

  it('setProjectAnalysis 存分析结果', () => {
    const p = createProject('a', NOW)
    const analysis = { file: { name: 'x', path: 'y' }, analysis: {} as never, markdown: '', raw: '', elapsed_seconds: 1, total_seconds: 1 }
    const p2 = setProjectAnalysis(p, analysis as never)
    expect(p2.analysis).toBe(analysis)
    expect(p.analysis).toBeNull()
  })

  it('歌词节增/改/删/排序', () => {
    let p = createProject('a', NOW)
    p = upsertLyricsSection(p, { id: 's1', type: 'verse', title: '主歌1', text: '第一段' })
    p = upsertLyricsSection(p, { id: 's2', type: 'chorus', title: '副歌', text: '副歌词' })
    expect(p.lyrics.sections).toHaveLength(2)
    // 更新已有节
    p = upsertLyricsSection(p, { id: 's1', type: 'verse', title: '主歌1改', text: '新词' })
    expect(p.lyrics.sections).toHaveLength(2)
    expect(p.lyrics.sections[0].title).toBe('主歌1改')
    // 排序
    p = reorderLyricsSections(p, ['s2', 's1'])
    expect(p.lyrics.sections.map((s) => s.id)).toEqual(['s2', 's1'])
    // 排序 id 不一致抛错
    expect(() => reorderLyricsSections(p, ['s1'])).toThrow('排序 id 列表与现有节不一致')
    // 删除
    p = removeLyricsSection(p, 's1')
    expect(p.lyrics.sections.map((s) => s.id)).toEqual(['s2'])
  })

  it('附件增/改/删', () => {
    let p = createProject('a', NOW)
    p = addAttachment(p, { id: 'att1', name: 'demo.mp3', rel_path: 'attachments/demo.mp3', kind: 'demo', note: '', size: 12_345, added_at: NOW })
    expect(p.attachments).toHaveLength(1)
    expect(p.attachments[0].size).toBe(12_345)
    p = updateAttachment(p, 'att1', { note: '第一版' })
    expect(p.attachments[0].note).toBe('第一版')
    p = removeAttachment(p, 'att1')
    expect(p.attachments).toHaveLength(0)
    // 不可变：原对象不受影响
    const orig = createProject('b', NOW)
    const withAtt = addAttachment(orig, { id: 'x', name: 'n', rel_path: 'r', kind: 'other', note: '', size: 0, added_at: NOW })
    expect(orig.attachments).toHaveLength(0)
    expect(withAtt.attachments).toHaveLength(1)
  })

  it('旧附件数据缺 size 字段时默认 0（向后兼容）', () => {
    const legacy = validateProject({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      name: 'x',
      attachments: [{ id: 'a1', name: 'n', rel_path: 'attachments/n', kind: 'other', note: '', added_at: NOW }],
    })
    expect(legacy.attachments[0].size).toBe(0)
    // 序列化-解析往返保留 size
    const p = addAttachment(createProject('a', NOW), {
      id: 'att1', name: 'f.mp3', rel_path: 'attachments/f.mp3', kind: 'demo', note: '', size: 2048, added_at: NOW,
    })
    expect(parseProject(serializeProject(p)).attachments[0].size).toBe(2048)
  })
})
