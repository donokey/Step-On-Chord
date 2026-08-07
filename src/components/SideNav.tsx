import type { ComponentType } from 'react'
import { useUiStore, type NavView } from '../stores/uiStore'
import { IconAnalyze, IconHistory, IconProjects, IconSettings, IconVoicing, type IconProps } from './icons'

const NAV_ITEMS: { key: NavView; label: string; icon: ComponentType<IconProps> }[] = [
  { key: 'analyze', label: '分析', icon: IconAnalyze },
  { key: 'projects', label: '项目', icon: IconProjects },
  { key: 'history', label: '历史', icon: IconHistory },
  { key: 'voicing', label: 'Voicing', icon: IconVoicing },
  { key: 'settings', label: '设置', icon: IconSettings },
]

/** 左侧 56px 图标导航栏（分析 / 项目 / 历史 / Voicing / 设置） */
export function SideNav() {
  const activeView = useUiStore((s) => s.activeView)
  const setActiveView = useUiStore((s) => s.setActiveView)

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-edge bg-base-deep py-2">
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
        const active = key === activeView
        return (
          <button
            key={key}
            type="button"
            onClick={() => setActiveView(key)}
            title={label}
            className={`relative flex h-12 w-12 flex-col items-center justify-center gap-1 transition-colors ${
              active ? 'bg-cool-dim/70 text-ink' : 'text-ink-dim hover:bg-panel hover:text-ink'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 bg-warm shadow-[0_0_4px_var(--border-glow)]" />
            )}
            <Icon width={18} height={18} />
            <span className={`font-vt text-xs leading-none ${active ? 'text-warm' : ''}`}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
