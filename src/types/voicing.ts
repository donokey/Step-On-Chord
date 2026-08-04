/** /api/voicing-candidates 返回的吉他和弦指法数据（对齐 backend/chordcraft_api.py 的输出） */

export interface VoicingCandidate {
  symbol: string
  /** 形状字符串，如 x32010（x=闷音） */
  shape: string
  /** 六弦品位（index 0 = 低音 E 弦）：null/<0 闷音，0 空弦，>0 品位 */
  frets: (number | null)[]
  /** 按弦的手指编号（1-4，0/缺省为未标注） */
  fingers: number[]
  /** 把位（1 = 开放把位） */
  position: number
  barres: number[]
  difficulty: number | null
  tags: string[]
  annotation_key: string
  annotation: { commonness?: number; status?: string } | null
}

export interface VoicingResponse {
  progression: string
  chords: string[]
  candidate_limit: number
  candidates: Record<string, VoicingCandidate[]>
  annotation_count: number
  database_available: boolean
}
