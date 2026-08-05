# Step On Chord

> 音乐是治愈生活的魔法。 🎵✨

Step On Chord 是一款像素魔法风的桌面扒带工具：拖入一首歌，自动识别**和弦进行、调性、速度**并做**曲式分割**（Intro / Verse / Chorus / Bridge / Solo / Outro），以 DAW 风格时间轴可视化，支持手动校正与和弦谱导出。

An offline desktop chord-transcription tool: drop in a song, get chords, key, tempo and song structure, visualized on a pixel-art DAW-style timeline.

## 功能 / Features

- 🎸 **和弦识别**：BTC 模型（CPU 可跑），输出 major/minor 三和弦进行，根音准确率高
- 🎼 **曲式分割**：SongFormer 自动标注 Intro/Verse/Chorus/Bridge/Solo/Outro
- 🔑 **元数据**：调性（Krumhansl-Schmuckler）、BPM、置信度
- ️ **手动校正**：点和弦块改根音/性质（七和弦由人工补，比自动乱猜可靠）
- 📄 **导出**：Markdown / 纯文本和弦谱
- 🕘 **历史**：本地 SQLite 分析记录，点击回看
- 🌙 **像素魔法风 UI**：霍格沃茨夜晚氛围 + 像素小巫师

## 架构 / Architecture

```
Electron (main) ── spawn ──> Python sidecar (FastAPI, 127.0.0.1)
     │                          ├── BTC 和弦识别 (CPU)
     │                          ├── SongFormer 曲式分割 (CPU)
     │                          └── /api/analyze /api/audio /api/health
     └── BrowserWindow ──> React 18 + Vite + Tailwind + wavesurfer.js
```

