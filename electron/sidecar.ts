import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import type { SidecarInfo } from './types'

// 共享类型集中定义在 ./types（渲染进程也引用），此处 re-export 保持引用方路径不变
export type { SidecarInfo, SidecarStatus } from './types'

/** Python sidecar 就绪信号：stdout 中输出 `CHORDCRAFT_READY port=xxxxx` */
const READY_PATTERN = /CHORDCRAFT_READY port=(\d+)/
const READY_TIMEOUT_MS = 30_000
const MAX_RESTARTS = 3
const HEALTH_INTERVAL_MS = 5_000
const HEALTH_TIMEOUT_MS = 2_500
const MAX_HEALTH_FAILURES = 3
const STOP_TIMEOUT_MS = 3_000

/**
 * Python sidecar 进程管理：
 * - spawn 子进程（开发：python backend/engine_main.py；打包后：resources/python-backend/chordcraft-engine.exe）
 * - 监听 stdout 就绪信号，解析监听端口
 * - 周期健康检查 GET /api/health，连续失败视为崩溃
 * - 崩溃自动重启（指数退避，最多 MAX_RESTARTS 次），超限置为 error
 * - stop() 用于应用退出时主动终止
 */
export class SidecarManager extends EventEmitter {
  private proc: ChildProcess | null = null
  private info: SidecarInfo = { status: 'stopped', port: null, restartCount: 0, lastError: null }
  private healthTimer: NodeJS.Timeout | null = null
  private healthFailures = 0
  private stoppingIntentionally = false
  private startPromise: Promise<number> | null = null
  private stdoutBuffer = ''

  getInfo(): SidecarInfo {
    return { ...this.info }
  }

  /** 启动 sidecar（幂等：并发调用共享同一次启动） */
  start(): Promise<number> {
    if (this.info.status === 'ready' && this.info.port !== null) {
      return Promise.resolve(this.info.port)
    }
    if (!this.startPromise) {
      this.startPromise = this.doStart()
        .catch((err: Error) => {
          this.setStatus({ status: 'error', lastError: err.message })
          throw err
        })
        .finally(() => {
          this.startPromise = null
        })
    }
    return this.startPromise
  }

