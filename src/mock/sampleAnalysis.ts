import type { AnalysisResult, ChordEvent, DisplaySection, SongAnalysis } from '../types/analysis'

/**
 * 演示数据：虚拟曲目《星夜小调》（C 大调 · 128 BPM · 4/4 · 3 分 20 秒）。
 * 结构与 /api/analyze 的真实返回一致，用于界面演示与开发调试。
 */

function chord(start: number, end: number, symbol: string): ChordEvent {
  return {
    time: ts(start),
    time_seconds: start,
    chord: symbol,
    display_chord: symbol,
    end: ts(end),
    end_seconds: end,
  }
}

function ts(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function section(
  type: string,
  name: string,
  start: number,
  end: number,
  chords: ChordEvent[],
): DisplaySection {
  return {
    name,
    section_type: type,
    start: ts(start),
    end: ts(end),
    chords,
    child_sections: [
      {
        name,
        section_type: type,
        start: ts(start),
        end: ts(end),
        start_seconds: start,
        end_seconds: end,
        chords,
      },
    ],
  }
}

const VERSE_CHORDS_1 = [
  chord(8, 12, 'C'),
  chord(12, 16, 'G'),
  chord(16, 20, 'Am'),
  chord(20, 24, 'Em'),
  chord(24, 28, 'F'),
  chord(28, 32, 'C'),
  chord(32, 35, 'F'),
  chord(35, 38, 'G'),
]

const CHORUS_CHORDS_1 = [
  chord(38, 42, 'F'),
  chord(42, 46, 'G'),
  chord(46, 50, 'Em'),
  chord(50, 54, 'Am'),
  chord(54, 58, 'F'),
  chord(58, 62, 'G'),
  chord(62, 68, 'C'),
]

const VERSE_CHORDS_2 = [
  chord(68, 72, 'C'),
  chord(72, 76, 'G'),
  chord(76, 80, 'Am'),
  chord(80, 84, 'Em'),
  chord(84, 88, 'F'),
  chord(88, 92, 'C'),
  chord(92, 95, 'F'),
  chord(95, 98, 'G'),
]

const CHORUS_CHORDS_2 = [
  chord(98, 102, 'F'),
  chord(102, 106, 'G'),
  chord(106, 110, 'Em'),
  chord(110, 114, 'Am'),
  chord(114, 118, 'F'),
  chord(118, 122, 'G'),
  chord(122, 128, 'C'),
]

const BRIDGE_CHORDS = [
  chord(128, 132, 'Am'),
  chord(132, 136, 'Em'),
  chord(136, 140, 'F'),
  chord(140, 144, 'C'),
  chord(144, 148, 'Dm'),
  chord(148, 152, 'G'),
  chord(152, 155, 'E'),
  chord(155, 158, 'Am'),
]

const CHORUS_CHORDS_3 = [
  chord(158, 162, 'F'),
  chord(162, 166, 'G'),
  chord(166, 170, 'Em'),
  chord(170, 174, 'Am'),
  chord(174, 178, 'F'),
  chord(178, 182, 'G'),
  chord(182, 188, 'C'),
]

export const SAMPLE_ANALYSIS: SongAnalysis = {
  title_guess: null,
  song_description: '（演示数据）深夜魔法书房里的示例曲目。',
  overall: {
    key: 'C',
    mode: 'major',
    tempo_bpm: 128,
    time_signature: '4/4',
    capo_suggestion: null,
    feel: null,
    confidence: 'high',
  },
  lyrics_segments: [],
  sections: [
    section('Intro', 'Intro', 0, 8, [chord(0, 4, 'C'), chord(4, 8, 'G')]),
    section('Verse', 'Verse 1', 8, 38, VERSE_CHORDS_1),
    section('Chorus', 'Chorus 1', 38, 68, CHORUS_CHORDS_1),
    section('Verse', 'Verse 2', 68, 98, VERSE_CHORDS_2),
    section('Chorus', 'Chorus 2', 98, 128, CHORUS_CHORDS_2),
    section('Bridge', 'Bridge', 128, 158, BRIDGE_CHORDS),
    section('Chorus', 'Chorus 3', 158, 188, CHORUS_CHORDS_3),
    section('Outro', 'Outro', 188, 200, [chord(188, 192, 'F'), chord(192, 196, 'G'), chord(196, 200, 'C')]),
  ],
  global_chord_progressions: [
    { label: 'Chorus 1', progression: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C'], where: '00:38 - 01:08' },
    { label: 'Verse 1', progression: ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'], where: '00:08 - 00:38' },
    { label: 'Bridge', progression: ['Am', 'Em', 'F', 'C', 'Dm', 'G', 'E', 'Am'], where: '02:08 - 02:38' },
  ],
  practice_tips: [
    '先用 128 BPM 的 70%-80% 慢速练习，再回到原速。',
    '先循环练主歌/副歌的核心走向，再把前奏、桥段和尾奏接进完整结构。',
    '对标注 ? 的和弦单独回放确认低音走向和三音色彩。',
  ],
  uncertain_points: [],
  workflow: {
    mode: 'local',
    steps: [
      { name: 'songformer_structure', status: 'done', engine: 'songformer-local' },
      { name: 'automatic_chord_recognition', status: 'done', engine: 'plkd-btc' },
      { name: 'map_chords_to_sections', status: 'done', sections: 8 },
      { name: 'group_sections', status: 'done', sections: 8 },
    ],
    notes: [],
  },
}

export const DEMO_RESULT: AnalysisResult = {
  file: { name: '星夜小调（演示）.mp3', path: '' },
  analysis: SAMPLE_ANALYSIS,
  markdown: '',
  raw: '',
  elapsed_seconds: 0,
  total_seconds: 0,
}
