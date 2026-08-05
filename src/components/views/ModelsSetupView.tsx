import { useCallback, useEffect, useState } from 'react'
import type { ModelsStatus } from '../../../electron/types'
import { bridge } from '../../bridge'
import wizardImg from '../../assets/wizard.png'

type DownloadState = 'idle' | 'running' | 'done' | 'error'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * 模型首启下载页（仅打包版权重缺失时展示）：
 * 像素巫师 + 缺失清单 + 一键下载（进度条 / 失败重试）+ 手动放置说明。
 */
export function ModelsSetupView({ onEnterAnyway }: { onEnterAnyway: () => void }) {
  const [status, setStatus] = useState<ModelsStatus | null>(null)
  const [downloadState, setDownloadState] = useState<DownloadState>('idle')
  const [error, setError] = useState('')
  const [currentFile, setCurrentFile] = useState('')
  const [received, setReceived] = useState(0)
  const [total, setTotal] = useState(0)

  const refreshStatus = useCallback(async () => {
    setStatus(await bridge.models.status())
  }, [])

  useEffect(() => {
    void refreshStatus()
    const unsubscribe = bridge.models.onProgress((progress) => {
      if (progress.phase === 'downloading') {
        setCurrentFile(progress.fileName ?? '')
        setReceived(progress.receivedBytes ?? 0)
        setTotal(progress.totalBytes ?? 0)
      } else if (progress.phase === 'done') {
        setDownloadState('done')
        void refreshStatus()
      }
    })
    return unsubscribe
  }, [refreshStatus])

  const handleDownload = useCallback(async () => {
    setDownloadState('running')
    setError('')
    setCurrentFile('准备中…')
    setReceived(0)
    setTotal(0)
    const result = await bridge.models.download()
    if (!result.ok) {
      setDownloadState('error')
      setError(result.error ?? '下载失败')
    }
    void refreshStatus()
  }, [refreshStatus])

  const missing = status?.missing ?? []
  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
  const allReady = status !== null && missing.length === 0

  return (
    <div className="bg-atmosphere flex min-h-full items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl">
        <div className="panel-pixel pixel-corners panel-tint-magic px-6 py-5">
          {/* 像素巫师 + 标题 */}
          <div className="mb-4 flex items-center gap-4">
            <img src={wizardImg} alt="像素巫师" className="h-20 w-20 [image-rendering:pixelated]" />
            <div>
              <h1 className="font-pixel text-lg text-warm">召唤模型之灵</h1>
              <p className="mt-1 font-vt text-sm text-ink-dim">
                首次使用需要下载分析模型（约 2.7 GB），巫师施法需要它们
              </p>
            </div>
          </div>

          {/* 缺失清单 */}
          {status && missing.length > 0 && (
            <div className="mb-4 space-y-1 font-vt text-sm">
              {missing.map((item) => (
                <p key={item.id} className="text-error">
                  ✗ {item.name}
                  <span className="ml-2 text-ink-faint">{item.target}</span>
                </p>
              ))}
            </div>
          )}

          {/* 下载 / 进度 / 结果 */}
          {allReady ? (
            <p className="mb-4 font-vt text-base text-success">✓ 模型已就绪，可以开始分析了</p>
          ) : downloadState === 'running' ? (
            <div className="mb-4">
              <p className="mb-1 truncate font-vt text-sm text-ink" title={currentFile}>
                正在下载：{currentFile}
              </p>
              <div className="h-4 w-full border-2 border-edge bg-base-deep">
                <div className="h-full bg-warm transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 font-vt text-xs text-ink-faint">
                {formatBytes(received)} / {total > 0 ? formatBytes(total) : '…'}（{percent}%）
                · 已下载的文件不会重复下载，失败后可直接重试
              </p>
            </div>
          ) : downloadState === 'error' ? (
            <div className="mb-4">
              <p className="font-vt text-sm text-error">下载失败：{error}</p>
              <p className="font-vt text-xs text-ink-faint">检查网络后点「重试下载」，进度从断点文件继续</p>
            </div>
          ) : null}

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2">
            {!allReady && downloadState !== 'running' && (
              <button type="button" onClick={() => void handleDownload()} className="btn-pixel px-4 py-2 text-sm">
                {downloadState === 'error' ? '重试下载' : '开始下载模型'}
              </button>
            )}
            {status && (
              <button
                type="button"
                onClick={() => void bridge.shell.openPath(status.modelsDir)}
                className="btn-pixel px-3 py-2 text-xs"
              >
                打开模型文件夹
              </button>
            )}
            {allReady ? (
              <button type="button" onClick={onEnterAnyway} className="btn-pixel px-4 py-2 text-sm">
                进入应用
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnterAnyway}
                className="font-vt text-xs text-ink-faint underline decoration-dotted underline-offset-2 hover:text-ink-dim"
              >
                先进入应用（分析功能暂不可用）
              </button>
            )}
          </div>

          {/* 手动放置说明 */}
          {status && missing.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer font-vt text-sm text-cool-light">手动放置说明（网络受限时的备选方案）</summary>
              <div className="mt-2 space-y-1 font-vt text-xs leading-relaxed text-ink-dim">
                <p>模型根目录：{status.modelsDir}</p>
                {missing.map((item) => (
                  <p key={`${item.id}-manual`}>
                    · <span className="text-ink">{item.name}</span> →{' '}
                    <code className="font-mono text-ink-faint">
                      {item.id === 'muq' ? '见下方 MuQ 说明' : `${status.modelsDir}\\${item.target.replaceAll('/', '\\')}`}
                    </code>
                  </p>
                ))}
                <p className="mt-2">
                  MuQ 权重：下载 OpenMuQ/MuQ-large-msd-iter 的 config.json 与 model.safetensors，
                  放入 {status.modelsDir.replace(/\\models$/, '')}\hf-cache\hub\models--OpenMuQ--MuQ-large-msd-iter\snapshots\&lt;提交sha&gt;\
                  并在同目录 refs\main 文件内写入该 sha。放好后重启应用即可。
                </p>
                <p className="mt-2 text-ink-faint">下载源见仓库 resources/model-sources.json（可换镜像）。放置完成后重启应用重新检测。</p>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
