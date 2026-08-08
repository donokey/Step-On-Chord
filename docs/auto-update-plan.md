# 应用内自动更新实施计划 v1.1（详细版）

- **日期**: 2026-08-08
- **状态**: 待执行（执行入口：README 与本文档；所有改动交 Qoder/开发助手按 Step 顺序执行）
- **目标**: 用户在软件内自行更新（检测新版本 → 下载 → 一键重启安装），不再手动下载安装包
- **技术选型**: electron-updater（electron-builder 官方配套）+ GitHub Releases 更新源
- **关联文档**: engineering-hardening-plan.md Phase 5（分发完善）、musician-workbench-spec.md 阶段 8

---

## 〇、现状盘点（已就绪 / 缺口）

| 基础 | 状态 |
|---|---|
| electron-builder 26.x + NSIS 目标 | ✅ 已用（v0.1.1 发布） |
| blockmap（差分更新必需） | ✅ 构建时自动生成（release/*.blockmap） |
| GitHub Releases 发布流程 | ✅ v0.1.1 已实践（gh release create/upload） |
| 版本号规范 | ❌ package.json 仍 0.1.0，与 v0.1.1 tag 不一致（历史遗留，Step 5 修复） |
| electron-updater 依赖 | ❌ 未安装 |
| 更新 UI | ❌ 无 |

---

## 一、实施步骤（每步有验收，按序执行）

### Step 1：依赖与发布配置

**1.1 安装依赖**
```powershell
cd D:\Software\Step-On-Chord
npm install electron-updater --save
```

**1.2 electron-builder.yml 增加发布配置**（文件末尾追加）：
```yaml
publish:
  provider: github
  owner: donokey
  repo: Step-On-Chord
```

**1.3 验收**：`npx tsc --noEmit` 通过（无新增错误）。

---

### Step 2：主进程更新管理（新文件 `electron/updater.ts`）

**职责**：封装 autoUpdater，管理检查/下载/安装生命周期，向渲染进程推送状态。

**核心设计**：

```typescript
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from './types'

/**
 * 更新管理（仅打包版生效）：
 * - 启动延迟 CHECK_DELAY_MS 后静默检查；渲染进程可手动触发 check()
 * - 下载完成后不立即安装，等待用户确认（UI 提示）
 * - 所有异常非致命：失败仅提示，不影响使用
 */
export class UpdaterManager {
  constructor(private getWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = true          // 发现新版自动下载（下载中展示进度）
    autoUpdater.autoInstallOnAppQuit = false // 安装时机由用户确认
    // 事件 → 渲染进程
    autoUpdater.on('checking-for-update', () => this.push({ status: 'checking' }))
    autoUpdater.on('update-available', (info) => this.push({ status: 'available', version: info.version, releaseNotes: notesText(info) }))
    autoUpdater.on('update-not-available', () => this.push({ status: 'not-available' }))
    autoUpdater.on('download-progress', (p) => this.push({ status: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total }))
    autoUpdater.on('update-downloaded', (info) => this.push({ status: 'downloaded', version: info.version }))
    autoUpdater.on('error', (err) => this.push({ status: 'error', message: err.message }))
  }

  /** 启动后延迟静默检查（开发模式直接跳过） */
  start(): void {
    if (!app.isPackaged) return
    setTimeout(() => void this.check(), CHECK_DELAY_MS)
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return
    await autoUpdater.checkForUpdates() // 抛错由 error 事件捕获
  }

  /** 用户确认后安装并重启（主进程调用） */
  install(): void {
    autoUpdater.quitAndInstall(false, true)
  }
}

