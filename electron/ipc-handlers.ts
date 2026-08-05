import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import type { HistoryStore } from './db'
import { listAudioFilesInFolder, writeTextFiles, type BatchWriteItem } from './files'
import type { ModelsManager } from './models'
import type { SettingsStore } from './settings'
import type { SidecarManager } from './sidecar'
import type { AppSettings, NewHistoryEntry, SaveFileOptions } from './types'

const AUDIO_FILE_FILTERS = [
  { name: '音频文件', extensions: ['mp3', 'wav', 'flac'] },
  { name: '所有文件', extensions: ['*'] },
]

/** 集中注册渲染进程 ↔ 主进程的 IPC 通道 */
export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
  sidecar: SidecarManager,
  history: HistoryStore,
  settings: SettingsStore,
  models: ModelsManager,
): void {
  // ---- 窗口控制（frameless 自定义标题栏） ----
  ipcMain.on('window:minimize', () => getWindow()?.minimize())
  ipcMain.on('window:toggle-maximize', () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => getWindow()?.close())
  ipcMain.handle('window:is-maximized', () => getWindow()?.isMaximized() ?? false)

  // ---- 文件 / 文件夹对话框 ----
  ipcMain.handle('dialog:open-file', async () => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择音频文件',
      properties: ['openFile'],
      filters: AUDIO_FILE_FILTERS,
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:open-folder', async () => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择音频文件夹（批量分析）',
      properties: ['openDirectory', 'createDirectory'],
    })
    return canceled ? null : filePaths[0]
  })

  // 保存文本文件（导出和弦谱）；返回已保存路径，取消为 null
  ipcMain.handle('dialog:save-file', async (_event, options: SaveFileOptions) => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: options.title,
      defaultPath: options.defaultName,
      filters: options.filters,
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, options.content, 'utf-8')
    return filePath
  })

  // ---- 批量处理：文件夹音频扫描 / 批量写文本 ----
  ipcMain.handle('files:list-audio', (_event, folder: string) => listAudioFilesInFolder(folder))
  ipcMain.handle('files:write-texts', (_event, payload: { directory: string; files: BatchWriteItem[] }) =>
    writeTextFiles(payload.directory, payload.files),
  )

  // ---- 应用信息 / sidecar 状态 ----
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('sidecar:get-info', () => sidecar.getInfo())

  // ---- 分析历史（SQLite） ----
  ipcMain.handle('history:list', () => history.list())
  ipcMain.handle('history:get', (_event, id: number) => history.get(id))
  ipcMain.handle('history:insert', (_event, entry: NewHistoryEntry) => history.insert(entry))
  ipcMain.handle('history:delete', (_event, id: number) => history.remove(id))
  ipcMain.handle('history:update-json', (_event, id: number, resultJson: string) =>
    history.updateResultJson(id, resultJson),
  )
  ipcMain.handle('history:clear', () => history.clear())

  // ---- 模型权重（首启下载页） ----
  ipcMain.handle('models:status', () => models.status())
  ipcMain.handle('models:download', async () => {
    models.setProgressSender((progress) => getWindow()?.webContents.send('models:progress', progress))
    try {
      await models.downloadAll()
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- 设置（electron-store）与系统 Shell ----
  ipcMain.handle('settings:get', (): AppSettings => {
    return { refineQualities: settings.refineQualities, modelsDir: models.modelsDir }
  })
  ipcMain.handle('settings:set-refine', (_event, enabled: boolean) => {
    settings.setRefineQualities(Boolean(enabled))
    return settings.refineQualities
  })
  ipcMain.handle('shell:open-path', (_event, target: string) => shell.openPath(target))
  ipcMain.handle('shell:open-external', (_event, url: string) => {
    // 仅放行 http(s) 链接，防止 file:// 等协议滥用
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })
}
