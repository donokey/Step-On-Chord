/** /api/analyze 返回的分析数据结构（对齐 backend/song_analysis.py 的输出） */

export interface ChordEvent {
  time: string
  time_seconds: number
  chord: string
  display_chord?: string
  raw_chord?: string | null
  arrangement_chord?: string
  end?: string
  end_seconds?: number
  starts_before_section?: boolean
  continues_after_section?: boolean
  overlap_seconds?: number
  /** 手动校正标记（校正后 chord/display_chord 为新值，original_chord 保留模型原输出） */
  manual_override?: boolean
  original_chord?: string
}

/** raw_sections 的元素（assign_chords_to_sections 输出） */
export interface SectionChild {
  name: string
  section_type?: string
  start: string
  end: string
  start_seconds?: number
  end_seconds?: number
  chords: ChordEvent[]
  source_sections?: unknown[]
  source_label?: string
}

/** sections 的元素（_group_display_sections 按段落类型归并后） */
export interface DisplaySection {
  name: string
  section_type: string
  start: string
  end: string
  chords: ChordEvent[]
  child_sections?: SectionChild[]
}

export interface AnalysisOverall {
  key: string | null
  mode: string | null
  tempo_bpm: number | null
  time_signature: string | null
  capo_suggestion?: string | null
  feel?: string | null
  confidence?: string
}

export interface GlobalProgression {
  label: string
  progression: string[]
  where: string
}

export interface WorkflowStep {
  name: string
  status: string
  engine?: string
  sections?: number
}

export interface SongAnalysis {
  title_guess: string | null
  song_description: string
  overall: AnalysisOverall
  lyrics_segments: unknown[]
  sections: DisplaySection[]
  raw_sections?: SectionChild[]
  global_chord_progressions?: GlobalProgression[]
  practice_tips?: string[]
  uncertain_points?: string[]
  workflow?: {
    mode: string
    steps: WorkflowStep[]
    notes: string[]
  }
}

/** POST /api/analyze 的完整响应 */
export interface AnalysisResult {
  file: { name: string; path: string }
  analysis: SongAnalysis
  markdown: string
  raw: string
  elapsed_seconds: number
  total_seconds: number
}
