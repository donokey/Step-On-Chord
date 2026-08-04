/** 像素小巫师：Step On Chord 的吉祥物（深夜魔法书房里解读乐谱的小巫师） */

export type WizardState = 'idle' | 'casting' | 'celebrate' | 'confused' | 'listening'

// 12x16 像素帧：尖帽 + 魔杖的小巫师。'.' 为透明，字母映射到色板
const FRAMES: Record<WizardState, string[]> = {
  // 基础站姿（魔杖垂于右手侧，眨眼动画由 CSS 驱动）
  idle: [
    '....PPP.....',
    '...PPPPP....',
    '..PPPPPPP...',
    '.PPPPPPPPP..',
    '.GGGGGGGGG..',
    '..KFFFFFK...',
    '..KFEFFEK...',
    '..KFFFFFFK..',
    '...KFFFFK...',
    '...BBBBBB...',
    '..BBBBBBBB..',
    '.WBBBBBBBW..',
    '..BBBBBBBM..',
    '....BBBB.M..',
    '....L..L.S..',
    '...LL..LL...',
  ],
  // 挥魔杖（魔杖举至右上方，顶端闪星）
  casting: [
    '....PPP...S.',
    '...PPPPP..M.',
    '..PPPPPPP.M.',
    '.PPPPPPPPPM.',
    '.GGGGGGGGGM.',
    '..KFFFFFK...',
    '..KFEFFEK...',
    '..KFFFFFFK..',
    '...KFFFFK...',
    '...BBBBBB...',
    '..BBBBBBBB..',
    '.WBBBBBBBW..',
    '..BBBBBBBB..',
    '....BBBB....',
    '....L..L....',
    '...LL..LL...',
  ],
  // 双手举起庆祝
  celebrate: [
    '....PPP.....',
    '...PPPPP....',
    '..PPPPPPP...',
    '.PPPPPPPPP..',
    '.GGGGGGGGG..',
    'W.KFFFFFK.W.',
    'WWKFEFFEKWW.',
    '.WKFFFFFFKW.',
    '..KFFFFFFK..',
    '...BBBBBB...',
    '..BBBBBBBB..',
    '..BBBBBBBB..',
    '....BBBB....',
    '....BBBB....',
    '....L..L....',
    '...LL..LL...',
  ],
  // 帽子歪了 + 头顶问号
  confused: [
    '...PPP....Q.',
    '..PPPPP...Q.',
    '.PPPPPPP..Q.',
    '.PPPPPPPP...',
    '.GGGGGGGGG..',
    '..KFFFFFK...',
    '..KFEFFEK...',
    '..KFFFFFFK..',
    '...KFFFFK...',
    '...BBBBBB...',
    '..BBBBBBBB..',
    '.WBBBBBBBW..',
    '..BBBBBBBM..',
    '....BBBB.M..',
    '....L..L.S..',
    '...LL..LL...',
  ],
  // 戴耳机聆听
  listening: [
    '....PPP.....',
    '...PPPPP....',
    '..PPPPPPP...',
    '.PPPPPPPPP..',
    '.GGGGGGGGG..',
    '..KFFFFFK...',
    '.HKFEFFEKH..',
    '.HKFFFFFFKH.',
    '..KFFFFFFK..',
    '...BBBBBB...',
    '..BBBBBBBB..',
    '.WBBBBBBBW..',
    '..BBBBBBBM..',
    '....BBBB.M..',
    '....L..L.S..',
    '...LL..LL...',
  ],
}

const COLORS: Record<string, string> = {
  P: '#7b5ea7', // 尖帽（魔法紫）
  G: '#d4a039', // 帽檐（烛光金）
  K: '#5a4632', // 发际线（中棕）
  F: '#f0c8a2', // 皮肤
  E: '#1c1410', // 眼睛
  B: '#3f2f5a', // 长袍（暗紫）
  W: '#f0c8a2', // 手（肤色）
  M: '#8a5a2a', // 魔杖（木棕）
  S: '#ffd966', // 魔杖尖星（亮金）
  H: '#d4a039', // 耳机（金）
  Q: '#d4a039', // 问号（金）
  L: '#2a2036', // 袍摆（暗紫黑）
}

const STATE_ANIMATION: Record<WizardState, string> = {
  idle: 'wizard-idle',
  casting: 'wizard-casting',
  celebrate: 'wizard-celebrate',
  confused: '',
  listening: 'wizard-listening',
}

const STATE_LABEL: Record<WizardState, string> = {
  idle: '小巫师等待中',
  casting: '小巫师施法中',
  celebrate: '小巫师庆祝中',
  confused: '小巫师困惑中',
  listening: '小巫师聆听中',
}

export function PixelBuddy({
  state = 'idle',
  scale = 5,
  orbit = false,
  bubble,
}: {
  state?: WizardState
  scale?: number
  /** 是否显示三颗环绕小星（星座感，适合 idle / listening 等安静状态） */
  orbit?: boolean
  /** 头顶气泡文字（完成庆祝等短暂提示） */
  bubble?: string
}) {
  const rows = FRAMES[state]
  const width = rows[0].length
  const height = rows.length

  return (
    <div className="relative inline-flex">
      <svg
        width={width * scale}
        height={height * scale}
        viewBox={`0 0 ${width} ${height}`}
        shapeRendering="crispEdges"
        className={STATE_ANIMATION[state]}
        role="img"
        aria-label={STATE_LABEL[state]}
      >
        {rows.flatMap((row, y) =>
          [...row].map((cell, x) => {
            if (cell === '.') return null
            // idle 状态眼睛眨眼 + 杖尖闪光；confused 问号脉动
            const className =
              cell === 'E' && state === 'idle'
                ? 'wizard-eye'
                : cell === 'S' && state === 'idle'
                  ? 'wand-twinkle'
                  : cell === 'Q'
                    ? 'confused-mark'
                    : undefined
            return (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[cell]} className={className} />
            )
          }),
        )}
      </svg>

      {state === 'casting' && (
        <>
          <span className="magic-star magic-star-a" />
          <span className="magic-star magic-star-b" />
          <span className="magic-star magic-star-c" />
          <span className="magic-star magic-star-d" />
        </>
      )}
      {state === 'celebrate' && (
        <>
          <span className="confetti confetti-a" />
          <span className="confetti confetti-b" />
          <span className="confetti confetti-c" />
          <span className="confetti confetti-d" />
        </>
      )}
      {orbit && (
        <div className="wizard-orbit" aria-hidden="true">
          <span className="orbit-star orbit-star-a" />
          <span className="orbit-star orbit-star-b" />
          <span className="orbit-star orbit-star-c" />
        </div>
      )}
      {bubble && <div className="speech-bubble font-vt">{bubble}</div>}
    </div>
  )
}
