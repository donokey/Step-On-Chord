# Step On Chord 工程化补强计划 v1.0

- **日期**: 2026-08-06（2026-08-10 更新）
- **状态**: Phase 0 ✅、Phase 2（单测打底）✅、Task 5.1（electron-updater，即 T7）✅；其余待执行，排程已并入 `docs/v0.3-execution-plan.md`
- **注意**: 2026-08-08 起阶段优先级由 `docs/musician-workbench-spec.md`（乐手工作台规划）重排，本文档的任务定义仍作为各阶段的工程细节引用；2026-08-10 起执行排程以 `docs/v0.3-execution-plan.md` 为准
- **执行方式**: 代码改动交 Qoder 执行，用户负责决策与验收；每个 Phase 完成后汇报，确认后再进入下一个
- **适用环境**: 2026-08-10 机器分工修订（见 v0.3-execution-plan.md 第一节）：公司电脑承担全部开发/测试/eval，另一台电脑仅负责打包、装包 E2E 验证与发 Release

## 一、背景与现状

2026-08-06 对仓库做了一次工程化审计，结论如下：

| 维度 | 现状 | 问题 |
|---|---|---|
| 验证体系 | 只有 eval 批跑一条腿（跑一次几十分钟、≥10 首） | backend 零单元测试，无 CI；日常改动无秒级回归护栏 |
| 资产入库 | .gitignore 设计合理 | gt_compare.py、gt_data/、GT_PROGRESS.md、song_queue_done.txt 均未提交；9 个 batch_*.log 散落未忽略 |
| 七和弦精炼 | 代码仍在（chord_recognition.py 16 模板 HPCP + refine_chord_event_qualities） | 由环境变量 CHORDCRAFT_REFINE_QUALITIES 门控、默认关闭，用户可见入口未打通；迁移时删除的是 LLM hybrid 边界检测（见 song_analysis.py 文件头注释） |
| 分发 | v0.1.0：457MB 全量、未签名、无更新通道 | electron-updater 未接；签名决策无量化触发条件；无 CHANGELOG |
| eval 闭环 | 每日 cron 已于 2026-08-06 取消（公司电脑负载不动） | 换机后需重建，docs/run-eval-on-new-machine.md 已写好流程 |

**最急迫的事实**：`docs/run-eval-on-new-machine.md` 的换机流程依赖 `gt_compare.py`、`eval/gt_data/`（jams 标注）、`GT_PROGRESS.md`，但三者目前都不在 git 里。新电脑 `git clone` 之后，这份换机指南会在第 5、7 步直接失效。**Phase 0 就是解决这件事。** ✅ 已于 2026-08-07 解决，见 Phase 0 执行记录。

**2026-08-07 进展更新**：

- 新电脑基于旧基点推送了 4 个提交：两个打包修复（让打包后的引擎真正可运行、引擎正确识别注入的 `CHORDCRAFT_MODEL_DIR`）+ 两个 BPM 增强（onset 自相关的多候选自动 BPM 检测、网格追踪验证双通道）。
- 本地 Phase 0 提交与这 4 个远端提交形成分叉，经 rebase 合并（零冲突：远端只动 `backend/*` 与打包配置，本地只动 `docs/` 与 `eval/`），已推送 GitHub，main = `f642039`。
- **新发现的发布问题**：v0.1.0 tag 指向 `1f5d693`（不含两个打包修复的旧提交），在架 Release 里的 457MB 安装包是旧代码构建的，带"装完引擎跑不起来"的问题。新安装包须升版本 0.1.1、打新 tag、发新 Release，见下文"即刻行动"节。

## 二、总原则

1. 底层稳定优先，任何改动不得损害核心分析功能。
2. 每个 Task 有验收标准和可执行的验证命令；每个 Phase 结束设 Checkpoint，向用户汇报并等待确认。
3. 测试规则（用户规定）：每次精度测试至少测 10 首。
4. 简单直接，拒绝过度工程：CI 只跑单元测试和类型检查，不做重推理；不引入新的重型框架。
5. 下一次国内摇滚测试（草东/万青等）在回家后进行，不提前跑。

## 即刻行动：新电脑上的下一次发布（先于 Phase 1）✅ v0.1.1 已发布

