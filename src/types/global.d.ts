import type { ChordcraftApi } from '../../electron/preload'

declare global {
  interface Window {
    /** preload contextBridge 暴露的主进程 API */
    chordcraft: ChordcraftApi
  }
}

export {}
