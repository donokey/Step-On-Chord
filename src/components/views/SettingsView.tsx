import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { SidecarInfo } from '../../../electron/types'
import { bridge } from '../../bridge'
import { resolveEngineBaseUrl } from '../../stores/analysisStore'
import { CHECK_UPDATE_EVENT } from '../UpdatePrompt'
import { PanelTitle } from '../PanelTitle'

const GITHUB_REPO = 'https://github.com/donokey/Step-On-Chord'
const MODEL_DOWNLOAD_GUIDE = `${GITHUB_REPO}#模型下载`

interface HealthChecks {
  acr_model: boolean
  songformer: boolean
  voicing_db: boolean
}

/** 设置视图：引擎状态 / 模型目录 / 实验功能 / 数据 / 外观与关于（只读展示 + 少量开关） */
export function SettingsView() {
  const [sidecarInfo, setSidecarInfo] = useState<SidecarInfo | null>(null)
  const [checks, setChecks] = useState<HealthChecks | null>(null)
  const [refine, setRefine] = useState(false)
  const [modelsDir, setModelsDir] = useState('')
  const [version, setVersion] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    void bridge.sidecar.getInfo().then(setSidecarInfo)
    const unsubscribe = bridge.sidecar.onStatusChange(setSidecarInfo)
    void bridge.settings.get().then((settings) => {
      setRefine(settings.refineQualities)
      setModelsDir(settings.modelsDir)
    })
    void bridge.app.getVersion().then(setVersion)
    return unsubscribe
  }, [])

  // sidecar 就绪后读一次 /api/health 自检项
  useEffect(() => {
    if (sidecarInfo?.status !== 'ready') {
      setChecks(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const baseUrl = await resolveEngineBaseUrl()
        const response = await fetch(`${baseUrl}/api/health`)
        const payload = (await response.json()) as { checks: HealthChecks }
        if (!cancelled) setChecks(payload.checks)
      } catch {
        if (!cancelled) setChecks(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sidecarInfo?.status])

  const handleRefineToggle = useCallback(async (next: boolean) => {
    setRefine(next) // 乐观更新
    const saved = await bridge.settings.setRefine(next)
    setRefine(saved)
  }, [])

  const handleClearHistory = useCallback(async () => {
    await bridge.history.clear()
    setConfirmClear(false)
    setCleared(true)
  }, [])

  const handleCheckUpdate = useCallback(() => {
    // UpdatePrompt 常驻监听该事件：重置「稍后」忽略标记并触发主进程检查（仅打包版生效）
    window.dispatchEvent(new Event(CHECK_UPDATE_EVENT))
  }, [])

  const engineReady = sidecarInfo?.status === 'ready'

  return (
    <div className="bg-atmosphere relative flex min-h-full flex-col gap-2 overflow-y-auto p-3">
      {/* 引擎与运行时 */}
      <section className="panel-pixel pixel-corners panel-tint-cool px-3 py-2">
        <PanelTitle symbol="⚙" className="mb-2">
          Engine
        </PanelTitle>
        <div className="space-y-1 font-vt text-sm">
          <SettingRow label="sidecar 状态">
            <StatusDot ok={engineReady} />
            <span className={engineReady ? 'text-success' : 'text-ink-dim'}>
              {engineReady ? `运行中 · 端口 ${sidecarInfo?.port}` : sidecarInfo?.status ?? '未知'}
            </span>
          </SettingRow>
          <SettingRow label="解码模式">
            <span className="text-ink">纯 Python（libsndfile · wav / mp3 / flac / ogg）</span>
          </SettingRow>
          <SettingRow label="引擎自检">
            {checks ? (
              <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                <CheckItem ok={checks.acr_model} name="acr_model" />
                <CheckItem ok={checks.songformer} name="songformer" />
                <CheckItem ok={checks.voicing_db} name="voicing_db" />
              </span>
            ) : (
              <span className="text-ink-faint">{engineReady ? '读取中…' : '引擎未就绪'}</span>
            )}
          </SettingRow>
        </div>
      </section>

      {/* 模型目录 */}
      <section className="panel-pixel panel-tint-warm px-3 py-2">
        <PanelTitle symbol="▣" className="mb-2">
          Models
        </PanelTitle>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate border border-edge bg-base-deep px-2 py-1 font-mono text-xs text-ink-dim" title={modelsDir}>
            {modelsDir || '…'}
          </code>
          <button
            type="button"
            onClick={() => void bridge.shell.openPath(modelsDir)}
            disabled={!modelsDir}
            className="btn-pixel shrink-0 px-2 py-1 text-xs disabled:opacity-40"
          >
            打开文件夹
          </button>
        </div>
        <div className="mt-1.5 space-y-1 font-vt text-sm">
          <WeightRow ok={checks?.acr_model} name="BTC 和弦识别权重（acr_model）" pending={!checks} />
          <WeightRow ok={checks?.songformer} name="SongFormer 曲式分割权重" pending={!checks} />
          {checks && (!checks.acr_model || !checks.songformer) && (
            <button
              type="button"
              onClick={() => void bridge.shell.openExternal(MODEL_DOWNLOAD_GUIDE)}
              className="font-vt text-xs text-cool-light underline decoration-dotted underline-offset-2 hover:text-warm"
            >
              权重缺失？查看模型下载指引（README）→
            </button>
          )}
        </div>
      </section>

      {/* 实验功能 */}
      <section className="panel-pixel panel-tint-magic px-3 py-2">
        <PanelTitle symbol="⚗" className="mb-2">
          Lab
        </PanelTitle>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={refine}
            onClick={() => void handleRefineToggle(!refine)}
            className={`relative h-5 w-10 shrink-0 border-2 transition-colors ${
              refine ? 'border-edge-glow bg-warm/25' : 'border-edge bg-base-deep'
            }`}
          >
            <span
              className={`absolute top-0 h-full w-4 transition-all ${refine ? 'left-5 bg-warm' : 'left-0 bg-ink-faint'}`}
            />
          </button>
          <span className="font-vt text-sm text-ink">七和弦自动精炼</span>
        </div>
        <p className="mt-1 font-vt text-xs leading-snug text-ink-faint">
          流行歌易误报，默认关闭；开启后重启引擎生效（环境变量 CHORDCRAFT_REFINE_QUALITIES=1 传入 sidecar）
        </p>
      </section>

      {/* 数据 */}
      <section className="panel-pixel px-3 py-2">
        <PanelTitle symbol="▤" className="mb-2">
          Data
        </PanelTitle>
        {cleared ? (
          <p className="font-vt text-sm text-success">历史已清空</p>
        ) : confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="font-vt text-sm text-error">确认清空全部分析历史？不可恢复</span>
            <button type="button" onClick={() => void handleClearHistory()} className="btn-pixel px-2 py-1 text-xs text-error">
              确认清空
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="btn-pixel px-2 py-1 text-xs">
              取消
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)} className="btn-pixel px-2 py-1 text-xs">
            清空分析历史
          </button>
        )}
      </section>

      {/* 外观 / 关于 */}
      <section className="panel-pixel pixel-corners px-3 py-2">
        <PanelTitle symbol="✦" className="mb-2">
          About
        </PanelTitle>
        <div className="mb-2 flex items-center gap-2">
          <span className="font-vt text-sm text-ink-dim">主题</span>
          <span className="border-2 border-edge-glow bg-warm/20 px-2 py-0.5 font-vt text-xs text-warm">魔法深色</span>
          <span className="cursor-not-allowed border-2 border-edge/50 px-2 py-0.5 font-vt text-xs text-ink-faint opacity-50">
            敬请期待
          </span>
        </div>
        <div className="space-y-0.5 font-vt text-sm text-ink-dim">
          <p className="flex items-center gap-2">
            Step On Chord <span className="text-ink-faint">v{version || '…'}</span>
            <button type="button" onClick={handleCheckUpdate} className="btn-pixel px-2 py-0.5 text-xs">
              检查更新
            </button>
          </p>
          <p>
            <button
              type="button"
              onClick={() => void bridge.shell.openExternal(GITHUB_REPO)}
              className="text-cool-light underline decoration-dotted underline-offset-2 hover:text-warm"
            >
              {GITHUB_REPO.replace('https://', '')}
            </button>
          </p>
          <p className="text-ink-faint">MIT License · 音乐是治愈生活的魔法</p>
        </div>
      </section>
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-ink-faint">{label}</span>
      {children}
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 ${ok ? 'bg-success shadow-[0_0_4px_var(--success)]' : 'bg-ink-faint'}`}
    />
  )
}

function CheckItem({ ok, name }: { ok: boolean; name: string }) {
  return (
    <span className={`flex items-center gap-1 ${ok ? 'text-success' : 'text-error'}`}>
      {ok ? '✓' : '✗'} {name}
    </span>
  )
}

function WeightRow({ ok, name, pending }: { ok: boolean | undefined; name: string; pending: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {pending ? (
        <span className="text-ink-faint">· {name}（待引擎就绪后检测）</span>
      ) : ok ? (
        <span className="text-success">✓ {name}</span>
      ) : (
        <span className="text-error">✗ {name} 缺失</span>
      )}
    </div>
  )
}
