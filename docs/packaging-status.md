# v0.1.0 打包状态与遗留问题 / Packaging Status & Known Issues

> 更新日期：2026-08-05（Phase 5 收尾）
> 本文档记录 Windows 安装包的构建状态、已验证项、阻塞项与重建注意事项，方便在其他机器上接续工作。

## 一、当前状态总览

| 项 | 状态 |
| --- | --- |
| PyInstaller sidecar 打包（`backend/build.spec`） | ✅ 完成，产物 `resources/python-backend/`（约 1.12GB，含 engine-data 运行时代码，不含权重） |
| 模型首启下载页（`electron/models.ts` + `ModelsSetupView`） | ✅ 代码完成，打包版实测待做 |
| NSIS 安装包 | ✅ 已产出 `release/step-on-chord-0.1.0-setup.exe`（约 457MB），包内容静态核验通过 |
| 本机安装/启动/sidecar/分析实测 | ❌ **被企业安全策略阻塞**（见下文第二节） |
| GitHub Releases 发布 | ⏳ 未发布（安装包目前只存在于构建机本地 `release/` 目录） |

安装包内容核验结果：含 Electron 主程序 + app.asar、better-sqlite3 预编译（asarUnpack）、`python-backend/`、`model-sources.json`；不含 models/ffmpeg/test-audio（符合设计）。

## 二、阻塞项：企业安全软件拦截未签名 exe

构建机装有企业 EDR（阿里 AliEDR）+ AppLocker 式策略，**所有未签名 exe 被拦截**：

- 双击/静默运行安装包报「管理员用策略规则限制了对…的访问」；
- EDR 会按内容云查杀：拦截 NSIS stub 的写盘行为、终止 `chordcraft-engine.exe`（PyInstaller 产物）；
- 对照实验确认拦截针对"未签名"：同一目录下的微软签名 exe 副本可以运行。

**在干净机器（个人电脑）上一般不会遇到**。若遇到，处理方式（README「安装须知」同文）：

1. Windows 安全中心 → 病毒和威胁防护 → 保护历史记录 → 对被拦的 `Step On Chord.exe` / `chordcraft-engine.exe` 选「允许在设备上」；
2. 或把安装目录 `%LOCALAPPDATA%/Programs/step-on-chord` 与 `%APPDATA%/step-on-chord` 加入排除项；
3. 企业管控严格时需联系 IT 加白名单。

## 三、待验证清单（换干净机器后逐项勾掉）

- [ ] 安装 `step-on-chord-0.1.0-setup.exe`（可选安装目录）
- [ ] 启动后进入模型下载页（打包版模型根 = `%APPDATA%/step-on-chord/models`）
- [ ] 下载 BTC / SongFormer / MusicFM / MuQ（合计约 2.7GB，含进度条、失败重试）
- [ ] sidecar `chordcraft-engine.exe` 启动，`/api/health` 就绪
- [ ] 分析一首歌跑通（和弦 + 调性 + BPM + 曲式分割）
- [ ] 历史记录、校正、导出在打包版可用

## 四、重建安装包的注意事项

1. **本机无 Visual Studio**：`electron-builder.yml` 已设 `npmRebuild: false`（better-sqlite3 v13 为 Node-API 模块，npm 包自带 win32-x64 预编译，Electron 下直接可用）。不要改回 true。
2. **EDR 机器上 electron-builder 会卡在 uninstaller 生成**：报错 `File: "...__uninstaller.exe" -> no files found`。原因是 electron-builder 默认要*运行*安装器 stub 来产出 uninstaller，被 EDR 拦截。两种解法：
   - 放行 EDR（推荐）；
   - 临时补丁 `node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js` 中 `computeScriptAndSignUninstaller` 的 Windows 分支，把 `wineVm.exec(installerPath, ...)` 替换为 `await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath)`（纯 Node 解析提取 uninstaller，不执行任何 exe）。注意 `npm install` 会冲掉此补丁。
3. 两步构建入口不变：`scripts/build-backend.ps1` → `scripts/build-installer.ps1`。

## 五、下一步

1. 在干净机器完成第三节验证清单；
2. 验证通过后把 `release/step-on-chord-0.1.0-setup.exe` 发布为 GitHub Release（README 安装节已链接 Releases 页）；
3. 长期方案：考虑代码签名（EV/OV 证书）彻底解决 EDR/SmartScreen 拦截。
