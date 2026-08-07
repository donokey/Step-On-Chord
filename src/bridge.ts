import type { ChordcraftApi } from '../electron/preload'
import type { SidecarInfo } from '../electron/types'

/** 浏览器环境（无 preload 注入）下的降级实现：UI 可正常渲染，IPC 调用静默返回空值 */
const fallback: ChordcraftApi = {
  window: {
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    isMaximized: async () => false,
    onMaximizedChange: () => () => {},
  },
  dialog: {
    openFile: async () => null,
    openFolder: async () => null,
    saveFile: async () => null,
  },
  files: {
    getPathForFile: () => '',
    listAudio: async () => [],
    writeTexts: async () => [],
  },
  app: {
    getVersion: async () => '0.1.0',
  },
  sidecar: {
    getInfo: async (): Promise<SidecarInfo> => ({
      status: 'stopped',
      port: null,
      restartCount: 0,
      lastError: '非 Electron 环境（浏览器预览）',
    }),
    onStatusChange: () => () => {},
  },
  history: {
    list: async () => [],
    get: async () => null,
    insert: async () => -1,
    remove: async () => {},
    updateJson: async () => {},
    clear: async () => {},
  },
  projects: {
    list: async () => [],
    create: async () => ({ folderPath: '', project: {} }),
    open: async () => ({ folderPath: '', project: {}, audioMissing: false }),
    save: async () => {},
    remove: async () => {},
    locateAudio: async () => null,
    copyAudio: async () => ({}),
    addAttachment: async () => ({}),
    removeAttachment: async () => ({}),
    chooseParentDir: async () => null,
  },
  models: {
    status: async () => ({ isPackaged: false, modelsDir: '', missing: [], downloading: false }),
    download: async () => ({ ok: false, error: '非 Electron 环境（浏览器预览）' }),
    onProgress: () => () => {},
  },
  settings: {
    get: async () => ({ refineQualities: false, modelsDir: '' }),
    setRefine: async () => false,
  },
  shell: {
    openPath: async () => '',
    openExternal: async () => {},
  },
}

/**
 * 主进程桥接 API。
 * Electron 中由 preload contextBridge 注入 window.chordcraft；
 * 纯浏览器预览（vite dev server 直连）时降级为空实现，避免白屏。
 */
export const bridge: ChordcraftApi =
  typeof window !== 'undefined' && window.chordcraft ? window.chordcraft : fallback
