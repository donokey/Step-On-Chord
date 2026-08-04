import { create } from 'zustand'
import type WaveSurfer from 'wavesurfer.js'

// wavesurfer 实例为模块级单例（非序列化对象，不进 store）
let waveSurfer: WaveSurfer | null = null

export function registerWaveSurfer(instance: WaveSurfer | null): void {
  waveSurfer = instance
}

interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  isReady: boolean
  setPlaying: (playing: boolean) => void
  setTime: (time: number) => void
  setDuration: (duration: number) => void
  setReady: (ready: boolean) => void
  togglePlay: () => void
  /** 跳转到指定秒（和弦/段落点击联动） */
  seekTo: (seconds: number) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isReady: false,
  setPlaying: (isPlaying) => set({ isPlaying }),
  setTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setReady: (isReady) => set({ isReady }),
  togglePlay: () => {
    void waveSurfer?.playPause()
  },
  seekTo: (seconds) => {
    waveSurfer?.setTime(seconds)
    set({ currentTime: seconds })
  },
}))
