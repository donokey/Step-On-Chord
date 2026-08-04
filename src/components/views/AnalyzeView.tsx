import { useCallback, useEffect, useState } from 'react'
import { bridge } from '../../bridge'
import { useAnalysisStore } from '../../stores/analysisStore'
import { useBatchStore } from '../../stores/batchStore'
import { usePlayerStore } from '../../stores/playerStore'
import { AnalysisPanel } from '../AnalysisPanel'
import { BatchPanel } from '../BatchPanel'
import { ChordTimeline } from '../ChordTimeline'
import { IconFolderOpen } from '../icons'
import { MagicDust } from '../MagicDust'
import { PixelBuddy, type WizardState } from '../PixelBuddy'
import { SectionBar } from '../SectionBar'
import { WaveformPlayer } from '../WaveformPlayer'

const ACCEPTED_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg']

/** 分析视图：拖入音频 → 分析 → 波形/和弦轴/段落条/详情 的完整工作区 */
export function AnalyzeView() {
  const filePath = useAnalysisStore((s) => s.filePath)
  const fileName = useAnalysisStore((s) => s.fileName)
  const status = useAnalysisStore((s) => s.status)
  const error = useAnalysisStore((s) => s.error)
  const startedAt = useAnalysisStore((s) => s.startedAt)
  const analyze = useAnalysisStore((s) => s.analyze)
  const loadDemo = useAnalysisStore((s) => s.loadDemo)
  const reset = useAnalysisStore((s) => s.reset)

  const [dragOver, setDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const batchItemCount = useBatchStore((s) => s.items.length)

  const startAnalysis = useCallback(
    (path: string, name: string) => {
      setLocalError(null)
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setLocalError(`暂不支持该格式 .${ext}，请使用 mp3 / wav / flac / ogg`)
        return
      }
      if (useAnalysisStore.getState().status === 'analyzing') return
      void analyze(path, name)
    },
    [analyze],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragOver(false)
      const file = event.dataTransfer.files?.[0]
      if (!file) return
      // Electron 32+ 移除了 File.path，经 preload 的 webUtils 取绝对路径
      const path = bridge.files.getPathForFile(file)
      if (!path) {
        setLocalError('无法获取文件绝对路径（浏览器预览模式不支持拖放分析）')
        return
      }
      startAnalysis(path, file.name)
    },
    [startAnalysis],
  )

  const handleOpenFile = useCallback(async () => {
    const file = await bridge.dialog.openFile()
    if (file) startAnalysis(file, file.split(/[\\/]/).pop() ?? file)
  }, [startAnalysis])

  /** 选择文件夹 → 扫描音频 → 进入批量队列（串行分析） */
  const handleBatchFolder = useCallback(async () => {
    setLocalError(null)
    const folder = await bridge.dialog.openFolder()
    if (!folder) return
    const files = await bridge.files.listAudio(folder)
    if (files.length === 0) {
      setLocalError('该文件夹内没有支持的音频文件（wav / mp3 / flac / ogg）')
      return
    }
    if (useAnalysisStore.getState().status === 'analyzing') return
    void useBatchStore.getState().startBatch(files)
  }, [])

  return (
    <div
      className="bg-atmosphere relative flex min-h-full flex-col gap-2 p-3"
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      <MagicDust />
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 z-10 border-2 border-dashed border-edge-glow bg-warm/10" />
      )}

      {status === 'idle' &&
        (batchItemCount > 0 ? (
          <BatchPanel />
        ) : (
          <IdleState onOpenFile={handleOpenFile} onBatchFolder={handleBatchFolder} onDemo={loadDemo} error={localError} />
        ))}
      {status === 'analyzing' && <AnalyzingState fileName={fileName} startedAt={startedAt} />}
      {status === 'done' && <DoneState onReset={reset} />}
      {status === 'error' && (
        <ErrorState
          error={error}
          onReset={reset}
          onRetry={filePath && fileName ? () => startAnalysis(filePath, fileName) : null}
        />
      )}
    </div>
  )
}

