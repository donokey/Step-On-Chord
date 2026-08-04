import type { VoicingCandidate } from '../types/voicing'

/** 单个指法候选卡：6 弦网格图（CSS 绘制）+ 形状/把位/难度等元信息 */
export function VoicingCard({ candidate }: { candidate: VoicingCandidate }) {
  const preferred = candidate.annotation?.status === 'preferred'
  return (
    <div className="flex items-start gap-2 border border-edge bg-base-deep px-2 py-1.5">
      <FretDiagram frets={candidate.frets} fingers={candidate.fingers} position={candidate.position} />
      <div className="min-w-0 font-vt text-xs leading-relaxed text-ink-dim">
        <p className="text-ink">
          {candidate.shape}
          {preferred && <span className="ml-1 text-success">✓</span>}
        </p>
        {candidate.position > 1 && <p>{candidate.position} 把位</p>}
        {candidate.barres.length > 0 && <p className="text-magic-light">横按 {candidate.barres.join('、')} 品</p>}
        {candidate.difficulty !== null && <p>难度 {candidate.difficulty}/10</p>}
        {candidate.annotation?.commonness !== undefined && <p>常用度 {candidate.annotation.commonness}</p>}
        {candidate.tags.length > 0 && <p className="truncate text-ink-faint">{candidate.tags.join(' · ')}</p>}
      </div>
    </div>
  )
}

/** 6 弦 × 4 品网格图：左起低音 E 弦；× 闷音 / ○ 空弦；金块 = 按弦点（内标手指号） */
function FretDiagram({ frets, fingers, position }: { frets: (number | null)[]; fingers: number[]; position: number }) {
  const base = position > 1 ? position : 1
  const rows = 4
  return (
    <div className="shrink-0">
      {/* 弦上标记行 */}
      <div className="grid grid-cols-6">
        {frets.slice(0, 6).map((fret, index) => (
          <span key={index} className="flex h-3.5 w-4 items-center justify-center font-vt text-[10px] leading-none text-ink-dim">
            {fret === null || fret < 0 ? '×' : fret === 0 ? '○' : ''}
          </span>
        ))}
      </div>
      {/* 品格网格（开放把位时顶部为加粗琴枕线） */}
      <div
        className={`grid grid-cols-6 border-b border-l border-r border-edge ${
          base === 1 ? 'border-t-2 border-t-ink-dim' : 'border-t border-t-edge'
        }`}
      >
        {Array.from({ length: rows * 6 }, (_, idx) => {
          const row = Math.floor(idx / 6)
          const stringIndex = idx % 6
          const fretValue = frets[stringIndex]
          const pressed = fretValue !== null && fretValue > 0 && fretValue === base + row
          const finger = fingers[stringIndex]
          return (
            <span
              key={idx}
              className="flex h-4 w-4 items-center justify-center border-r border-t border-edge/60"
            >
              {pressed && (
                <span className="flex h-3 w-3 items-center justify-center bg-warm font-vt text-[9px] leading-none text-base-deep">
                  {finger > 0 ? finger : ''}
                </span>
              )}
            </span>
          )
        })}
      </div>
      {base > 1 && <p className="mt-0.5 font-vt text-[10px] leading-none text-ink-faint">{base}fr</p>}
    </div>
  )
}
