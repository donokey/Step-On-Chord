import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { SidecarInfo } from './sidecar'
import type {
  AppSettings,
  HistoryRecord,
  HistorySummary,
  ModelsProgress,
  ModelsStatus,
  ProjectOpenResult,
  ProjectSummary,
  NewHistoryEntry,
  SaveFileOptions,
} from './types'

/** 订阅主进程推送事件，返回取消订阅函数 */
function subscribe<T>(channel: string) {
  return (callback: (payload: T) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

const api = {
  /** 窗口控制（frameless 标题栏按钮） */
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: subscribe<boolean>('window:maximized-changed'),
  },
  /** 原生文件对话框（返回绝对路径，取消时为 null） */
  dialog: {
    openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-file'),
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-folder'),
    /** 保存文本文件（导出和弦谱），返回已保存路径 */
    saveFile: (options: SaveFileOptions): Promise<string | null> => ipcRenderer.invoke('dialog:save-file', options),
  },
  files: {
    /** 拖拽进来的 File 对象 → 绝对路径（Electron 32+ 移除了 File.path，官方推荐 webUtils） */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
    /** 列出文件夹内的音频文件（批量分析用） */
    listAudio: (folder: string): Promise<string[]> => ipcRenderer.invoke('files:list-audio', folder),
    /** 批量写文本文件（批量导出和弦谱），返回已写路径列表 */
    writeTexts: (payload: { directory: string; files: { name: string; content: string }[] }): Promise<string[]> =>
      ipcRenderer.invoke('files:write-texts', payload),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  },
  /** Python sidecar 状态查询与订阅 */
  sidecar: {
    getInfo: (): Promise<SidecarInfo> => ipcRenderer.invoke('sidecar:get-info'),
    onStatusChange: subscribe<SidecarInfo>('sidecar:status'),
  },
  /** 分析历史（SQLite，主进程存储） */
  history: {
    list: (): Promise<HistorySummary[]> => ipcRenderer.invoke('history:list'),
    get: (id: number): Promise<HistoryRecord | null> => ipcRenderer.invoke('history:get', id),
    insert: (entry: NewHistoryEntry): Promise<number> => ipcRenderer.invoke('history:insert', entry),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('history:delete', id),
    /** 更新已有记录的结果 JSON（手动校正持久化） */
    updateJson: (id: number, resultJson: string): Promise<void> =>
      ipcRenderer.invoke('history:update-json', id, resultJson),
    /** 清空全部历史记录 */
    clear: (): Promise<void> => ipcRenderer.invoke('history:clear'),
  },
  /** 歌曲项目（v0.2.0 工作台） */
  projects: {
    list: (): Promise<ProjectSummary[]> => ipcRenderer.invoke('projects:list'),
    create: (parentDir: string, name: string): Promise<{ folderPath: string; project: object }> =>
      ipcRenderer.invoke('projects:create', parentDir, name),
    open: (folderPath: string): Promise<ProjectOpenResult> => ipcRenderer.invoke('projects:open', folderPath),
    save: (folderPath: string, project: object): Promise<void> => ipcRenderer.invoke('projects:save', folderPath, project),
    remove: (folderPath: string): Promise<void> => ipcRenderer.invoke('projects:delete', folderPath),
    locateAudio: (folderPath: string): Promise<object | null> => ipcRenderer.invoke('projects:locate-audio', folderPath),
    copyAudio: (folderPath: string, sourcePath: string): Promise<object> =>
      ipcRenderer.invoke('projects:copy-audio', folderPath, sourcePath),
    addAttachment: (folderPath: string, sourcePath: string, kind: string, note: string): Promise<object> =>
      ipcRenderer.invoke('projects:add-attachment', folderPath, sourcePath, kind, note),
    removeAttachment: (folderPath: string, attachmentId: string): Promise<object> =>
      ipcRenderer.invoke('projects:remove-attachment', folderPath, attachmentId),
    chooseParentDir: (): Promise<string | null> => ipcRenderer.invoke('projects:choose-parent-dir'),
  },
  /** 模型权重（首启下载页）：状态检测 / 一键下载 / 进度推送 */
  models: {
    status: (): Promise<ModelsStatus> => ipcRenderer.invoke('models:status'),
    download: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('models:download'),
    onProgress: subscribe<ModelsProgress>('models:progress'),
  },
  /** 应用设置（electron-store 持久化） */
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    /** 七和弦自动精炼开关（写盘后需重启引擎生效） */
    setRefine: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('settings:set-refine', enabled),
  },
  /** 系统 Shell（打开文件夹 / 外部链接） */
  shell: {
    openPath: (target: string): Promise<string> => ipcRenderer.invoke('shell:open-path', target),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  },
}

export type ChordcraftApi = typeof api

contextBridge.exposeInMainWorld('chordcraft', api)
