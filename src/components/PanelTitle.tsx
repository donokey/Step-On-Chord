import type { ReactNode } from 'react'

/** 区域标题：像素符号 + 亮金标题 + 渐隐金线（书房铭牌感） */
export function PanelTitle({
  children,
  symbol = '✦',
  className = '',
}: {
  children: ReactNode
  symbol?: string
  className?: string
}) {
  return (
    <h2
      className={`flex items-center gap-1.5 font-pixel text-[8px] uppercase tracking-wider text-warm ${className}`}
    >
      <span className="text-[7px] leading-none" aria-hidden="true">
        {symbol}
      </span>
      <span className="leading-relaxed">{children}</span>
      <span
        className="ml-1 h-px flex-1 bg-gradient-to-r from-edge-glow/60 via-edge-glow/25 to-transparent"
        aria-hidden="true"
      />
    </h2>
  )
}
