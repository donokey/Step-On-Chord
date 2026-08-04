import { useEffect, useState } from 'react'
import { bridge } from '../bridge'

/** 窗口控制（自定义标题栏用）：最小化 / 最大化切换 / 关闭 + 最大化状态同步 */
export function useWindowState() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let disposed = false
    void bridge.window.isMaximized().then((maximized) => {
      if (!disposed) setIsMaximized(maximized)
    })
    const unsubscribe = bridge.window.onMaximizedChange(setIsMaximized)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  return {
    isMaximized,
    minimize: () => bridge.window.minimize(),
    toggleMaximize: () => bridge.window.toggleMaximize(),
    close: () => bridge.window.close(),
  }
}
