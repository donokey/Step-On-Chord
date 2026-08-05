import { app } from 'electron'
import { createWriteStream, existsSync, readFileSync, statSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ModelsProgress, ModelsStatus, ModelWeightFile } from './types'

/** 权重文件后缀：引擎运行时代码（engine-data）拷贝时绝不覆盖已下载的权重 */
const WEIGHT_SUFFIXES = ['.pth', '.pt', '.safetensors', '.bin']

interface SourceFileEntry {
  id: string
  name: string
  url: string
  target: string
  minBytes?: number
}

interface SourceRepoEntry {
  id: string
  name: string
  repo: string
  files: string[]
}

interface ModelSources {
  hfEndpoint: string
  files: SourceFileEntry[]
  hfRepos: SourceRepoEntry[]
}

/** 配置文件缺失时的兜底（与 resources/model-sources.json 保持同步） */
const DEFAULT_SOURCES: ModelSources = {
  hfEndpoint: 'https://hf-mirror.com',
  files: [],
  hfRepos: [],
}

/**
 * 模型权重管理（打包后首启下载）：
 * - 模型根目录：打包后 <userData>/models（Program Files 不可写）；开发期 <项目根>/resources/models
 * - 引擎运行时代码（ChordMini / SongFormer 源码）打包在 resources/engine-data/，
 *   每次启动 bootstrap 同步到模型根目录（权重文件除外）
 * - 下载源 URL 全部来自 resources/model-sources.json，换镜像只改配置
 * - MuQ 权重按 HuggingFace 缓存布局落盘（refs/main + snapshots/<sha>/），
 *   sidecar 以 HF_HOME + HF_HUB_OFFLINE=1 直接命中缓存
 */
export class ModelsManager {
  private sources: ModelSources | null = null
  private downloading = false
  private sendProgress: ((progress: ModelsProgress) => void) | null = null

  /** 模型权重根目录 */
  get modelsDir(): string {
    return app.isPackaged
      ? path.join(app.getPath('userData'), 'models')
      : path.join(app.getAppPath(), 'resources', 'models')
  }

  /** 引擎运行时代码目录（仅打包后存在） */
  get engineDataDir(): string {
    return path.join(process.resourcesPath, 'engine-data')
  }

  /** MuQ 权重落盘的 HF 缓存根 */
  get hfCacheDir(): string {
    return path.join(app.getPath('userData'), 'hf-cache')
  }

  setProgressSender(sender: (progress: ModelsProgress) => void): void {
    this.sendProgress = sender
  }

  private emit(progress: ModelsProgress): void {
    this.sendProgress?.(progress)
  }