> **执行记录**：v0.1.1 已发布，tag 指向 `296a7e8`（fix: engine respects injected CHORDCRAFT_MODEL_DIR，含两个打包修复 + BPM 增强）。历史遗留：v0.1.1 Release 缺 `latest.yml`，不会被 electron-updater 识别为候选（影响见 packaging-status.md 第六节）。

新安装包已在新电脑构建完成（含两个打包修复 + BPM 增强），尚未上传。正确发布方式：

1. `git pull` —— 拉取 Phase 0 的全部评估资产与本计划文档。
2. `package.json` 版本号 0.1.0 → **0.1.1**（electron-builder 从这里读版本）。
3. 构建安装包，打 **v0.1.1** tag，创建新的 v0.1.1 Release 上传。
4. 在 v0.1.0 的 Release 说明中补一句："此版本存在已知问题（安装后引擎可能无法运行），请使用 v0.1.1。"
5. **不要**把新安装包挂到 v0.1.0 Release——该 tag 指向不含打包修复的旧代码，挂新包会让 tag 与实际构建代码不一致。

这一步同时是 Task 5.2 发布规范的首次实践：CHANGELOG.md 在本次一并建立，首条记录 v0.1.1 = 打包修复 + BPM 检测增强。

## 三、任务列表

### Phase 0：迁移前保全（公司电脑，约 30 分钟）✅ 2026-08-07 完成

> 目标：让 GitHub 仓库成为完整的迁移载体。纯 git 操作，无构建、无推理。

**执行记录（2026-08-07）**：新电脑先推了 4 个新提交导致分叉，确认两侧改动零重叠后 rebase 合并，零冲突，推送成功（main = `f642039`），`git ls-tree origin/main` 逐项验证资产已入库。偏差说明：`eval/song_queue_done.txt` 改为写入 .gitignore 而非入库（属运行状态记录文件，不影响换机流程）。

#### Task 0.1 补全 .gitignore

**描述**: eval 目录下的运行日志未被现有 .gitignore 覆盖，先忽略掉再提交，避免日志入库。

**改动**: `.gitignore` 追加 `eval/batch_run_*.log`、`eval/batch_log.txt`、`eval/batch_test_log.txt`。

**验收标准**:
- [x] `git status` 中不再出现任何 batch_*.log

**规模**: XS（1 文件）

#### Task 0.2 提交未入库的关键资产

**描述**: 把换机流程和国内摇滚测试依赖的全部资产提交入库，连同本计划文档。

**改动**: `git add` 以下文件并 commit：
- `eval/gt_compare.py`（乐谱级对比核心脚本）
- `eval/gt_data/`（Isophonics jams 标注；只提交 jams 等文本标注，model_cache 推理缓存不提交——需确认 model_cache 已忽略，未忽略则一并加入 .gitignore）
- `eval/GT_PROGRESS.md`、`eval/song_queue_done.txt`
- 已修改的 `eval/eval_batch.py`、`eval/song_queue.txt`
- `docs/engineering-hardening-plan.md`（本文件）

**验收标准**:
- [x] 上述文件全部出现在新 commit 中
- [x] `git status` 只剩预期内的未跟踪项（模型、音频、构建产物等已忽略项）

**规模**: S

#### Task 0.3 推送并验证

**描述**: push 到 origin，在 GitHub 网页端验证。

**验证**:
- [x] `git push origin` 成功
- [x] github.com/donokey/Step-On-Chord 可见新提交，`eval/gt_compare.py` 等资产在库

**规模**: XS

#### Task 0.4 非 git 资产迁移清单

**描述**: git 之外的资产无法随仓库迁移，列清单并逐一处理：

| 资产 | 迁移方式 |
|---|---|
| test-audio/ 35 首（版权原因不入 git） | 移动硬盘拷贝；到新电脑后核对数量（35 首）并抽查播放 |
| 模型权重（约 1.4GB） | 不迁移。新电脑装一次 Release 安装包，首启自动下载（run-eval-on-new-machine.md 第 3 节） |
| history.db（AppData\Roaming\step-on-chord\） | 可选。用户决定是否保留历史分析记录，保留则手动拷贝 |

**验收标准**:
- [ ] 清单经用户确认，test-audio 迁移方式敲定

**规模**: S

