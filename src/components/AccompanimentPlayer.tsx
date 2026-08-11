import { useAccompanimentStore } from '../stores/accompanimentStore'
import { formatTime } from '../utils/time'
import { IconClose, IconMusicNote, IconPause, IconPlay } from './icons'

/**
 * 项目内伴奏播放条：常驻项目详情页顶部，切 tab 不中断。
 * 无曲目时显示引导细条；有曲目时展开完整控件（播放/进度/时间/音量/关闭）。
 */
export function AccompanimentPlayer() {
  const trackPath = useAccompanimentStore((s) => s.trackPath)
  const trackName = useAccompanimentStore((s) => s.trackName)
  const isPlaying = useAccompanimentStore((s) => s.isPlaying)
  const isReady = useAccompanimentStore((s) => s.isReady)
  const currentTime = useAccompanimentStore((s) => s.currentTime)
  const duration = useAccompanimentStore((s) => s.duration)
  const volume = useAccompanimentStore((s) => s.volume)
  const error = useAccompanimentStore((s) => s.error)
  const toggle = useAccompanimentStore((s) => s.toggle)
  const seek = useAccompanimentStore((s) => s.seek)
  const setVolume = useAccompanimentStore((s) => s.setVolume)
  const stop = useAccompanimentStore((s) => s.stop)

  if (!trackPath) {
    return (
      <div className="flex items-center gap-2 border border-edge bg-base-deep px-3 py-1.5">
        <IconMusicNote width={12} height={12} className="text-ink-faint" />
        <p className="font-vt text-xs text-ink-faint">伴奏播放器 · 到「附件」页给音频点「▶ 播放」，即可边写边听</p>
      </div>
    )
  }

  return (
    <div className="panel-pixel pixel-corners panel-tint-warm flex items-center gap-2 px-2 py-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!isReady}
        className="btn-pixel w-8 shrink-0 justify-center disabled:cursor-not-allowed disabled:opacity-40"
        title={isPlaying ? '暂停' : '播放'}
      >
        {isPlaying ? <IconPause width={11} height={11} /> : <IconPlay width={11} height={11} />}
      </button>

      <span className="min-w-0 shrink-0 truncate font-vt text-xs text-warm" title={trackName ?? ''}>
        {trackName}
      </span>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seek(Number(event.target.value))}
        disabled={!isReady}
        aria-label="播放进度"
        className="min-w-0 flex-1 accent-warm disabled:opacity-40"
      />

      <span className="shrink-0 font-vt text-xs text-ink-dim">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="音量"
        title="音量"
        className="w-16 shrink-0 accent-warm"
      />

      <button type="button" onClick={stop} className="btn-pixel shrink-0 px-1 py-0.5 text-[10px]" title="关闭播放器">
        <IconClose width={10} height={10} />
      </button>

      {error && <p className="shrink-0 font-vt text-xs text-error">{error}</p>}
    </div>
  )
}
