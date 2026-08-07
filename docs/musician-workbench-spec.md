# Step On Chord 乐手工作台规划 v1.0（Spec + 路线图）

- **日期**: 2026-08-08
- **状态**: 待用户确认（确认前不动代码）
- **定位变化**: 从"和弦分析工具"升级为"乐手辅助工作台"——以歌曲为中心，分析、歌词、伴奏文件、导出围绕一首歌组织
- **与 engineering-hardening-plan.md 的关系**: 本文档重排了全部阶段的优先级；补强计划中的任务定义仍然有效，作为各阶段的工程细节引用
- **目标版本**: v0.2.0（工作台版）

## 0. 假设清单（先确认，有异议现在提）

1. 保持纯本地、无 LLM、无云同步的架构不变；歌词是手写编辑器，不做 AI 生成。
2. 歌词与和弦/伴奏**不做结构联动**（用户明确：歌词结构不一定跟着伴奏走），v1 是独立的分节文本编辑器。
3. "伴奏"= 项目内的文件收纳（伴奏/编曲/demo 文件存放与管理），不是伴奏生成。
4. 项目模型采用**文件夹形式**（每首歌一个文件夹），不是单一打包文件；音频默认引用原路径，可选"收集进项目"复制一份。
5. PDF 导出用 Electron 原生 printToPDF（零新依赖）；MIDI 用纯 JS 库在渲染进程生成（不动 Python sidecar）；ChordPro 为纯文本生成。
6. history.db 与现有历史页保持兼容不受损；项目索引作为新表加入，旧数据不动。
7. UI 延续像素魔法风，新视图走现有 SideNav + zustand 模式，不引入路由库和组件库。

## 一、目标与成功标准

**用户**: 乐手/翻唱者/写歌的人。典型场景：扒一首歌的和弦与调性 → 写/整理自己的歌词 → 把伴奏和 demo 收拢到这首歌名下 → 导出 ChordPro/PDF 带去排练，导出 MIDI 给编曲软件用。

**成功标准**（可验证）:

- [ ] 一首歌可以在应用内完成"分析 → 存项目 → 写歌词 → 加伴奏文件 → 导出"全流程，不需要外部工具
- [ ] 关闭应用后重新打开项目，全部内容（分析+手动校正+歌词+附件清单）完整恢复
- [ ] 项目文件夹拷到别的电脑（装本应用）能直接打开
- [ ] 现有核心功能零回归：分析、历史、Voicing、批量、md/txt 导出全部照常
- [ ] 每次发版前精度测试 ≥10 首（既定规则不变）

## 二、功能全景

| 模块 | 现状（v0.1.x） | v0.2.0 规划 |
|---|---|---|
| 和弦/调性/BPM/曲式分析 | ✅ 已有（BPM 多候选+网格验证刚落地） | 保持，七和弦精炼打通（阶段 6） |
| 手动校正与回写 | ✅ 已有 | 保持，纳入项目保存 |
| 歌曲项目系统 | ❌ 无（只有 500 条上限的历史记录） | 新增：本地项目文件夹，可存可开 |
| 歌词编辑 | ❌ 无 | 新增：独立分节编辑器 |
| 伴奏/编曲文件收纳 | ❌ 无 | 新增：项目内附件管理 |
| 导出 | md/txt 和弦谱 | 新增 ChordPro / PDF / MIDI |
| 历史页 | ✅ 已有 | 保持兼容，作为"未存项目的分析记录"存在 |

## 三、产品规格

### 3.1 歌曲项目系统

**项目 = 一个文件夹**，结构如下：

```
晴天/
├─ project.soc.json      ← 唯一数据源：元数据+分析结果+歌词+附件清单
└─ attachments/          ← 附件实体（伴奏/编曲/demo）
   ├─ demo-v1.mp3
   └─ 编曲参考.wav
```

**project.soc.json 数据模型**（v1）:

```json
{
  "format": "step-on-chord-project",
  "version": 1,
  "name": "晴天",
  "created_at": 1730000000000,
  "updated_at": 1730000000000,
  "audio": { "mode": "reference", "path": "D:/music/晴天.mp3", "file_name": "晴天.mp3" },
  "analysis": null,
  "lyrics": { "sections": [ { "type": "verse", "title": "主歌1", "text": "" } ] },
  "attachments": [
    { "id": "a1", "name": "demo-v1.mp3", "rel_path": "attachments/demo-v1.mp3",
      "kind": "demo", "note": "", "added_at": 1730000000000 }
  ]
}
```

