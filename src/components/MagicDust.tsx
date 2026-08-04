import { useMemo } from 'react'

/** 微尘颜色：烛光金为主，魔法紫占近半（魔法元素偏紫） */
const DUST_COLORS = ['#d4a039', '#7b5ea7', '#e0b050', '#7b5ea7', '#d4a039', '#9478bd']

interface DustParticle {
  left: string
  top: string
  size: number
  color: string
  duration: string
  delay: string
}

/** 漂浮魔法微尘：Celeste 式克制（少量、缓慢），固定种子的伪随机分布不跳动 */
export function MagicDust({ count = 6 }: { count?: number }) {
  const particles = useMemo<DustParticle[]>(() => {
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    return Array.from({ length: count }, (_, i) => ({
      left: `${4 + rand() * 92}%`,
      top: `${8 + rand() * 84}%`,
      size: rand() > 0.5 ? 3 : 2,
      color: DUST_COLORS[i % DUST_COLORS.length],
      duration: `${8 + rand() * 7}s`,
      delay: `${(-rand() * 8).toFixed(2)}s`,
    }))
  }, [count])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {particles.map((particle, index) => (
        <span
          key={index}
          className="magic-dust"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            background: particle.color,
            color: particle.color,
            animationDuration: particle.duration,
            animationDelay: particle.delay,
          }}
        />
      ))}
    </div>
  )
}
