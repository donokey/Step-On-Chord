import { describe, expect, it } from 'vitest'
import { buildChordPro, chordProFileName } from '../exportChordPro'
import { createProject, type SongProject } from '../../shared/project-model'
import type { AnalysisResult } from '../../types/analysis'

function withAnalysis(project: SongProject): SongProject {
  const analysis = {
    analysis: {
      title_guess: null,
      song_description: '',
      overall: { key: 'G', mode: 'major', tempo_bpm: 120, time_signature: '4/4' },
      lyrics_segments: [],
      sections: [
        {
          name: 'Verse 1',
          section_type: 'Verse',
          start: '00:00',
          end: '00:30',
          chords: [
            { time: '00:00', time_seconds: 0, chord: 'G', display_chord: 'G' },
            { time: '00:04', time_seconds: 4, chord: 'Em', display_chord: 'Em7', manual_override: true },
          ],
        },
        {
          name: 'Chorus',
          section_type: 'Chorus',
          start: '00:30',
          end: '01:00',
          chords: [{ time: '00:30', time_seconds: 30, chord: 'C' }],
        },
      ],
    },
    file: { name: 'x.mp3', path: 'x.mp3' },
    elapsed_seconds: 1,
  } as unknown as AnalysisResult
  return { ...project, analysis }
}

describe('buildChordPro', () => {
  it('完整项目：头部 + 段落和弦（用校正值）+ 歌词附文末', () => {
    const project = withAnalysis(createProject('晴天'))
    project.lyrics.sections = [
      { id: 's1', type: 'verse', title: '主歌1', text: '故事的小黄花\n从出生那年就飘着' },
    ]
    const out = buildChordPro(project)
    expect(out).toContain('{title: 晴天}')
    expect(out).toContain('{key: G major}')
    expect(out).toContain('{tempo: 120}')
    expect(out).toContain('[Verse 1]')
    // 用校正后的 display_chord（Em7），不含原始值 Em 单独出现
    expect(out).toContain('G  Em7')
    expect(out).toContain('{comment: 歌词}')
    expect(out).toContain('[主歌1]')
    expect(out).toContain('故事的小黄花')
    expect(out.endsWith('\n')).toBe(true)
  })

  it('降级：无分析结果只出头部+歌词', () => {
    const project = createProject('新歌')
    project.lyrics.sections = [{ id: 's1', type: 'chorus', title: '', text: '啦啦啦' }]
    const out = buildChordPro(project)
    expect(out).toContain('{title: 新歌}')
    expect(out).not.toContain('{key:')
    expect(out).toContain('[chorus]') // 无标题时用类型名
    expect(out).toContain('啦啦啦')
  })

  it('降级：无歌词只出头部+和弦', () => {
    const project = withAnalysis(createProject('纯音乐'))
    const out = buildChordPro(project)
    expect(out).toContain('{title: 纯音乐}')
    expect(out).toContain('[Chorus]')
    expect(out).not.toContain('{comment: 歌词}')
  })

  it('降级：两者皆无只出头部', () => {
    const project = createProject('空白')
    const out = buildChordPro(project)
    expect(out.trim()).toBe('{title: 空白}')
  })
})

describe('chordProFileName', () => {
  it('用项目名作为文件名', () => {
    expect(chordProFileName(createProject('晴天'))).toBe('晴天.cho')
  })
})