  private configPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'model-sources.json')
      : path.join(app.getAppPath(), 'resources', 'model-sources.json')
  }

  private async loadSources(): Promise<ModelSources> {
    if (this.sources) return this.sources
    try {
      const raw = await readFile(this.configPath(), 'utf-8')
      const parsed = JSON.parse(raw) as Partial<ModelSources>
      this.sources = {
        hfEndpoint: parsed.hfEndpoint || DEFAULT_SOURCES.hfEndpoint,
        files: Array.isArray(parsed.files) ? parsed.files : [],
        hfRepos: Array.isArray(parsed.hfRepos) ? parsed.hfRepos : [],
      }
    } catch {
      this.sources = DEFAULT_SOURCES
    }
    return this.sources
  }

  private resolveUrl(url: string, endpoint: string): string {
    return url.replace(/\{hf\}/g, endpoint)
  }

  /** 引擎运行时代码同步到模型根目录（打包后每次启动执行，权重文件除外） */
  async bootstrap(): Promise<void> {
    if (!app.isPackaged) return
    try {
      await stat(this.engineDataDir)
    } catch {
      return // engine-data 不存在（异常安装），留给下载页/手动处理
    }
    await mkdir(this.modelsDir, { recursive: true })
    await this.copyTree(this.engineDataDir, this.modelsDir)
    console.log(`[models] 引擎运行时代码已同步到 ${this.modelsDir}`)
  }

  private async copyTree(sourceDir: string, targetDir: string): Promise<void> {
    const entries = await readdir(sourceDir, { withFileTypes: true })
    for (const entry of entries) {
      const from = path.join(sourceDir, entry.name)
      const to = path.join(targetDir, entry.name)
      if (entry.isDirectory()) {
        await mkdir(to, { recursive: true })
        await this.copyTree(from, to)
      } else if (!WEIGHT_SUFFIXES.includes(path.extname(entry.name).toLowerCase())) {
        await copyFile(from, to)
      }
    }
  }

  private async fileComplete(target: string, minBytes: number): Promise<boolean> {
    try {
      const info = await stat(target)
      return info.isFile() && info.size >= minBytes
    } catch {
      return false
    }
  }

  /** MuQ 缓存是否完整（refs/main + snapshots 下所有配置文件） */
  private async muqCacheComplete(repo: SourceRepoEntry): Promise<boolean> {
    try {
      const modelCacheDir = path.join(this.hfCacheDir, 'hub', `models--${repo.repo.replace('/', '--')}`)
      const sha = (await readFile(path.join(modelCacheDir, 'refs', 'main'), 'utf-8')).trim()
      if (!sha) return false
      for (const file of repo.files) {
        if (!(await this.fileComplete(path.join(modelCacheDir, 'snapshots', sha, file), 1))) return false
      }
      return true
    } catch {
      return false
    }
  }

  /** 汇总缺失的模型权重（渲染进程首启下载页展示） */
  async status(): Promise<ModelsStatus> {
    const sources = await this.loadSources()
    const missing: ModelWeightFile[] = []
    if (app.isPackaged) {
      for (const file of sources.files) {
        const have = await this.fileComplete(path.join(this.modelsDir, file.target), file.minBytes ?? 1)
        if (!have) missing.push({ id: file.id, name: file.name, target: file.target, have: false })
      }
      for (const repo of sources.hfRepos) {
        if (!(await this.muqCacheComplete(repo))) {
          missing.push({ id: repo.id, name: repo.name, target: `${repo.repo}（自动放入 HF 缓存）`, have: false })
        }
      }
    }
    return {
      isPackaged: app.isPackaged,
      modelsDir: this.modelsDir,
      missing,
      downloading: this.downloading,
    }
  }

  /** 顺序下载全部缺失权重；已完成的文件自动跳过，失败中止并抛错（渲染进程可重试） */
  async downloadAll(): Promise<void> {
    if (this.downloading) return
    this.downloading = true
    try {
      const sources = await this.loadSources()
      for (const file of sources.files) {
        const target = path.join(this.modelsDir, file.target)
        if (await this.fileComplete(target, file.minBytes ?? 1)) {
          this.emit({ phase: 'skip', fileId: file.id, fileName: file.name })
          continue
        }
        await this.downloadToFile(this.resolveUrl(file.url, sources.hfEndpoint), target, file.id, file.name)
      }
      for (const repo of sources.hfRepos) {
        if (await this.muqCacheComplete(repo)) {
          this.emit({ phase: 'skip', fileId: repo.id, fileName: repo.name })
          continue
        }
        await this.downloadHfRepo(sources.hfEndpoint, repo)
      }
      this.emit({ phase: 'done' })
    } finally {
      this.downloading = false
    }
  }

  /** 单文件下载：.part 临时文件 + 完成后改名，避免半截文件被当成完整权重 */
  private async downloadToFile(
    url: string,
    target: string,
    fileId: string,
    fileName: string,
  ): Promise<void> {
    await mkdir(path.dirname(target), { recursive: true })
    const part = `${target}.part`
    console.log(`[models] 下载 ${fileName}: ${url}`)
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok || !response.body) {
      throw new Error(`${fileName} 下载失败（HTTP ${response.status}）：${url}`)
    }
    const totalBytes = Number(response.headers.get('content-length')) || 0
    let receivedBytes = 0
    let lastEmitAt = 0
    const counting = new Readable({
      read() {
        // 由 pipeline 驱动 pull
      },
    })
    // Web ReadableStream → Node Readable，边写边统计进度
    const reader = response.body.getReader()
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          receivedBytes += value.byteLength
          counting.push(Buffer.from(value))
          const now = Date.now()
          if (now - lastEmitAt > 300) {
            lastEmitAt = now
            this.emit({ phase: 'downloading', fileId, fileName, receivedBytes, totalBytes })
          }
        }
        counting.push(null)
      } catch (err) {
        counting.destroy(err instanceof Error ? err : new Error(String(err)))
      }
    })()
    try {
      await pipeline(counting, createWriteStream(part))
    } catch (err) {
      throw new Error(`${fileName} 下载中断：${err instanceof Error ? err.message : String(err)}`)
    }
    await rename(part, target)
    this.emit({ phase: 'downloading', fileId, fileName, receivedBytes, totalBytes })
  }

  /** 按 HuggingFace 缓存布局下载仓库文件（refs/main + snapshots/<sha>/），供 HF_HUB_OFFLINE 直接命中 */
  private async downloadHfRepo(endpoint: string, repo: SourceRepoEntry): Promise<void> {
    const api = await fetch(`${endpoint}/api/models/${repo.repo}`, { redirect: 'follow' })
    if (!api.ok) {
      throw new Error(`${repo.name} 获取仓库信息失败（HTTP ${api.status}）`)
    }
    const info = (await api.json()) as { sha?: string; siblings?: { rfilename: string }[] }
    const sha = info.sha
    if (!sha) throw new Error(`${repo.name} 仓库信息缺少 sha`)
    const available = new Set((info.siblings ?? []).map((sibling) => sibling.rfilename))
    const modelCacheDir = path.join(this.hfCacheDir, 'hub', `models--${repo.repo.replace('/', '--')}`)
    const snapshotDir = path.join(modelCacheDir, 'snapshots', sha)
    await mkdir(path.join(modelCacheDir, 'refs'), { recursive: true })
    await mkdir(snapshotDir, { recursive: true })
    for (const file of repo.files) {
      if (!available.has(file)) throw new Error(`${repo.name} 仓库缺少文件：${file}`)
      const target = path.join(snapshotDir, file)
      if (await this.fileComplete(target, 1)) {
        this.emit({ phase: 'skip', fileId: repo.id, fileName: `${repo.repo}/${file}` })
        continue
      }
      await this.downloadToFile(`${endpoint}/${repo.repo}/resolve/${sha}/${file}`, target, repo.id, `${repo.repo}/${file}`)
    }
    await writeFile(path.join(modelCacheDir, 'refs', 'main'), sha, 'utf-8')
  }

  /** 缓存是否完整（同步版，sidecar spawn 时判断 HF_HUB_OFFLINE 用） */
  private muqCacheCompleteSync(repo: SourceRepoEntry): boolean {
    try {
      const modelCacheDir = path.join(this.hfCacheDir, 'hub', `models--${repo.repo.replace('/', '--')}`)
      const refsPath = path.join(modelCacheDir, 'refs', 'main')
      if (!existsSync(refsPath)) return false
      const sha = readFileSync(refsPath, 'utf-8').trim()
      if (!sha) return false
      return repo.files.every((file) => {
        const target = path.join(modelCacheDir, 'snapshots', sha, file)
        return existsSync(target) && statSync(target).size > 0
      })
    } catch {
      return false
    }
  }

  /**
   * sidecar spawn 时注入的模型相关环境变量：
   * - CHORDCRAFT_MODEL_DIR：权重根目录（覆盖 engine_main 的 exe 同级默认值）
   * - CHORDCRAFT_VOICING_DB / ANNOTATIONS：voicing 数据随包内置（engine-data/voicing，只读即可）
   * - HF_HOME + HF_HUB_OFFLINE / HF_ENDPOINT：MuQ 缓存命中或镜像兜底下载
   */
  sidecarEnv(): Record<string, string> {
    if (!app.isPackaged) return {}
    const sources = this.sources ?? DEFAULT_SOURCES
    const env: Record<string, string> = {
      CHORDCRAFT_MODEL_DIR: this.modelsDir,
      CHORDCRAFT_VOICING_DB: path.join(this.engineDataDir, 'voicing', 'chords_db_voicings.json'),
      CHORDCRAFT_VOICING_ANNOTATIONS: path.join(this.engineDataDir, 'voicing', 'commonness_annotations.json'),
      HF_HOME: this.hfCacheDir,
    }
    // 缓存就绪则离线直读；否则允许引擎首推理时从镜像自动拉取（兜底）
    const muqRepo = sources.hfRepos[0]
    if (muqRepo && this.muqCacheCompleteSync(muqRepo)) {
      // 缓存就绪：离线直读，避免 hf_hub 联网校验 etag 触发重下
      env.HF_HUB_OFFLINE = '1'
    } else {
      // 缓存缺失：允许引擎首推理时从镜像自动拉取（兜底）
      env.HF_ENDPOINT = sources.hfEndpoint
    }
    return env
  }
}
