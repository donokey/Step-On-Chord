import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import type { HistoryStore } from './db'
import { listAudioFilesInFolder, writeTextFiles, type BatchWriteItem } from './files'
import type { ModelsManager } from './models'
import type { ProjectsService } from './projects'
import type { SettingsStore } from './settings'
import type { SidecarManager } from './sidecar'
import type { AppSettings, NewHistoryEntry, PdfExportOptions, SaveBinaryOptions, SaveFileOptions } from './types'
import type { UpdaterManager } from './updater'

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
  projects: ProjectsService,
  updater: UpdaterManager,
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

  // 附件导入用：任意文件类型（伴奏 / demo / 工程文件等）
  ipcMain.handle('dialog:open-attachment', async () => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择要导入的附件',
      properties: ['openFile'],
      filters: [{ name: '所有文件', extensions: ['*'] }],
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

  // 保存二进制文件（导出 docx 等）；content 为 base64 编码
  ipcMain.handle('dialog:save-binary', async (_event, options: SaveBinaryOptions) => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: options.title,
      defaultPath: options.defaultName,
      filters: options.filters,
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, Buffer.from(options.base64, 'base64'))
    return filePath
  })

  // PDF 导出：隐藏窗口加载打印用 HTML → printToPDF → 保存对话框写盘
  ipcMain.handle('export:pdf', async (_event, options: PdfExportOptions) => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: options.title,
      defaultPath: options.defaultName,
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return null
    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(options.html)}`)
      const pdf = await printWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      await writeFile(filePath, pdf)
      return filePath
    } finally {
      printWin.destroy()
    }
  })

  // ---- 批量处理：文件夹音频扫描 / 批量写文本 ----
  ipcMain.handle('files:list-audio', (_event, folder: string) => listAudioFilesInFolder(folder))
  ipcMain.handle('files:write-texts', (_event, payload: { directory: string; files: BatchWriteItem[] }) =>
    writeTextFiles(payload.directory, payload.files),
  )

  // ---- 应用信息 / sidecar 状态 ----
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('sidecar:get-info', () => sidecar.getInfo())

  // ---- 应用更新（electron-updater，仅打包版生效） ----
  ipcMain.handle('updater:check', () => updater.check())
  ipcMain.handle('updater:install', () => updater.install())
  // 渲染进程挂载时拉取状态快照（避免错过弹窗前的推送）
  ipcMain.handle('updater:get-status', () => updater.getStatus())

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

  // ---- 歌曲项目（v0.2.0 工作台） ----
  ipcMain.handle('projects:list', () => projects.list())
  ipcMain.handle('projects:create', (_event, parentDir: string, name: string) => projects.create(parentDir, name))
  ipcMain.handle('projects:open', (_event, folderPath: string) => projects.open(folderPath))
  ipcMain.handle('projects:save', (_event, folderPath: string, project: object) => {
    // 渲染进程传完整对象，主进程做模型校验后再写盘（防脏数据）
    return projects.save(folderPath, project as Parameters<ProjectsService['save']>[1])
  })
  ipcMain.handle('projects:delete', (_event, folderPath: string) => projects.remove(folderPath))
  ipcMain.handle('projects:rename', (_event, folderPath: string, newName: string) => projects.rename(folderPath, newName))
  ipcMain.handle('projects:locate-audio', async (_event, folderPath: string) => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '重新定位歌曲音频',
      properties: ['openFile'],
      filters: AUDIO_FILE_FILTERS,
    })
    if (canceled || !filePaths[0]) return null
    const current = await projects.open(folderPath)
    if (!current.project.audio) return null
    return projects.setAudio(folderPath, current.project, {
      mode: current.project.audio.mode,
      path: filePaths[0],
      file_name: filePaths[0].split(/[\\/]/).pop() ?? filePaths[0],
    })
  })
  ipcMain.handle('projects:copy-audio', (_event, folderPath: string, sourcePath: string) => {
    return projects.open(folderPath).then(({ project }) => projects.copyAudioIntoProject(folderPath, project, sourcePath))
  })
  ipcMain.handle('projects:add-attachment', (_event, folderPath: string, sourcePath: string, kind: string, note: string) => {
    return projects.open(folderPath).then(({ project }) =>
      projects.addAttachment(folderPath, project, sourcePath, kind as 'accompaniment' | 'arrangement' | 'demo' | 'other', note),
    )
  })
  ipcMain.handle('projects:remove-attachment', (_event, folderPath: string, attachmentId: string) => {
    return projects.open(folderPath).then(({ project }) => projects.removeAttachment(folderPath, project, attachmentId))
  })
  ipcMain.handle('projects:choose-parent-dir', async () => {
    const win = getWindow()
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择歌曲项目存放位置',
      properties: ['openDirectory', 'createDirectory'],
    })
    return canceled ? null : filePaths[0]
  })
  // 项目集中存放根目录（新建项目统一建在这里，免每次弹框）
  ipcMain.handle('projects:get-root', () => settings.projectsRoot)

  // ---- 设置（electron-store）与系统 Shell ----
  ipcMain.handle('settings:get', (): AppSettings => {
    return { refineQualities: settings.refineQualities, modelsDir: models.modelsDir, projectsRoot: settings.projectsRoot }
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