**行为定义**:

- `audio.mode`: `reference`（默认，只存路径，与现状一致）或 `copy`（复制进项目文件夹，防原文件丢失）
- `analysis`: 复用现有 `AnalysisResult` 结构（含手动校正），不另造格式；为 null 表示还没分析
- 打开项目时若音频路径失效：提示用户重新定位文件（不静默失败）
- history.db 新增 `projects` 表（id, name, folder_path, updated_at）仅作索引/最近列表；**项目文件夹才是数据源**，DB 丢了可以从文件夹重建
- 现有分析页流程不变；分析完成后新增"存为项目"出口；历史页记录可"转存为项目"

### 3.2 歌词编辑器

- 独立模块，不与和弦时间轴/伴奏联动（v1 明确不做对齐）
- 结构：节（section）列表，每节含类型（主歌/副歌/桥段/前奏/尾奏/自由）、标题、正文
- 节可增删、排序、折叠；正文纯文本多行编辑
- 自动保存（防抖写回 project.soc.json），状态可见（"已保存/未保存"）
- 导出为纯文本（节标题 + 正文）
- v1 不做：押韵提示、字数统计、 syllable 对齐、AI

### 3.3 附件收纳

- 添加方式：文件选择对话框 + 拖拽（复用现有 `webUtils.getPathForFile`）
- 添加即复制进 `attachments/`（收纳的语义就是文件落到项目里）
- 元数据：类型标签（伴奏/编曲/demo/其他）、备注
- 操作：音频类附件可播放（复用 sidecar `GET /api/audio` 流，已支持 wav/mp3/flac/ogg）、在资源管理器中显示、移除（文件移入系统回收站，不永久删除）
- 非音频文件（如 .mid 工程、分轨压缩包）只收纳不解析

### 3.4 导出

| 格式 | 实现路径 | 说明 |
|---|---|---|
| ChordPro | 纯 TS 文本生成 | 因歌词与和弦不对齐，v1 输出为：头部 {title}/{key}/{tempo} + 按段落组织和弦 + 歌词附在文末（不做行内嵌和弦） |
| PDF | Electron `webContents.printToPDF` | 渲染打印样式视图后导出，零新依赖 |
| MIDI | 纯 JS（候选 midi-writer-js） | 和弦事件→MIDI：根音+品质→音程叠加，时值=和弦持续时长，tempo 取分析 BPM；v1 只出和弦块，不做节奏型 |

导出入口统一放在项目详情页，单文件导出走现有 `dialog:save-file`。

## 四、技术栈与命令

**现有**: Vite 8 + React 18 + TS + Tailwind 3 + zustand + better-sqlite3 + Electron 43；Python sidecar（FastAPI/PyInstaller）。

**新增依赖（需确认）**:

- `midi-writer-js`（MIDI 生成，纯 JS）
- `vitest`（前端纯逻辑单测，dev 依赖）

**命令**（新增后）:

```bat
dev:        npm run dev
build:      npm run build
test:py:    py -m pytest backend/tests
test:web:   npx vitest run
dist:       npm run dist
```

## 五、项目结构变化

```
electron/projects.ts        → 项目读写（建文件夹/读写 json/索引表/附件复制）
electron/db.ts              → 新增 projects 表（analyses 表不动）
src/shared/project-model.ts → 项目数据模型、校验、迁移（纯函数，前后端共用逻辑放渲染侧）
src/stores/projectStore.ts  → 项目列表/当前项目状态
src/components/views/ProjectsView.tsx      → 项目列表（新导航项）
src/components/views/ProjectDetailView.tsx → 项目详情（分析/歌词/文件 三个 tab）
src/components/lyrics/      → 歌词编辑器组件
src/utils/exportChordPro.ts / exportMidi.ts / exportPdf.ts
backend/tests/              → pytest（工程化补强计划 Phase 2 任务并入）
```

## 六、测试策略