#### Checkpoint 0（汇报点）
- [x] GitHub 仓库包含全部 eval 资产
- [ ] 迁移清单确认（test-audio 35 首的迁移方式待用户执行时敲定）
- [x] 后续阶段全部在新电脑执行

---

### Phase 1：七和弦精炼路径盘点与打通（新电脑，约 0.5 天）

> 目标：BTC 目前只输出 major/minor 三和弦，但模型本身词表支持七和弦、精炼代码也还在。本阶段把这条路径摸清楚并打通，装上冒烟测试护栏。

#### Task 1.1 盘点调用链现状

**描述**: 从前端引擎选择 → engine_main → song_analysis → chord_recognition，梳理 "hybrid"/精炼路径当前断在哪一环。已知事实：`refine_chord_event_qualities` 存在且被 song_analysis.py 导入，由环境变量 `CHORDCRAFT_REFINE_QUALITIES=1` 门控；song_analysis.py 中仍有 `resolved_chord_engine in {"llm", "hybrid"}` 分支。

**产出**: 现状清单（哪些环节通、哪些断、前端有无入口），写入 docs/ 或汇报给用户。

**验收标准**:
- [ ] 输出一页现状清单，明确"恢复七和弦输出需要改动哪些文件"

**规模**: S（只读调研）

#### Task 1.2 端到端打通

**描述**: 依据 1.1 清单实施最小改动，让七和弦精炼路径从 UI 到输出可用。具体方案以 1.1 结论为准，默认取最小改动路径。

**验收标准**:
- [ ] 按现状清单完成改动，不引入计划外重构
- [ ] diff 经用户（或用户指定的 Qoder 审查流程）过目

**规模**: M（3-5 文件，视 1.1 结论）

#### Task 1.3 七和弦冒烟测试

**描述**: 新增一个快速冒烟测试：对一首含七和弦的测试音频（test-audio 中爵士曲目，如 Autumn Leaves/Take Five）跑分析，断言输出中存在七和弦符号（maj7/m7/7 等）。这是防止"迁移误删"重演的护栏。

**验收标准**:
- [ ] 冒烟测试存在且通过
- [ ] 人为删除精炼代码后测试会失败（红）

**验证**: 冒烟测试单首耗时控制在可接受范围；若整首推理太慢，可截取片段。

**规模**: S

#### Task 1.4 【用户决策】refine 默认开关

**描述**: 决定 `refine_chord_event_qualities` 是默认开启还是保持环境变量门控。建议：UI 设置项 + 默认关闭（保守，不影响现有基线指标），但由用户拍板。

**验收标准**:
- [ ] 用户给出决策，实施落地

**规模**: XS

#### Checkpoint 1（汇报点）
- [ ] 冒烟测试绿
- [ ] 手动抽查一首歌，输出包含七和弦
- [ ] 现有三和弦基线不受影响（抽查 Let It Be 结果与参考值一致）

---

### Phase 2：单元测试打底（新电脑，约 1 天）✅ 2026-08-09 完成（`20c4f8d`）

> 目标：给核心算法装秒级回归护栏。只测纯函数，不测音频 IO，追求快而不是覆盖率。
>
> **执行记录**：`backend/tests/` 已落地 3 文件（conftest.py + test_chord_recognition.py + test_song_analysis.py，commit `20c4f8d`）；前端 vitest 也已落地（src/shared/__tests__/project-model.test.ts，随项目系统 T2.1 入库）。

#### Task 2.1 pytest 骨架

**描述**: 建立 `backend/tests/` 目录与 `backend/requirements-dev.txt`（pytest 及必要依赖）。

**验收标准**:
- [x] `py -m pytest backend/tests` 可运行（哪怕暂时 0 用例）

**规模**: S

#### Task 2.2 核心纯函数测试

**描述**: 为以下不依赖音频文件的纯逻辑写测试（具体函数以代码实际结构为准）：
- chord_recognition.py：`_fold_hpcp_to_12_bins`（36→12 折叠正确性）、`_symbol_for_hpcp_root`（升降号选择）、16 模板匹配的代表性用例
- structure_recognition.py：段落边界判定的代表性用例
- song_analysis.py：和弦事件合并、min_duration 平滑等可隔离的逻辑

**验收标准**:
- [ ] 每个模块至少覆盖 3 个代表性用例
- [ ] 全部用例运行时间 < 30 秒

**规模**: M

#### Task 2.3 入口接线

