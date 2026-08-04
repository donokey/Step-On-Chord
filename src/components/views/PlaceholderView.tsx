import type { ComponentType } from 'react'
import type { IconProps } from '../icons'

/** 尚未实现的功能视图占位（Phase 2-4 逐步替换为真实面板） */
export function PlaceholderView(props: {
  icon: ComponentType<IconProps>
  title: string
  description: string
  milestone: string
}) {
  const { icon: Icon, title, description, milestone } = props
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="panel-pixel pixel-corners flex h-14 w-14 items-center justify-center text-ink-dim">
        <Icon width={26} height={26} />
      </div>
      <h1 className="font-vt text-xl text-ink">{title}</h1>
      <p className="max-w-sm font-vt text-sm leading-relaxed text-ink-dim">{description}</p>
      <span className="border border-edge bg-base-deep px-2 py-0.5 font-pixel text-[7px] uppercase tracking-wider text-ink-faint">
        {milestone}
      </span>
    </div>
  )
}