  /** 主动停止（应用退出时调用），不再触发自动重启 */
  async stop(): Promise<void> {
    this.stoppingIntentionally = true
    this.stopHealthCheck()
    const proc = this.proc
    if (!proc || proc.exitCode !== null) {
      this.proc = null
      this.setStatus({ status: 'stopped', port: null })
      return
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), STOP_TIMEOUT_MS)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      proc.kill()
    })
    this.proc = null
    this.setStatus({ status: 'stopped', port: null })
  }

  private async doStart(): Promise<number> {
    this.setStatus({ status: 'starting', lastError: null })
    this.stopHealthCheck()

    const port = await findFreePort()
    const candidates = this.resolveCommandCandidates(port)

    let lastError: Error | null = null
    for (const { command, args } of candidates) {
      try {
        return await this.spawnAndWaitReady(command, args, port)
      } catch (err) {
        lastError = err as Error
        // 仅当解释器不存在（ENOENT）时尝试下一个候选；就绪超时/启动报错直接抛出
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
        console.warn(`[sidecar] ${command} 不存在，尝试下一个候选解释器`)
      }
    }
    throw lastError ?? new Error('未找到可用的 Python 解释器')
  }

  /** 解析开发/生产环境下 sidecar 的启动命令候选 */
  private resolveCommandCandidates(port: number): { command: string; args: string[] }[] {
    if (app.isPackaged) {
      // PyInstaller --onedir 产物：<resources>/python-backend/chordcraft-engine.exe
      const exe = path.join(process.resourcesPath, 'python-backend', 'chordcraft-engine.exe')
      return [{ command: exe, args: [String(port)] }]
    }
    const entry = path.join(app.getAppPath(), 'backend', 'engine_main.py')
    // Windows 上 'python' 可能是 Microsoft Store 占位符，py launcher 指向真实安装，优先使用
    const interpreters = process.env.CHORDCRAFT_PYTHON
      ? [process.env.CHORDCRAFT_PYTHON]
      : process.platform === 'win32'
        ? ['py', 'python']
        : ['python3', 'python']
    return interpreters.map((command) => ({ command, args: [entry, String(port)] }))
  }

  /** spawn 子进程并等待就绪信号；就绪后的进程退出统一交给 handleExit（重启策略） */
  private spawnAndWaitReady(command: string, args: string[], expectedPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      console.log(`[sidecar] spawn: ${command} ${args.join(' ')}`)
      const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      this.proc = proc
      this.stdoutBuffer = ''

      proc.once('error', (err: NodeJS.ErrnoException) => {
        // spawn 失败（命令不存在等）：进程从未启动，清理后交由上层决定是否换候选
        this.proc = null
        reject(err)
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        // Python/uvicorn 日志打到主进程控制台，便于开发调试
        process.stderr.write(`[sidecar] ${chunk.toString()}`)
      })

      proc.on('exit', (code, signal) => {
        if (this.proc !== proc) return // spawn 失败或进程已被替换，忽略
        console.log(`[sidecar] exited (code=${code}, signal=${signal})`)
        this.handleExit(code, signal)
      })

      this.waitForReady(proc, expectedPort).then(
        (readyPort) => {
          console.log(`[sidecar] ready on http://127.0.0.1:${readyPort}`)
          this.healthFailures = 0
          this.setStatus({ status: 'ready', port: readyPort, lastError: null })
          this.startHealthCheck()
          resolve(readyPort)
        },
        reject,
      )
    })
  }

  /** 等待 stdout 中的就绪信号；超时或提前退出则拒绝 */
  private waitForReady(proc: ChildProcess, expectedPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        proc.kill()
        reject(new Error(`sidecar 就绪信号超时（${READY_TIMEOUT_MS / 1000}s）`))
      }, READY_TIMEOUT_MS)

      const onData = (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString()
        let newlineIndex: number
        while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) >= 0) {
          const line = this.stdoutBuffer.slice(0, newlineIndex)
          this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
          const match = READY_PATTERN.exec(line)
          if (match) {
            const port = Number(match[1])
            cleanup()
            if (port !== expectedPort) {
              console.warn(`[sidecar] 端口不一致：期望 ${expectedPort}，实际 ${port}，以实际为准`)
            }
            resolve(port)
            return
          }
          if (line.trim().length > 0) {
            process.stdout.write(`[sidecar] ${line}\n`)
          }
        }
      }

      const onExit = (code: number | null) => {
        cleanup()
        reject(new Error(`sidecar 在就绪前退出（code=${code}）`))
      }

      const cleanup = () => {
        clearTimeout(timer)
        proc.stdout?.off('data', onData)
        proc.off('exit', onExit)
        // 就绪后继续把 stdout 剩余输出转发到控制台
        proc.stdout?.on('data', (rest: Buffer) => {
          process.stdout.write(`[sidecar] ${rest.toString()}`)
        })
      }

      proc.stdout?.on('data', onData)
      proc.once('exit', onExit)
    })
  }

  /** 进程退出处理：非主动停止则按指数退避重启，最多 MAX_RESTARTS 次 */
  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.stopHealthCheck()
    this.proc = null
    if (this.stoppingIntentionally) return

    if (this.info.restartCount < MAX_RESTARTS) {
      const attempt = this.info.restartCount + 1
      const delayMs = 1000 * 2 ** (attempt - 1)
      console.warn(`[sidecar] 第 ${attempt}/${MAX_RESTARTS} 次重启，${delayMs}ms 后进行`)
      this.setStatus({ status: 'starting', restartCount: attempt, port: null, lastError: `exited code=${code} signal=${signal}` })
      setTimeout(() => {
        void this.start().catch((err: Error) => {
          console.error('[sidecar] 重启失败:', err.message)
        })
      }, delayMs)
    } else {
      console.error('[sidecar] 超过最大重启次数，置为 error')
      this.setStatus({ status: 'error', port: null, lastError: `sidecar 反复崩溃（已重启 ${MAX_RESTARTS} 次）` })
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck()
    this.healthTimer = setInterval(() => {
      const port = this.info.port
      if (port === null) return
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/health', timeout: HEALTH_TIMEOUT_MS },
        (res) => {
          res.resume()
          this.healthFailures = res.statusCode === 200 ? 0 : this.healthFailures + 1
          this.judgeHealth()
        },
      )
      req.on('timeout', () => req.destroy())
      req.on('error', () => {
        this.healthFailures += 1
        this.judgeHealth()
      })
    }, HEALTH_INTERVAL_MS)
  }

  private judgeHealth(): void {
    if (this.healthFailures < MAX_HEALTH_FAILURES) return
    console.warn(`[sidecar] 健康检查连续失败 ${this.healthFailures} 次，kill 并走重启流程`)
    this.healthFailures = 0
    // kill 触发 exit 事件 → handleExit 负责重启
    this.proc?.kill()
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }

  private setStatus(patch: Partial<SidecarInfo>): void {
    this.info = { ...this.info, ...patch }
    this.emit('status', this.getInfo())
  }
}

/** 从系统获取一个空闲 TCP 端口（绑定 0 端口后立即释放） */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('无法分配空闲端口'))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}
