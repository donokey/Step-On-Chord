import { useEffect, useState } from 'react'
import type { SidecarInfo } from '../../electron/types'
import { bridge } from '../bridge'
import { useSidecarStatus } from '../hooks/useSidecarStatus'

function engineStatusView(info: SidecarInfo): { text: string; dotClass: string } {
  switch (info.status) {
    case 'ready':
      return { text: `引擎运行中 · 127.0.0.1:${info.port}`, dotClass: 'bg-success' }
    case 'starting':
      return { text: '引擎启动中…', dotClass: 'animate-pulse bg-warm' }
    case 'error':
      return { text: '引擎异常', dotClass: 'bg-error' }
    case 'stopped':
      return { text: '引擎未启动', dotClass: 'bg-ink-faint' }
  }
}

/** 底部 28px 状态栏：引擎状态指示灯 + 版本号 */
export function StatusBar() {
  const sidecar = useSidecarStatus()
  const [version, setVersion] = useState('')

  useEffect(() => {
    void bridge.app.getVersion().then(setVersion)
  }, [])

  const engine = engineStatusView(sidecar)

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-edge bg-base-deep px-3 font-vt text-xs text-ink-dim">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${engine.dotClass}`} />
        <span className="shrink-0">{engine.text}</span>
        {sidecar.status === 'error' && sidecar.lastError && (
          <span className="truncate text-error">{sidecar.lastError}</span>
        )}
        {sidecar.restartCount > 0 && sidecar.status !== 'error' && (
          <span className="shrink-0 text-ink-faint">（已自动重启 {sidecar.restartCount} 次）</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-ink-faint">ChordCraft Engine</span>
        <span>v{version || '—'}</span>
      </div>
    </footer>
  )
}
