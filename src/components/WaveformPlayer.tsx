import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { resolveEngineBaseUrl, useAnalysisStore } from '../stores/analysisStore'
import { registerWaveSurfer, usePlayerStore } from '../stores/playerStore'
import { formatTime } from '../utils/time'
import { IconPause, IconPlay } from './icons'
import { PanelTitle } from './PanelTitle'

/** 波形播放器（wavesurfer.js）：真实文件经 sidecar /api/audio 拉流，演示模式用合成波形 */
export function WaveformPlayer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const filePath = useAnalysisStore((s) => s.filePath)
  const fileName = useAnalysisStore((s) => s.fileName)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isReady = usePlayerStore((s) => s.isReady)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    setLoadError(null)

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4a3828',
      progressColor: '#d4a039',
      cursorColor: '#d4a039',
      cursorWidth: 2,
      height: 104,
      barWidth: 2,
      barGap: 1,
      barRadius: 0, // 像素硬边
      normalize: true,
    })
    registerWaveSurfer(ws)

    const { setDuration, setReady, setTime, setPlaying } = usePlayerStore.getState()
    ws.on('ready', (d) => {
      setDuration(d)
      setReady(true)
    })
    ws.on('timeupdate', (t) => {
      // 50ms 粒度节流，避免高频重渲染
      if (Math.abs(t - usePlayerStore.getState().currentTime) > 0.05) setTime(t)
    })
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))
    ws.on('error', (err) => setLoadError(err instanceof Error ? err.message : String(err)))

    // 真实文件：经 sidecar /api/audio 拉流（渲染进程不直读本地路径）；演示：合成伪音频
    let disposed = false
    const loadAudio = async () => {
      try {
        if (filePath) {
          const baseUrl = await resolveEngineBaseUrl()
          if (disposed) return
          await ws.load(`${baseUrl}/api/audio?path=${encodeURIComponent(filePath)}`)
        } else {
          await ws.loadBlob(buildDemoWaveBlob(200, 128))
        }
      } catch (err) {
        // ws.load 的失败已由 error 事件上报，这里兜住引擎未就绪等前置错误
        if (!disposed) setLoadError((prev) => prev ?? (err instanceof Error ? err.message : String(err)))
      }
    }
    void loadAudio()

    return () => {
      disposed = true
      registerWaveSurfer(null)
      setReady(false)
      setPlaying(false)
      setTime(0)
      ws.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  return (
    <section className="panel-pixel pixel-corners panel-tint-warm px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <PanelTitle symbol="♪" className="flex-1">
          Waveform
        </PanelTitle>
        <span className="shrink-0 font-vt text-sm text-ink-dim">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!isReady}
          className="btn-pixel w-10 justify-center disabled:cursor-not-allowed disabled:opacity-40"
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? <IconPause width={12} height={12} /> : <IconPlay width={12} height={12} />}
        </button>
        <div className="relative min-w-0 flex-1 border border-edge bg-base-deep">
          <div ref={containerRef} className="h-[104px] w-full" />
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center bg-base-deep/90 px-3 text-center font-vt text-sm text-error">
              音频加载失败：{loadError}
            </div>
          )}
          {!filePath && !loadError && (
            <div className="pointer-events-none absolute bottom-1 right-2 font-vt text-xs text-ink-faint">
              演示波形 · 拖入真实歌曲后显示实际音频
            </div>
          )}
        </div>
      </div>
      {fileName && <p className="mt-1 truncate font-vt text-xs text-ink-faint">{fileName}</p>}
    </section>
  )
}

/** 合成一段带拍点包络的 8kHz mono PCM16 WAV（演示用，200s @128BPM） */
function buildDemoWaveBlob(durationSeconds: number, bpm: number): Blob {
  const sampleRate = 8000
  const total = Math.floor(durationSeconds * sampleRate)
  const samples = new Int16Array(total)
  const beatSeconds = 60 / bpm
  let seed = 42
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate
    const beatPhase = (t % beatSeconds) / beatSeconds
    const envelope = Math.exp(-3 * beatPhase) * 0.7 + 0.2
    const tone = Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 440 * t) * 0.25
    const noise = (random() * 2 - 1) * 0.15
    samples[i] = Math.round(Math.max(-1, Math.min(1, (tone + noise) * envelope)) * 32767)
  }
  return new Blob([encodeWavPcm16(samples, sampleRate)], { type: 'audio/wav' })
}

function encodeWavPcm16(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)
  new Int16Array(buffer, 44).set(samples)
  return buffer
}
