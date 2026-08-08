import { useEffect, useRef, useState } from 'react'
import type { UpdateStatus } from '../../electron/types'
import { bridge } from '../bridge'
import { PixelBuddy, type WizardState } from './PixelBuddy'

/** SettingsView「检查更新」按钮通过该事件触发本组件（重置忽略标记 + 调主进程检查） */
export const CHECK_UPDATE_EVENT = 'chordcraft:check-update'

/** 短暂提示（not-available / error）的展示时长 */
const TRANSIENT_MS = 3_000

/** 字节数 → MB 展示（保留一位小数） */
function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 各状态对应的小巫师表情（错误/无更新时静默，不额外渲染） */
const WIZARD_STATE: Partial<Record<UpdateStatus['status'], WizardState>> = {
  available: 'listening',
  downloading: 'casting',
  downloaded: 'celebrate',
  error: 'confused',
}

/**
 * 应用更新浮层（右下角固定，非阻塞）：
 * - 订阅主进程 updater:status 推送
 * - available → 版本 + 更新说明（下载已自动开始）；downloading → 进度条
 * - downloaded → 「立即重启更新」；not-available / error → 短暂提示后自动消失
 * - 「稍后」关闭后本次会话不再弹出（下次启动重新静默检查）
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  /** 用户点过「稍后」：本次会话忽略后续 available/downloading/downloaded 推送 */
  const dismissedRef = useRef(false)
  const hideTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const unsubscribe = bridge.updater.onStatus((status) => {
      if (status.status === 'checking') return // 静默阶段不打扰
      const transient = status.status === 'not-available' || status.status === 'error'
      if (!transient && dismissedRef.current) return
      setUpdate(status)
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
      if (transient) {
        hideTimerRef.current = window.setTimeout(() => setUpdate(null), TRANSIENT_MS)
      }
    })
    // SettingsView「检查更新」：重置忽略标记并触发主进程检查
    const onManualCheck = () => {
      dismissedRef.current = false
      void bridge.updater.check()
    }
    window.addEventListener(CHECK_UPDATE_EVENT, onManualCheck)
    return () => {
      unsubscribe()
      window.removeEventListener(CHECK_UPDATE_EVENT, onManualCheck)
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  /** 「稍后」：关闭弹窗，本次会话不再提示 */
  const dismiss = () => {
    dismissedRef.current = true
    setUpdate(null)
  }

  if (!update) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <section className="panel-pixel pixel-corners panel-tint-magic px-3 py-2">
        <div className="flex items-start gap-2">
          <PixelBuddy state={WIZARD_STATE[update.status] ?? 'idle'} scale={3} />
          <div className="min-w-0 flex-1">
            {update.status === 'available' && (
              <>
                <p className="font-vt text-sm text-warm">发现新版本 v{update.version}</p>
                <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-vt text-xs leading-snug text-ink-dim">
                  {update.releaseNotes || '更新说明见 GitHub Releases'}
                </p>
                <p className="mt-1.5 font-vt text-xs text-ink-faint">正在自动下载更新（差分优先）…</p>
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={dismiss} className="btn-pixel px-2 py-1 text-xs">
                    稍后
                  </button>
                </div>
              </>
            )}
            {update.status === 'downloading' && (
              <>
                <p className="font-vt text-sm text-ink">正在下载更新…</p>
                <div className="mt-1.5 h-3 border-2 border-edge bg-base-deep">
                  <div
                    className="h-full bg-warm transition-[width] duration-200"
                    style={{ width: `${Math.min(100, update.percent)}%` }}
                  />
                </div>
                <p className="mt-1 font-vt text-xs text-ink-faint">
                  {mb(update.transferred)} / {mb(update.total)}（{update.percent.toFixed(0)}%）
                </p>
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={dismiss} className="btn-pixel px-2 py-1 text-xs">
                    稍后
                  </button>
                </div>
              </>
            )}
            {update.status === 'downloaded' && (
              <>
                <p className="font-vt text-sm text-success">新版本 v{update.version} 已就绪</p>
                <p className="mt-1 font-vt text-xs text-ink-faint">重启后自动完成安装</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={dismiss} className="btn-pixel px-2 py-1 text-xs">
                    稍后
                  </button>
                  <button
                    type="button"
                    onClick={() => void bridge.updater.install()}
                    className="btn-pixel px-2 py-1 text-xs text-warm"
                  >
                    立即重启更新
                  </button>
                </div>
              </>
            )}
            {update.status === 'not-available' && (
              <p className="font-vt text-sm text-ink-dim">已是最新版本</p>
            )}
            {update.status === 'error' && (
              <p className="break-words font-vt text-xs leading-snug text-error">
                检查更新失败：{update.message}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
