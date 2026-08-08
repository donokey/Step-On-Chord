import { app, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateStatus } from './types'

/** 启动后延迟静默检查（避免与首启模型下载页冲突） */
const CHECK_DELAY_MS = 10_000

/**
 * 应用更新管理（仅打包版生效）：
 * - 启动延迟 CHECK_DELAY_MS 后静默检查；渲染进程可手动触发 check()
 * - 下载完成后不立即安装，等待用户确认（UI 提示）
 * - 所有异常非致命：失败仅提示，不影响使用
 */
export class UpdaterManager {
  constructor(private getWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = true // 发现新版自动下载（下载中展示进度）
    autoUpdater.autoInstallOnAppQuit = false // 安装时机由用户确认
    // 事件 → 渲染进程（updater:status 通道）
    autoUpdater.on('checking-for-update', () => this.push({ status: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.push({ status: 'available', version: info.version, releaseNotes: notesText(info) }),
    )
    autoUpdater.on('update-not-available', () => this.push({ status: 'not-available' }))
    autoUpdater.on('download-progress', (p) =>
      this.push({ status: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total }),
    )
    autoUpdater.on('update-downloaded', (info) => this.push({ status: 'downloaded', version: info.version }))
    autoUpdater.on('error', (err) => this.push({ status: 'error', message: err.message }))
  }

  /** 启动后延迟静默检查（开发模式直接跳过） */
  start(): void {
    if (!app.isPackaged) return
    setTimeout(() => void this.check(), CHECK_DELAY_MS)
  }

  /** 手动检查更新（渲染进程「检查更新」按钮触发） */
  async check(): Promise<void> {
    if (!app.isPackaged) return
    await autoUpdater.checkForUpdates() // 抛错由 error 事件捕获
  }

  /** 用户确认后安装并重启（主进程调用） */
  install(): void {
    autoUpdater.quitAndInstall(false, true)
  }

  /** 推送更新状态到渲染进程（窗口未就绪时静默丢弃） */
  private push(status: UpdateStatus): void {
    this.getWindow()?.webContents.send('updater:status', status)
  }
}

/** releaseNotes 兼容 GitHub 的字符串 / 数组两种格式 */
function notesText(info: UpdateInfo): string {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes
  if (Array.isArray(info.releaseNotes)) return info.releaseNotes.map((n) => n.note ?? '').join('\n')
  return ''
}