- **前端纯逻辑**（vitest）：project-model 读写/校验、ChordPro 生成、MIDI 和弦→音符映射、歌词节操作。这些是项目系统的核心，必须先有测试再改逻辑。
- **后端**（pytest）：沿用补强计划 Phase 2 定义，本路线图阶段 2 一并落地。
- **手动验收**：每个阶段 Checkpoint 列出手动验证路径。
- **精度测试规则不变**：涉及分析管线的改动，发版前跑 ≥10 首（阶段 7 重建 eval 闭环后恢复常态化）。

## 七、边界

**始终做**: 改动前跑单测；项目文件写入用"临时文件+原子替换"防写坏；删除文件一律走回收站；保持像素魔法风视觉规范。

**先问再做**: 新增依赖；history.db 既有表结构变更；分析管线（backend 算法）改动；IPC 通道命名规范之外的新类别。

**绝不做**: 提交模型权重/测试音频/用户歌曲文件入库；永久删除用户文件；为歌词-和弦对齐预留"半成品"接口（v1 明确不做就不留钩子）；损害现有分析/历史/批量功能。

## 八、路线图（重排版，含工程化补强）

> 原 engineering-hardening-plan.md 的 Phase 编号在括号内标注，便于对照。

### 阶段 0：v0.1.1 发布【即刻，新电脑】

沿用补强计划"即刻行动"节：pull → 版本升 0.1.1 → 构建 → v0.1.1 tag + Release → v0.1.0 Release 补已知问题说明。

### 阶段 1：新电脑环境搭建与验证（约 0.5 天）

一切开发的前提。按 docs/run-eval-on-new-machine.md 装环境，跑 Beatles 两首 gt_compare 对照参考值（Let It Be 根音 0.861）。test-audio 手动迁移在此阶段完成（核对 35 首）。

- [ ] 验收：两首指标与参考值一致（±0.02）；test-audio 35 首就位

### 阶段 2：歌曲项目系统 + 单测打底（约 2 天，本路线图核心）

任务（依赖序）:

- [ ] T2.1 project-model 纯逻辑 + vitest 骨架（模型定义/校验/读写/原子保存）
  - 验收：vitest 跑通，模型读写用例全绿
  - 文件：src/shared/project-model.ts、vitest 配置
  - 规模：M
- [ ] T2.2 electron/projects.ts + projects 索引表 + IPC（create/open/save/list/locate-audio）
  - 验收：主进程单测或手动脚本验证建夹/读写/索引；analyses 表数据不受影响
  - 文件：electron/projects.ts、electron/db.ts、electron/ipc-handlers.ts、preload.ts
  - 规模：M
- [ ] T2.3 ProjectsView 列表页 + SideNav 新导航项
  - 验收：能看到项目列表（名称/更新时间），可打开/删除（删除=移除索引，文件夹进回收站）
  - 规模：S
- [ ] T2.4 ProjectDetailView 骨架 + 分析 tab（载入/展示现有 AnalysisResult，复用历史页载入逻辑）
  - 验收：打开项目能看到分析结果；无分析时提示去分析
  - 规模：M
- [ ] T2.5 "存为项目"出口：分析页保存按钮 + 历史页"转存为项目"
  - 验收：一次分析可存成项目，重开恢复一致（含手动校正）
  - 规模：S
- [ ] T2.6 音频引用失效处理 + "收集进项目"复制选项
  - 验收：移走原音频后打开项目有明确提示并可重新定位
  - 规模：S
- [ ] T2.7 backend pytest 骨架 + 核心纯函数测试【补强计划 Phase 2 任务并入】
  - 验收：py -m pytest 全绿 <30s
  - 规模：M

**Checkpoint 2**: 全流程手动走一遍"分析→存项目→重开→内容一致"；旧功能回归抽查（历史/批量/md 导出）；单测全绿。汇报后进入下一阶段。

### 阶段 3：歌词编辑器（约 1 天）

- [ ] T3.1 歌词数据模型并入 project-model + 测试（节的增删/排序/类型）
- [ ] T3.2 歌词编辑 UI（ProjectDetailView 歌词 tab）：节列表、类型选择、多行编辑、防抖自动保存、保存状态指示
- [ ] T3.3 歌词纯文本导出

**Checkpoint 3**: 写一首完整歌词（含多节）→ 关闭重开无丢失；导出文本格式正确。