**描述**: package.json 增加 `test:py` script；README 加一行测试命令说明。

**验收标准**:
- [ ] `npm run test:py` 可跑通

**规模**: XS

#### Checkpoint 2（汇报点）
- [ ] `py -m pytest` 全绿且 <30 秒
- [ ] 用户确认覆盖范围够用（不追求过度覆盖）

---

### Phase 3：新电脑重建 eval 闭环（新电脑，约 1 天 + GT 人工投入）

> 目标：在新电脑复现并延续精度测试闭环，并完成国内摇滚 GT 的启动。

#### Task 3.1 环境搭建与换机验证

**描述**: 严格按 `docs/run-eval-on-new-machine.md` 搭建环境，跑 Beatles 两首 gt_compare，对照参考值（Let It Be 根音 0.861 / 调性 C；Yesterday 0.860）。若该文档在实操中暴露遗漏，当场修订文档并提交。

**验收标准**:
- [ ] 两首歌指标与参考值一致（±0.02 内）
- [ ] run-eval-on-new-machine.md 经实操验证，修订入库

**规模**: M

#### Task 3.2 10 首批量粗测

**描述**: `py eval/eval_batch.py --limit 10` + `eval_compare.py` 出报告（满足"每次至少测 10 首"规则），与公司电脑基线对比（调性 0.714 / 根音 F1 0.728）。

**验收标准**:
- [ ] 报告产出至 eval/reports/
- [ ] 与公司基线的差异有解释（一致，或差异可归因）

**规模**: M

#### Task 3.3 【用户主导】国内摇滚 GT 建立

**描述**: 用户选曲（草东没有派对/万能青年旅店等，用户熟悉这些歌），逐段人工填写真值。GT 格式按 run-eval-on-new-machine.md 第 7 节的两个候选（ground_truth.json 走 eval_compare，或段落级标注）在启动前定一个。建议一次 2-3 首，避免一次性负担过大。

**验收标准**:
- [ ] 首批 ≥10 首的 GT 完成（可分多批，本任务以首批完成为准）
- [ ] GT 格式决策记录写入 GT_PROGRESS.md

**规模**: M（人工为主，Qoder 协助格式校验）

#### Task 3.4 国内摇滚首轮对比

**描述**: 用 gt_compare/eval_compare 跑国内摇滚首轮测试，出报告，更新 GT_PROGRESS.md。

**验收标准**:
- [ ] 报告产出，GT_PROGRESS.md 更新并提交

**规模**: S

#### Checkpoint 3（汇报点）
- [ ] 新电脑 eval 闭环完全可用
- [ ] 国内摇滚首轮报告交付
- [ ] 指标与公司基线可比

---

### Phase 4：最小 CI（约 0.5 天）

> 目标：push 即验证，防止坏代码静默入库。刻意保持最小：不做音频推理、不下载模型。

#### Task 4.1 GitHub Actions 工作流

**描述**: 新增 `.github/workflows/ci.yml`：push/PR 触发，跑 `tsc --noEmit`（前端类型检查）+ `py -m pytest backend/tests`。Python 依赖用 requirements.txt + requirements-dev.txt；不安装 torch CUDA 版（如单测确实不依赖 torch 则只装轻量依赖，装完实测耗时再定）。

**验收标准**:
- [ ] push 后 workflow 绿
- [ ] 单次运行 < 5 分钟

**规模**: S

#### Task 4.2 【用户决策】是否启用分支保护

**描述**: 个人仓库可选 main 分支保护（要求 CI 通过才能合并）。简单项目不一定需要，用户拍板。

**规模**: XS

#### Checkpoint 4（汇报点）
- [ ] CI 绿，决策项落地

---

### Phase 5：分发完善（约 1 天）

> 目标：把 v0.1.0 的"全量下载 + 手动安装"升级为可持续的发布链路。

#### Task 5.1 electron-updater 接入 ✅ 2026-08-09 完成（T7，`775be1d`..`aa901f1`）

**描述**: 接 electron-updater，以 GitHub Releases 为更新源，实现新版本检测与提示更新（不强制静默更新，桌面软件给用户确认）。

