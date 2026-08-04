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

## 开发环境 / Development

**前置要求**：Node 18+、Python 3.12、约 8GB 可用内存。

```powershell
# 1. Python 依赖（torch 用 CPU 版）
py -m pip install -r backend/requirements.txt
py -m pip install torch --index-url https://download.pytorch.org/whl/cpu

# 2. ffmpeg（音频解码已用纯 Python 替代，ffmpeg 仅 B 站下载测试曲等外围用途需要）

# 3. 模型权重（BTC + SongFormer + MuQ + MusicFM，约 2GB）
#    clone AI-ChordCraft 并运行其 scripts/prepare_third_party.sh，
#    然后把 third_party/ 下的 acr_model 与 SongFormer 拷到 resources/models/

# 4. 前端 + 启动
npm install
npm run dev
```

启动后拖入 wav / mp3 / flac / ogg 即可分析（一首约 1-3 分钟，CPU）。

## 评估 / Evaluation

`eval/` 目录是批量准确度评估框架：`eval_batch.py` 轮换跑测试曲库，`eval_compare.py` 对照 `ground_truth.json`（公开和弦谱）输出调性准确率 / 根音 F1 报告。测试音频为版权歌曲，不入库。

## 已知边界 / Known Limits

- 和弦性质只到三和弦（七和弦请手动校正）；爵士密集和声准确率下降
- 拍号暂不检测
- 人声/多轨混音置信度低（未来考虑 demucs 人声分离）

## 致谢 / Attribution

- [AI-ChordCraft](https://github.com/jassary08/AI-ChordCraft)（MIT）— BTC 和弦识别与 SongFormer 管线
- SongFormer / MuQ / MusicFM — 各模型原始许可见其官方仓库

## License

MIT