function notesText(info: { releaseNotes?: string | { note?: string }[] | null }): string {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes
  if (Array.isArray(info.releaseNotes)) return info.releaseNotes.map((n) => n.note ?? '').join('\n')
  return ''
}
```

**说明**：
- `CHECK_DELAY_MS = 10_000`（启动 10 秒后静默检查，避免与首启模型下载页冲突）
- 事件通过 `updater:status` 通道推送（见 Step 3）
- electron-updater 内部会读 `GH_TOKEN`/`GITHUB_TOKEN` 环境变量（公开仓库不需要，但设置无妨——发布脚本里已有 GH_TOKEN 用法）

**2.1 types.ts 增加状态类型**：
```typescript
/** 应用更新状态（主进程 → 渲染进程推送） */
export type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number; transferred: number; total: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }
```

**2.2 main.ts 接线**：
- import UpdaterManager，创建实例（依赖 getWindow）
- app.whenReady 后 `updater.start()`
- before-quit 无需特殊处理（quitAndInstall 自行处理）

**2.3 验收**：`npx tsc --noEmit` 通过；dev 模式下 updater 不启动（isPackaged 门控）。

---

### Step 3：preload 暴露 API + IPC

**3.1 preload.ts 增加 updater 块**：
```typescript
/** 应用更新（electron-updater） */
updater: {
  check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onStatus: subscribe<UpdateStatus>('updater:status'),
},
```

**3.2 ipc-handlers.ts 注册通道**：
```typescript
ipcMain.handle('updater:check', () => updater.check())
ipcMain.handle('updater:install', () => updater.install())
```
（registerIpcHandlers 增加 `updater: UpdaterManager` 参数）

**3.3 bridge.ts fallback 增加空实现**（浏览器预览不崩）：
```typescript
updater: {
  check: async () => {},
  install: async () => {},
  onStatus: () => () => {},
},
```

**3.4 验收**：`npx tsc --noEmit` + `npx vitest run` 全绿。

---

### Step 4：渲染进程更新 UI（新文件 `src/components/UpdatePrompt.tsx`）

**状态机**：`idle → checking → available → downloading → downloaded → error`（not-available 时短暂显示后消失）

**交互**：
- 启动后订阅 updater.onStatus；收到 available/downloaded 时显示弹窗
- available：显示新版本号 + releaseNotes（截断展示）+「立即更新」（触发下载——autoDownload=true 已开始）或「稍后」
- downloading：进度条（percent）+ 已下载/总量（MB）
- downloaded：「立即重启更新」（调 updater.install）或「稍后」（弹窗关闭，下次启动再提示——简单做法：关闭即消失）
- error：小提示条「检查更新失败」（非阻断）

**视觉规范**：panel-pixel / pixel-corners / font-vt / PixelBuddy 组件；固定右下角浮层（不阻塞主界面）。

**放置**：
- App.tsx 全局挂载 `<UpdatePrompt />`
- SettingsView「关于」区加「检查更新」按钮（手动触发 updater.check）

**验收**：`npx tsc --noEmit` + build 通过；dev 模式 UI 不崩（fallback 生效）。

---

### Step 5：版本号规范化（发布前置）

**5.1 package.json version 更新为下一个版本**（当前主线为 0.2.0 工作台，第一版发 `0.2.0-beta.1`）：
```json
"version": "0.2.0-beta.1"
```

**5.2 约定（写入 packaging-status.md）**：
- 发布 tag = `v` + package.json version（严格一致）
- 发版流程：`npm version <minor|patch|prerelease>` 改版本 → 构建（electron-builder 读 version 命名产物）→ `git tag v<version>` + push → gh release create/upload
- 不再出现"tag 是 v0.1.1 但安装包名 0.1.0"的情况

**5.3 验收**：`npx electron-builder --dir` 产物名含新版本号。

---

### Step 6：端到端验证（关键，需真实安装）

**前置**：本地构建并发布一个"旧版" Release，再构建"新版"验证升级。

**操作序列**：
1. 构建并发布 `0.2.0-beta.1`（含项目系统 + 更新 UI）：
   - `powershell -ExecutionPolicy Bypass -File scripts\build-backend.ps1`
   - `powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1`
   - 打 tag `v0.2.0-beta.1` + gh release（GH_TOKEN 方案）
2. 安装该版本（或复用现有安装目录升级安装）
3. 改一处小逻辑（如更新 UI 文案）+ `npm version 0.2.0-beta.2` → 重新构建 → 发布 `v0.2.0-beta.2`
4. **在 beta.1 应用内**：手动「检查更新」→ 应提示 beta.2 → 下载（观察进度）→ 「立即重启更新」→ 应用重启 → 版本号变为 beta.2
5. 启动静默检查验证：无更新时无打扰

**验证矩阵**：

| 场景 | 预期 |
|---|---|
| 启动静默检查（无新版） | 无 UI 打扰 |
| 手动检查（有新版本） | 弹窗显示版本+说明 |
| 下载中 | 进度条实时更新 |
| 下载完成 | 「立即重启更新」按钮 |
| 安装重启 | 版本号更新，功能正常 |
| 断网检查 | 错误提示（不崩溃） |
| 小改动差分更新 | 下载量远小于全量（blockmap 生效） |

**注意**：
- dev 模式 updater 不工作（isPackaged 门控），验证必须在安装版进行
- 安装版需先放行 SAC（本机已关闭 SAC）

---

### Step 7：文档与发布收尾

- `packaging-status.md` 增加「应用内更新」节：更新流程、版本约定、发布 checklist
- `CHANGELOG.md` 建立：v0.1.1（打包修复 + BPM 增强）、v0.2.0-beta.1（工作台项目系统 + 自动更新）
- 更新记忆/开发记录：本次实施经验

---

## 二、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 未签名安装包被 SAC/SmartScreen 拦 | 更新安装失败 | UI 提示放行；长期代码签名（Phase 5 已规划阈值） |
| 差分更新失败 | 更新中断 | electron-updater 自动回退全量下载（官方行为，无需处理） |
| GitHub 网络不稳（国内） | 检查/下载失败 | 错误提示 + 可重试；后续可评估镜像 provider |
| 更新时旧进程占用文件 | 安装失败 | quitAndInstall 自动等待退出（NSIS 标准行为） |
| releaseNotes 格式差异 | UI 显示异常 | notesText() 兼容 string/数组两种格式 |
| 0.2.0-beta 未发布时检查更新 | 404/无更新 | 正常返回 not-available；首次 beta 发布后链路才真实可用 |

---

## 三、验收标准（Checkpoint）

- [ ] Step 1-4 全部编译 + 单测全绿
- [ ] Step 6 端到端：beta.1 → beta.2 应用内升级成功
- [ ] 版本号规范落地（tag 与 package.json 一致）
- [ ] packaging-status.md 更新流程文档完成
