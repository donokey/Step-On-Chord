import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { HistoryStore, ProjectIndexStore } from './db'
import { registerIpcHandlers } from './ipc-handlers'
import { ModelsManager } from './models'
import { ProjectsService } from './projects'
import { SettingsStore } from './settings'
import { SidecarManager } from './sidecar'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
const settings = new SettingsStore()
const models = new ModelsManager()
// sidecar spawn 时从设置与模型管理器读取环境变量覆盖（七和弦精炼、模型目录、HF 缓存等）
const sidecar = new SidecarManager(() => ({ ...settings.sidecarEnv(), ...models.sidecarEnv() }))
let history: HistoryStore | null = null
let projectIndex: ProjectIndexStore | null = null
let projects: ProjectsService | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false, // 无边框窗口，标题栏由渲染进程自绘
    show: false,
    backgroundColor: '#1a1a2e',
    title: 'Step On Chord',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 最大化状态同步给渲染进程（标题栏切换 最大化/还原 图标）
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-changed', false))

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // sidecar 状态变化推送到渲染进程（状态栏引擎指示灯）
  sidecar.on('status', (info) => {
    mainWindow?.webContents.send('sidecar:status', info)
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// ---- 生命周期 ----

let isQuitting = false

app.whenReady().then(async () => {
  // 打包后先把引擎运行时代码同步到用户模型目录，再起 sidecar（失败不阻塞启动）
  await models.bootstrap().catch((err: Error) => {
    console.error('[models] 运行时代码同步失败:', err.message)
  })

  history = new HistoryStore(path.join(app.getPath('userData'), 'history.db'))
  projectIndex = new ProjectIndexStore(path.join(app.getPath('userData'), 'history.db'))
  projects = new ProjectsService(projectIndex)
  registerIpcHandlers(() => mainWindow, sidecar, history, settings, models, projects)

  // sidecar 异步启动，不阻塞窗口；状态通过事件推送到 UI
  void sidecar.start().catch((err: Error) => {
    console.error('[sidecar] 首次启动失败:', err.message)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 退出前确保 sidecar 被终止
app.on('before-quit', (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  history?.close()
  projectIndex?.close()
  void sidecar.stop().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
