import { create } from 'zustand'
import { resolveEngineBaseUrl } from './analysisStore'

/**
 * 项目内伴奏播放器（v0.3.0）。
 *
 * 与 WaveformPlayer / playerStore 完全独立：那个绑定"被分析的主音频"，
 * 这里专门播放项目附件（伴奏 / demo）。两者可同时存在、互不干扰。
 *
 * 关键设计：<audio> 元素是模块级单例，不进入任何组件的 React 生命周期，
 * 因此在项目详情页切换「分析 / 歌词 / 附件」tab 时播放不会中断——
 * 这正是"边写词边听伴奏"场景的核心诉求。
 */

// 模块级单例：跨 tab 常驻，组件卸载不影响播放
const audio = new Audio()
audio.preload = 'auto'

interface AccompanimentState {
  /** 当前曲目绝对路径（null = 未加载任何曲目） */
  trackPath: string | null
  trackName: string | null
  isPlaying: boolean
  isReady: boolean
  currentTime: number
  duration: number
  /** 0.0 - 1.0 */
  volume: number
  error: string | null

  /** 加载并播放指定本地音频（经 sidecar /api/audio 拉流） */
  playTrack: (path: string, name: string) => Promise<void>
  toggle: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  /** 停止并卸载（离开/切换项目时调用） */
  stop: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const useAccompanimentStore = create<AccompanimentState>((set, get) => ({
  trackPath: null,
  trackName: null,
  isPlaying: false,
  isReady: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  error: null,

  playTrack: async (path, name) => {
    try {
      const baseUrl = await resolveEngineBaseUrl() // 引擎未就绪会抛错
      audio.volume = clamp(get().volume, 0, 1)
      set({ trackPath: path, trackName: name, error: null, isReady: false, currentTime: 0, duration: 0 })
      audio.src = `${baseUrl}/api/audio?path=${encodeURIComponent(path)}`
      await audio.play()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isPlaying: false, isReady: false })
    }
  },

  toggle: () => {
    if (!get().trackPath) return
    if (audio.paused) {
      void audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  },

  seek: (seconds) => {
    if (!get().trackPath || !Number.isFinite(seconds)) return
    const target = clamp(seconds, 0, get().duration || 0)
    try {
      audio.currentTime = target
      set({ currentTime: target })
    } catch {
      // 音频尚未就绪时忽略
    }
  },

  setVolume: (volume) => {
    const v = clamp(volume, 0, 1)
    audio.volume = v
    set({ volume: v })
  },

  stop: () => {
    audio.pause()
    audio.removeAttribute('src')
    audio.load() // 释放资源
    set({
      trackPath: null,
      trackName: null,
      isPlaying: false,
      isReady: false,
      currentTime: 0,
      duration: 0,
      error: null,
    })
  },
}))

// ---- 音频元素事件 → store（模块级绑定一次） ----
audio.addEventListener('play', () => useAccompanimentStore.setState({ isPlaying: true }))
audio.addEventListener('pause', () => useAccompanimentStore.setState({ isPlaying: false }))
audio.addEventListener('ended', () => useAccompanimentStore.setState({ isPlaying: false }))
audio.addEventListener('loadedmetadata', () =>
  useAccompanimentStore.setState({ duration: audio.duration || 0, isReady: true }),
)
audio.addEventListener('timeupdate', () => {
  const { currentTime } = useAccompanimentStore.getState()
  // 50ms 粒度节流，避免高频重渲染
  if (Math.abs(audio.currentTime - currentTime) > 0.05) {
    useAccompanimentStore.setState({ currentTime: audio.currentTime })
  }
})
audio.addEventListener('error', () =>
  useAccompanimentStore.setState({ error: '音频加载失败（文件缺失或格式不支持）', isPlaying: false, isReady: false }),
)