### 阶段 4：附件收纳（约 1 天）

- [ ] T4.1 附件添加（对话框+拖拽→复制进 attachments/）+ 索引写入 project.json
- [ ] T4.2 附件列表 UI：类型标签、备注、播放（音频）、在资源管理器显示、移除（回收站）
- [ ] T4.3 边界处理：重名、超大文件提示、复制失败回滚

**Checkpoint 4**: 添加 3 类附件（mp3/wav/zip）→ 播放/打开/移除全部正常；项目文件夹拷到另一个目录后附件仍可播放（相对路径生效）。

### 阶段 5：导出三件套（约 1.5 天）

- [ ] T5.1 ChordPro 生成器 + 测试（纯函数，用例覆盖大小调/七和弦符号/无分析降级）
- [ ] T5.2 MIDI 生成器 + 测试（和弦符号→音符映射表是核心测试对象）
- [ ] T5.3 PDF 打印视图 + printToPDF 通道
- [ ] T5.4 项目详情页统一导出入口

**Checkpoint 5**: 三种格式用真实歌曲导出，ChordPro 可被第三方工具（如 Chordie/GuitarPro 类）识别，MIDI 可被 DAW 打开，PDF 版式可读。

### 阶段 6：七和弦精炼打通【补强计划 Phase 1】

- [ ] 盘点调用链 → 端到端打通 → 七和弦冒烟测试 → refine 默认开关决策
- 验收与任务细节见 engineering-hardening-plan.md Phase 1

**Checkpoint 6**: 冒烟测试绿；抽查一首爵士曲目输出含七和弦；三和弦基线不受影响。

### 阶段 7：eval 闭环重建 + 国内摇滚 GT【补强计划 Phase 3】

- [ ] 10 首批量粗测对照公司基线（调性 0.714/根音 0.728）
- [ ] 国内摇滚 GT（用户选曲+人工真值，分批 2-3 首）→ gt_compare/eval_compare 首轮报告

**Checkpoint 7**: 报告产出，指标可比；GT_PROGRESS.md 更新。

### 阶段 8：基建收尾【补强计划 Phase 4/5/6】

- [ ] 最小 CI（tsc + pytest + vitest）
- [ ] electron-updater 接入 + CHANGELOG 常态化 + 签名触发阈值
- [ ] doctor.py 环境自检

**Checkpoint 8（v0.2.0 发布验收）**: 全部成功标准达成 → 发 v0.2.0 工作台版。

## 九、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| AnalyzeView 与项目上下文耦合改动伤及核心分析流程 | 高 | 分析页逻辑不动，只加"存为项目"出口；项目详情用载入方式复用结果，不重构分析流 |
| 项目文件写坏（断电/崩溃） | 高 | 临时文件+原子替换；json 读取失败时保留 .bak 提示 |
| MIDI 和弦符号解析覆盖不全（挂留/增减/斜杠和弦） | 中 | 映射表测试先行；解析失败降级为根音五度，不抛错 |
| 附件复制占磁盘（大 demo 文件） | 中 | 复制前显示文件大小，超阈值（如 500MB）二次确认 |
| 歌词"以后想对齐和弦"的需求反悔 | 低 | v1 不留钩子（边界已声明）；真要做时数据模型加可选字段即可，不是破坏性变更 |
| 阶段 2 体量偏大（7 个任务） | 中 | T2.1-T2.2 完成后设中间汇报点；必要时 T2.6 顺延到阶段 4 之后 |

## 十、开放问题（需用户决策）

1. **项目默认存放位置**：用户每次自选，还是默认"文档\Step On Chord 歌曲"可改？
2. **音频默认模式**：reference（省空间，现状语义）还是 copy（防丢，占空间）？建议默认 reference + 醒目提供收集按钮。
3. **MIDI 内容**：v1 只出和弦块长音是否够用，还是要加贝斯根音轨？
4. **歌词节类型预设**：主歌/副歌/桥段/前奏/尾奏/自由 这套是否够？
5. **历史页去留**：项目系统上线后，历史页保持现状（未存项目的记录池）即可，还是逐步引导全部转项目？
6. **v0.2.0 发布切点**：阶段 5（导出）完成后发，还是阶段 4（附件）完成先发一个 0.2.0-beta？