/** 空状态：小巫师等待 + 拖放提示 + 演示入口 */
function IdleState({
  onOpenFile,
  onBatchFolder,
  onDemo,
  error,
}: {
  onOpenFile: () => void
  onBatchFolder: () => void
  onDemo: () => void
  error: string | null
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onOpenFile} className="btn-pixel">
          <IconFolderOpen width={14} height={14} />
          打开音频文件
        </button>
        <button type="button" onClick={onBatchFolder} className="btn-pixel">
          <IconFolderOpen width={14} height={14} />
          选择文件夹批量分析
        </button>
        {error && <span className="font-vt text-sm text-error">{error}</span>}
      </div>
      <section className="panel-pixel pixel-corners flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <PixelBuddy state="idle" scale={7} orbit />
        <p className="font-vt text-xl text-ink">拖入一首歌，让我为你解读和弦</p>
        <p className="font-vt text-sm text-ink-faint">支持 mp3 / wav / flac · 或点击左上角「打开音频文件」</p>
        <button
          type="button"
          onClick={onDemo}
          className="mt-1 font-vt text-sm text-cool-light underline decoration-dotted underline-offset-4 transition-colors hover:text-warm"
        >
          没有音频？先看演示效果
        </button>
      </section>
    </>
  )
}

/** 分析中：小巫师施法 + 耗时 */
function AnalyzingState({ fileName, startedAt }: { fileName: string | null; startedAt: number | null }) {
  return (
    <section className="panel-pixel pixel-corners flex flex-1 flex-col items-center justify-center gap-4 py-16">
      <PixelBuddy state="casting" scale={7} />
      <p className="font-vt text-xl text-ink">
        施法中…{fileName ? <span className="text-ink-dim">（{fileName}）</span> : null}
      </p>
      <p className="font-vt text-sm text-ink-faint">
        BTC 和弦识别 + SongFormer 曲式分割，CPU 推理约需 1-3 分钟 ·{' '}
        {startedAt ? <ElapsedSeconds startedAt={startedAt} /> : null}
      </p>
    </section>
  )
}

function ElapsedSeconds({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [])
  return <span className="font-vt text-ink-dim">已用时 {((now - startedAt) / 1000).toFixed(1)}s</span>
}

/** 分析完成：正式工作区布局（波形 / 和弦轴 / 段落条 / 详情 + 小巫师） */
function DoneState({ onReset }: { onReset: () => void }) {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [justFinished, setJustFinished] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setJustFinished(false), 4000)
    return () => clearTimeout(timer)
  }, [])

  const wizardState: WizardState = isPlaying ? 'listening' : justFinished ? 'celebrate' : 'idle'

  return (
    <>
      <WaveformPlayer />
      <ChordTimeline sparkles={justFinished} />
      <SectionBar />
      <div className="flex min-h-0 flex-1 items-stretch gap-2">
        <AnalysisPanel />
        <aside className="panel-pixel flex w-36 shrink-0 flex-col items-center justify-between py-3">
          <PixelBuddy
            state={wizardState}
            scale={5}
            orbit={wizardState === 'idle' || wizardState === 'listening'}
            bubble={justFinished ? '和弦解读完毕！' : undefined}
          />
          <p className="px-1 text-center font-vt text-xs leading-snug text-ink-faint">
            {isPlaying ? '聆听中…' : justFinished ? '解读完成！' : '在书房待命'}
          </p>
          <button type="button" onClick={onReset} className="btn-pixel text-xs">
            分析下一首
          </button>
        </aside>
      </div>
    </>
  )
}

/** 分析失败：小巫师困惑 + 重试 */
function ErrorState({
  error,
  onReset,
  onRetry,
}: {
  error: string | null
  onReset: () => void
  onRetry: (() => void) | null
}) {
  return (
    <section className="panel-pixel flex flex-1 flex-col items-center justify-center gap-4 border-error/50 py-16">
      <PixelBuddy state="confused" scale={7} />
      <p className="font-vt text-lg text-error">分析失败</p>
      <p className="max-w-lg break-all px-4 text-center font-vt text-sm leading-relaxed text-ink-dim">
        {error ?? '未知错误'}
      </p>
      <div className="flex items-center gap-2">
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-pixel">
            重试
          </button>
        )}
        <button type="button" onClick={onReset} className="btn-pixel">
          重新选择文件
        </button>
      </div>
    </section>
  )
}
