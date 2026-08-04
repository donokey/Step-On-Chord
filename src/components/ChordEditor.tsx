import { useState } from 'react'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** 性质选项：id 即语义，suffix 拼到根音后形成完整和弦符号 */
const QUALITIES: { id: string; suffix: string }[] = [
  { id: 'major', suffix: '' },
  { id: 'minor', suffix: 'm' },
  { id: 'm7', suffix: 'm7' },
  { id: 'maj7', suffix: 'maj7' },
  { id: '7', suffix: '7' },
  { id: 'm7b5', suffix: 'm7b5' },
  { id: 'dim7', suffix: 'dim7' },
  { id: 'sus4', suffix: 'sus4' },
  { id: 'sus2', suffix: 'sus2' },
  { id: 'dim', suffix: 'dim' },
  { id: 'aug', suffix: 'aug' },
  { id: '6', suffix: '6' },
  { id: 'm6', suffix: 'm6' },
  { id: 'add9', suffix: 'add9' },
]

/** 降号根音 → 等音升号（编辑器统一用升号） */
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
}

function parseChord(chord: string): { root: string; quality: string } {
  const match = chord.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return { root: 'C', quality: 'major' }
  const root = FLAT_TO_SHARP[match[1]] ?? match[1]
  const suffix = match[2]
  const quality = QUALITIES.find((item) => item.suffix === suffix)?.id ?? 'major'
  return { root, quality }
}

export interface ChordEditorProps {
  /** 色块时间标签（如 00:16） */
  timeLabel: string
  /** 当前和弦符号（可能是已校正值） */
  currentChord: string
  /** 该和弦是否已有手动校正（决定「恢复原始」按钮是否显示） */
  hasOverride: boolean
  onApply: (symbol: string) => void
  onRestore: () => void
  onClose: () => void
}

/** 手动校正弹窗：根音 × 性质，像素风模态（补偿模型精度限制的核心交互） */
export function ChordEditor({ timeLabel, currentChord, hasOverride, onApply, onRestore, onClose }: ChordEditorProps) {
  const initial = parseChord(currentChord)
  const [root, setRoot] = useState(initial.root)
  const [quality, setQuality] = useState(initial.quality)

  const suffix = QUALITIES.find((item) => item.id === quality)?.suffix ?? ''
  const preview = root + suffix

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-deep/85"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="panel-pixel pixel-corners panel-tint-magic w-80 px-3 py-2.5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="手动校正和弦"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-pixel text-[9px] uppercase tracking-wider text-warm">校正和弦</h3>
          <span className="font-vt text-sm text-ink-dim">
            {timeLabel} · 当前 <span className="text-ink">{currentChord}</span>
          </span>
        </div>

        <p className="mb-1 font-vt text-xs text-ink-faint">根音</p>
        <div className="mb-2 grid grid-cols-6 gap-1">
          {ROOTS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRoot(item)}
              className={`border px-1 py-0.5 font-vt text-sm transition-colors ${
                item === root
                  ? 'border-edge-glow bg-warm/20 text-warm'
                  : 'border-edge bg-base-deep text-ink-dim hover:border-edge-glow hover:text-ink'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <p className="mb-1 font-vt text-xs text-ink-faint">性质</p>
        <div className="mb-2 grid grid-cols-5 gap-1">
          {QUALITIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setQuality(item.id)}
              className={`border px-1 py-0.5 font-vt text-sm transition-colors ${
                item.id === quality
                  ? 'border-edge-glow bg-magic/25 text-magic-light'
                  : 'border-edge bg-base-deep text-ink-dim hover:border-edge-glow hover:text-ink'
              }`}
            >
              {item.id}
            </button>
          ))}
        </div>

        <div className="mb-2.5 flex items-center justify-between border border-edge bg-base-deep px-2 py-1">
          <span className="font-vt text-xs text-ink-faint">结果</span>
          <span className="stat-value-glow font-pixel text-xs text-warm">{preview}</span>
        </div>

        <div className="flex items-center justify-between gap-1.5">
          <div>
            {hasOverride && (
              <button type="button" onClick={onRestore} className="btn-pixel px-2 py-1 text-xs text-magic-light">
                恢复原始
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={onClose} className="btn-pixel px-2 py-1 text-xs">
              取消
            </button>
            <button type="button" onClick={() => onApply(preview)} className="btn-pixel px-2 py-1 text-xs">
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
