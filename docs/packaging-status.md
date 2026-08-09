# v0.1.0 打包状态与遗留问题 / Packaging Status & Known Issues

> 更新日期：2026-08-09（v0.2.0-beta.3 主线，应用内更新端到端验证通过）
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

## 五、版本号规范与发版流程（v0.2.0 起强制）

**规范**：发布 tag = `v` + package.json version，二者严格一致；不再出现“tag 是 v0.1.1 但安装包名 0.1.0”的情况。

**发版流程**（按序执行）：

1. `npm version <minor|patch|prerelease>` 改版本（同步 package.json 与 package-lock.json）；
2. 构建：`powershell -ExecutionPolicy Bypass -File scripts\build-backend.ps1`（如后端有改动）→ `powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1`（electron-builder 读 version 命名产物）；
3. `git tag v<version>` + `git push --tags`；
4. `gh release create v<version> <安装包与 blockmap 路径>`（公开仓库无需 GH_TOKEN，设置亦无妨）。

**当前版本**：package.json = `0.2.0-beta.3`（自动更新 + 工作台项目系统），已发布 GitHub Release `v0.2.0-beta.3`。

## 六、应用内更新（electron-updater + GitHub Releases，v0.2.0-beta.1 起）

**链路**：应用启动 10s 静默检查 → 发现新版自动下载（差分优先，失败自动回退全量）→ 用户确认 → `quitAndInstall` 重启安装。仅打包版生效（`isPackaged` 门控），dev 模式跳过。

**版本约定**：发布 tag = `v` + package.json version，二者严格一致；`latest.yml` / `*-setup.exe` / `*.blockmap` 三件套必须齐备——缺 `latest.yml` 的 release 不会被 electron-updater 识别为候选（v0.1.1 即缺，属历史遗留）。

**发布 checklist**（按序执行）：

1. `npm version <minor|patch|prerelease>` 改版本（同步 package.json 与 package-lock.json）；
2. 构建：`scripts/build-backend.ps1`（如后端有改动）→ `scripts/build-installer.ps1`；
3. 核验产物：`release/` 下 `*-setup.exe`、`*.blockmap`、`latest.yml` 三件套，且 `release/win-unpacked/resources/app-update.yml` 自动生成；
4. `git commit` + `git tag v<version>` + `git push --tags`；
5. `gh release create v<version>` + `gh release upload` 三件套（公开仓库无需 GH_TOKEN）。

**已端到端验证（2026-08-09，beta.2 → beta.3）**：检查发现新版、自动下载（差分 404 自动回退全量）、下载完成提示、用户确认后 quitAndInstall → NSIS 安装器 → 版本更新并自动启动。

**注意**：

- `electron-builder --dir`（`npm run pack`）**不生成** `app-update.yml`，更新验证必须用完整 NSIS 构建；临时验证可手动补该文件（内容与生成格式一致，勿带 BOM）；
- `github.com` 域名被 SNI 阻断的网络下检查更新会失败（`api.github.com` 正常不代表 `github.com` 可用）；本地验证可临时将 app-update.yml 改为 generic provider + `python -m http.server`；
- 升级安装若提示「请关闭正在运行的应用」，需先关闭所有实例；升级已装旧版本前建议先卸载旧版；
- 0.1.x 用户无法自动升级到 0.2.0-beta.x（prerelease 被过滤），需等 0.2.0 稳定版发布。

## 七、下一步

1. 发布 0.2.0 稳定版（非 beta），0.1.x 用户即可自动升级（v0.1.1 缺 latest.yml 的历史问题随之解决）；
2. 提交当前工作区变更（package.json = beta.3、updater.ts 诊断日志与异常兜底）并同步 tag；
3. 在干净机器完成第三节验证清单（模型下载/分析实测）；
4. 长期方案：代码签名（EV/OV 证书）彻底解决 EDR/SmartScreen 拦截。