算法核心派生自 [AI-ChordCraft](https://github.com/jassary08/AI-ChordCraft)（MIT），精简掉了所有 LLM 依赖，纯本地推理。

## 安装 / Installation（Windows）

从 [Releases](https://github.com/donokey/Step-On-Chord/releases) 下载 `step-on-chord-x.y.z-setup.exe` 运行安装（可选安装目录）。

**首次启动会自动进入模型下载页**：分析模型权重（BTC / SongFormer / MuQ / MusicFM，合计约 2.7 GB）不随安装包分发，点「开始下载模型」即可（断点续传，失败可重试）；也可以手动放置，见下方[模型下载](#模型下载)。

> 企业安全软件可能拦截未签名 exe，见[安装须知](#安装须知)。

## 模型下载

应用首启会自动检测并引导下载；下载源配置在仓库 [resources/model-sources.json](resources/model-sources.json)（换镜像只改这个文件，`{hf}` 会被替换为 `hfEndpoint`）。

手动下载（网络受限时）将以下文件放到模型目录对应位置：

| 文件 | 来源 | 放置位置（相对模型目录） |
| --- | --- | --- |
| BTC 主模型 | [ChordMini](https://github.com/ptnghia-j/ChordMini) `checkpoints/btc_model_best.pth` | `acr_model/checkpoints/btc/btc_combined_best.pth` |
| BTC 大词表 | 同上 `btc_model_large_voca.pt` | `acr_model/checkpoints/SL/btc_model_large_voca.pt` |
| SongFormer 权重 | [hf-mirror](https://hf-mirror.com/ASLP-lab/SongFormer) `SongFormer.safetensors` | `SongFormer/src/SongFormer/ckpts/SongFormer.safetensors` |
| MusicFM 权重 | [hf-mirror](https://hf-mirror.com/minzwon/MusicFM) `pretrained_msd.pt` + `msd_stats.json` | `SongFormer/src/SongFormer/ckpts/MusicFM/` |
| MuQ 权重 | [hf-mirror](https://hf-mirror.com/OpenMuQ/MuQ-large-msd-iter) `config.json` + `model.safetensors` | 见下载页「手动放置说明」的 HF 缓存布局 |

模型目录：

- 打包版：`%APPDATA%/step-on-chord/models`（设置页可打开）
- 开发期：`resources/models/`

## 安装须知

本应用与内置的 Python 引擎（PyInstaller 产物）均**未做代码签名**，企业安全软件（Defender 企业版 / EDR 等）大概率拦截，典型表现：安装后启动无反应、`chordcraft-engine.exe` 被隔离、引擎状态一直 starting。处理方式二选一：

1. **允许应用**：Windows 安全中心 → 病毒和威胁防护 → 保护历史记录 → 找到被拦截的 `Step On Chord.exe` / `chordcraft-engine.exe` → 操作选「允许在设备上」；
2. **加白名单**：把安装目录（默认 `%LOCALAPPDATA%/Programs/step-on-chord`）与 `%APPDATA%/step-on-chord`（模型/缓存目录）加入排除项。

处理后重启应用即可。个人电脑（无企业管控）一般不会遇到此问题。

## 开发环境 / Development

**前置要求**：Node 18+、Python 3.12、约 8GB 可用内存。

```powershell
# 1. Python 依赖：torch 必须先装 CPU 版，避免拉 ~2.5GB 的 CUDA 包
py -m pip install torch --index-url https://download.pytorch.org/whl/cpu
py -m pip install -r backend/requirements.txt

# 2. 模型权重 + 运行时代码（BTC / SongFormer / MuQ / MusicFM，幂等脚本）
powershell -ExecutionPolicy Bypass -File scripts/prepare-models.ps1

# 3. 前端 + 启动
npm install
npm run dev
```

启动后拖入 wav / mp3 / flac / ogg 即可分析（一首约 1-3 分钟，CPU）。

## 构建安装包 / Build

两步构建（Windows，需先按上文备好开发环境与模型）：

```powershell
# 第一步：PyInstaller 打包 Python sidecar → resources/python-backend/（含引擎运行时代码 engine-data）
powershell -ExecutionPolicy Bypass -File scripts/build-backend.ps1

# 第二步：vite 构建 + electron-builder NSIS 安装包 → release/step-on-chord-0.1.0-setup.exe
powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1
```

约定：

- sidecar 双模式：dev 用 `python backend/engine_main.py`，打包后用 `resources/python-backend/chordcraft-engine.exe`（见 [electron/sidecar.ts](electron/sidecar.ts)）
- 安装包不含模型权重（首启下载）、ffmpeg、测试音频；voicing 指法库与引擎代码随包内置
- 下载源配置：`resources/model-sources.json`

## 评估 / Evaluation

`eval/` 目录是批量准确度评估框架：`eval_batch.py` 轮换跑测试曲库，`eval_compare.py` 对照 `ground_truth.json`（公开和弦谱）输出调性准确率 / 根音 F1 报告。测试音频为版权歌曲，不入库。

### 贡献测试数据 / Contributing test data

准确度与分发方式无关，欢迎用你自己的曲库帮忙验证：

1. 把若干首你熟悉和弦的歌（wav/mp3/flac/ogg）放本地，运行 `py eval/eval_batch.py`（不带 `--limit` 跑全量）；
2. 在 `eval/ground_truth.json` 里按现有格式补上这些歌的调性 / 主歌根音（你越熟悉，标注越有价值）；
3. 运行 `py eval/eval_compare.py` 生成报告，把报告 + 你新增的 GT 条目（不含音频）提 Issue 或 PR。

爵士 / 摇滚 / 中文 indie 目前样本最少，这类 GT 最稀缺、帮助最大。

## 已知边界 / Known Limits

- 和弦性质只到三和弦（七和弦请手动校正）；爵士密集和声准确率下降
- 拍号暂不检测
- 人声/多轨混音置信度低（未来考虑 demucs 人声分离）

## 致谢 / Attribution

- [AI-ChordCraft](https://github.com/jassary08/AI-ChordCraft)（MIT）— BTC 和弦识别与 SongFormer 管线
- SongFormer / MuQ / MusicFM — 各模型原始许可见其官方仓库

## License

MIT
