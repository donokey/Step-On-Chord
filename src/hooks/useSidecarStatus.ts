import { useEffect, useState } from 'react'
import type { SidecarInfo } from '../../electron/types'
import { bridge } from '../bridge'

const INITIAL_INFO: SidecarInfo = {
  status: 'starting',
  port: null,
  restartCount: 0,
  lastError: null,
}

/** 订阅 Python sidecar（分析引擎）状态：初始拉取 + 主进程推送 */
export function useSidecarStatus(): SidecarInfo {
  const [info, setInfo] = useState<SidecarInfo>(INITIAL_INFO)

  useEffect(() => {
    let disposed = false
    void bridge.sidecar.getInfo().then((current) => {
      if (!disposed) setInfo(current)
    })
    const unsubscribe = bridge.sidecar.onStatusChange(setInfo)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  return info
}