> **执行记录**：实现于 `775be1d`（feat: in-app auto-update via electron-updater），经 beta.2/beta.3 两轮迭代（`441a365`、`d5d27c6`），v0.2.0 stable（`aa901f1`）收束。beta.2 → beta.3 升级链路已端到端验证（含差分 404 回退全量），流程文档已写入 packaging-status.md 第六节。

**验收标准**:
- [x] 低版本安装包能检测到高版本并提示（beta.2 → beta.3 实测通过）
- [x] 更新流程文档写入 packaging-status.md（第六节）

**规模**: M

#### Task 5.2 发布流程规范化

**描述**:
- 建立 CHANGELOG.md，补记 v0.1.0
- 版本号约定：语义化版本，写进 packaging-status.md
- 代码签名触发条件量化：在 packaging-status.md 记录"GitHub Release 下载数达到 N（用户定）时启动 Trusted Signing 评估"，每次发布时顺手查看下载数

**验收标准**:
- [ ] CHANGELOG.md 存在且含 v0.1.0
- [ ] 签名触发阈值经用户确认并落文档

**规模**: S

#### Checkpoint 5（汇报点）
- [ ] 模拟一次真实升级路径（旧版本→新版本）成功

---

### Phase 6：环境自检脚本（约 0.5 天）

> 目标：把散落在记忆和文档里的环境坑（Electron 抢内存、GBK 编码、解码器）固化成一个预检命令。

#### Task 6.1 scripts/doctor.py

**描述**: 一条命令输出环境报告：是否有 Electron 进程在跑（提示先关）、模型文件完整性、音频解码可用性、控制台编码、Python/依赖版本。全部为只读检查，不修改环境。

**验收标准**:
- [ ] 新电脑跑 doctor 全绿
- [ ] 故意制造一个问题（如开着 Electron）时 doctor 能报出

**规模**: S

#### Checkpoint 6（最终验收）
- [ ] 全部 Phase 验收标准达成
- [ ] 本计划文档状态更新为"已执行"，归档执行记录

## 四、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| test-audio 迁移遗漏/损坏 | 高（测试规则要求 ≥10 首） | Phase 0.4 核对 35 首数量 + 抽查播放；缺的歌按 run-eval 文档用 media-spider 补 |
| 新电脑性能未知（内存/内存带宽） | 中 | Task 3.1 先跑两首摸底；SongFormer 吃 4.5GB 内存，跑前关 Electron（doctor 会检查） |
| gt_data/model_cache 误入 git 撑爆仓库 | 中 | Task 0.2 提交前逐项核对 git status，缓存目录确保在 .gitignore |
| Phase 1.1 盘点发现精炼路径损坏严重 | 中 | 1.1 是只读调研，结论出来先汇报再定 1.2 方案，必要时缩小范围只恢复 CLI 路径 |
| 国内摇滚 GT 人工成本被低估 | 中 | 分批 2-3 首推进，首批完成即出报告，不追求一次到位 |
| CI 在 GitHub runner 上依赖安装慢/失败 | 低 | 只做 tsc + pytest 轻量组合，torch 按单测实际需要裁剪 |

## 五、开放问题（需用户决策）

1. **refine 七和弦精炼默认开关**（Task 1.4）：建议默认关 + UI 开关。
2. **test-audio 迁移方式**（Task 0.4）：移动硬盘 or 其他。
3. **国内摇滚首批曲目与 GT 格式**（Task 3.3）：用户选曲；ground_truth.json vs 段落级标注二选一。
4. **代码签名触发阈值**（Task 5.2）：下载数达到多少启动 Trusted Signing 评估。
5. **是否启用分支保护**（Task 4.2）：个人仓库可选。

## 六、附录：资产现状清单（2026-08-07 更新）

| 类别 | 内容 | 状态 |
|---|---|---|
| 已入库 | backend/、eval 脚本、docs（含换机指南与本计划）、electron/、src/ | 正常 |
| 已入库（2026-08-07，f642039） | eval/gt_compare.py、eval/gt_data/（jams）、eval/GT_PROGRESS.md | ✅ 换机指南依赖已满足 |
| 已忽略 | eval/batch_*.log 等运行日志、eval/song_queue_done.txt | 已写入 .gitignore |
| 永久不入库（版权/体积） | test-audio/、resources/models/、reference/、eval/reports/、模型缓存 | 手动迁移或自动下载 |
| 仓库外 | history.db（AppData） | 用户决定是否迁移 |
