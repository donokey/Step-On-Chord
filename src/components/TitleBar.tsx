import type { ReactNode } from 'react'
import { useWindowState } from '../hooks/useWindowState'
import { IconClose, IconLogo, IconMaximize, IconMinimize, IconRestore } from './icons'

/** 自定义无边框标题栏：拖拽区域 + 最小化/最大化/关闭 */
export function TitleBar() {
  const { isMaximized, minimize, toggleMaximize, close } = useWindowState()

  return (
    <header
      className="app-drag flex h-9 shrink-0 items-center justify-between border-b border-edge bg-base-deep pl-3"
      onDoubleClick={toggleMaximize}
    >
      <div className="flex items-center gap-2">
        <IconLogo className="h-4 w-4 text-warm" />
        <span className="font-pixel text-[10px] tracking-[0.2em]">STEP ON CHORD</span>
        <span className="bg-panel px-1.5 py-px font-vt text-xs uppercase tracking-wider text-ink-faint">
          dev
        </span>
      </div>

      <div className="app-no-drag flex h-full items-stretch">
        <TitleBarButton onClick={minimize} label="最小化">
          <IconMinimize />
        </TitleBarButton>
        <TitleBarButton onClick={toggleMaximize} label={isMaximized ? '还原' : '最大化'}>
          {isMaximized ? <IconRestore /> : <IconMaximize />}
        </TitleBarButton>
        <TitleBarButton onClick={close} label="关闭" danger>
          <IconClose />
        </TitleBarButton>
      </div>
    </header>
  )
}

function TitleBarButton(props: {
  onClick: () => void
  label: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.label}
      className={`flex w-11 items-center justify-center text-ink-dim transition-colors ${
        props.danger ? 'hover:bg-error hover:text-white' : 'hover:bg-panel-light hover:text-ink'
      }`}
    >
      {props.children}
    </button>
  )
}
