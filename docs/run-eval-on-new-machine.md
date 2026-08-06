# 换机运行指南：乐谱级真值对比（GT Compare）

在另一台电脑上复现 Step On Chord 的准确度测试流程。
本指南对应 2026-08-05 已成功跑通的流程（Beatles 两首，专家标注逐和弦对比）。

## 0. 流程总览

```
test-audio/*.mp3 ──┐
                   ├─> eval/gt_compare.py ──> eval/reports/gt-beatles-*.md
Isophonics 人工标注 ┘     （推理 + DTW对齐 + 逐和弦表）
(eval/gt_data/v1.0.0/jams/*.jams，已入库)
```

- 模型输出与 Isophonics 专家标注按时间一一对应
- DTW 动态时间规整吸收版本速度差；中点采样抗边界误差
- 自动标记"版本不符"样本（时长差 >8s 或对齐质量 <0.5）

## 1. 环境准备

| 依赖 | 说明 |
|---|---|
| Python 3.12（带 `py` 启动器） | 安装时勾选 "py launcher" |
| Git | 拉代码 |
| Node.js（可选） | 只有想跑 Electron 界面时才需要 |

装 Python 依赖（**torch 必须先装 CPU 版**，否则会拉 2.5GB CUDA 包）：

```bat
py -m pip install torch --index-url https://download.pytorch.org/whl/cpu
py -m pip install -r backend/requirements.txt
```

## 2. 拉代码

```bat
git clone https://github.com/donokey/Step-On-Chord.git
```

## 3. 获取模型权重（约 1.4GB，不入 git）

**推荐方式：装一次 Release 安装包，让它自动下载。**

1. 从 GitHub Release（v0.1.0）下载 `step-on-chord-0.1.0-setup.exe` 安装
2. 打开软件一次，等待"首次运行模型下载"完成（BTC + SongFormer + MusicFM + MuQ）
3. 模型落在 `%APPDATA%\step-on-chord\models`，MuQ 缓存在 `%APPDATA%\step-on-chord\hf-cache`

之后跑 eval 时用环境变量指过去即可（见第 5 步），**不用把模型拷进项目**。

<details>
<summary>备选：手动下载（不装软件时）</summary>

按 `resources/model-sources.json` 逐个下载到 `resources/models/`：

| 文件 | 来源 | 目标路径（相对 resources/models/） |
|---|---|---|
| BTC 主模型 | github.com/ptnghia-j/ChordMini/raw/main/checkpoints/btc_model_best.pth | acr_model/checkpoints/btc/btc_combined_best.pth |
| BTC 大词表 | github.com/ptnghia-j/ChordMini/raw/main/checkpoints/btc_model_large_voca.pt | acr_model/checkpoints/SL/btc_model_large_voca.pt |
| SongFormer 权重 | hf-mirror.com/ASLP-lab/SongFormer/resolve/main/SongFormer.safetensors | SongFormer/src/SongFormer/ckpts/SongFormer.safetensors |
| MusicFM 权重 | hf-mirror.com/minzwon/MusicFM/resolve/main/pretrained_msd.pt | SongFormer/src/SongFormer/ckpts/MusicFM/pretrained_msd.pt |
| MusicFM 统计 | hf-mirror.com/minzwon/MusicFM/resolve/main/msd_stats.json | SongFormer/src/SongFormer/ckpts/MusicFM/msd_stats.json |

注意：此方式还需要自备 SongFormer 的 Python 源码（HF 仓库 ASLP-lab/SongFormer，
放到 resources/models/SongFormer/），以及 MuQ 的 HF 缓存布局，比较繁琐——**建议直接走安装包方式**。
</details>

## 4. 准备测试音频

在 `test-audio/` 放两首歌（文件名必须与下面完全一致，脚本按文件名配对标注）：

```
The Beatles - Let It Be.mp3
The Beatles - Yesterday.mp3
```

**版本要求（重要，2026-08-05 的教训）：**

| 曲目 | 标注对应版本时长 | 备注 |
|---|---|---|
| Let It Be | 243.3s（4:03） | 标准版即可，小漂移 DTW 能吸收 |
| Yesterday | 127.4s（2:07） | 必须是标准录音室版；上次下到 3:11 的版本，被标"版本不符" |

放好后先核对时长：

```bat
py -c "import librosa; print(librosa.get_duration(path=r'test-audio/The Beatles - Let It Be.mp3'))"
py -c "import librosa; import librosa; print(librosa.get_duration(path=r'test-audio/The Beatles - Yesterday.mp3'))"
```

（自己电脑听歌的曲库、B站下载均可；用 media-spider 技能下 B 站时搜中文关键词更准。）

## 5. 跑对比

先关掉 Electron 应用（SongFormer 要吃约 4.5GB 内存，两个同时开会爆）。

```bat
set CHORDCRAFT_MODEL_DIR=%APPDATA%\step-on-chord\models
set HF_HOME=%APPDATA%\step-on-chord\hf-cache
set HF_HUB_OFFLINE=1
py eval/gt_compare.py
```

- 每首歌推理约 3-5 分钟，结果缓存在 `eval/gt_data/model_cache/`
- 改完脚本想重算指标：`py eval/gt_compare.py --skip-infer`（秒出，不重新推理）

## 6. 看结果

报告在 `eval/reports/gt-beatles-<日期>.md`：汇总表 + 每首歌的逐和弦对照表。

2026-08-05 参考值（公司电脑，同一套模型）：

| 曲目 | GT调 | 模型调 | 根音准确率(DTW) |
|---|---|---|---|
| Let It Be | C | C ✓ | 0.861 |
| Yesterday | F | F ✓ | 0.860（但版本不符被标记） |

跑出来的数明显偏低时，先看报告里的"时长差/对齐质量"列——多半是音频版本不对。

## 7. 扩充测试（约定：每次至少测 10 首）

- **更多 Isophonics 曲目**：下载 ChoCo v1.0.0 完整包（187MB）：
  `https://github.com/smashub/choco/releases/download/v1.0.0/v1.0.0.zip`
  解压后 `v1.0.0/jams/isophonics_*.jams` 共 225 条（Beatles 全专辑 + Queen Greatest Hits I/II + Carole King）。
  在 `gt_compare.py` 的 `PAIRS` 里加"音频文件 → jams 文件"映射即可。
  （isophonics.net 原站在部分公司网络被拦，ChoCo 是可靠镜像。）
- **批量粗测**（不需要标注）：`py eval/eval_batch.py --limit 10`，跑完 `py eval/eval_compare.py` 出报告。
- **国内摇滚**：没有 Isophonics 标注，真值来源待定（手动填 `eval/ground_truth.json` 走 eval_compare，
  或段落级人工标注），见 `eval/GT_PROGRESS.md`。

## 8. 常见坑

1. **控制台乱码/崩溃**：Windows GBK 控制台打不了 ✓✗，脚本 print 已用 ASCII；自己加输出时注意。
2. **内存不足（os error 1455 / alloc_cpu 失败）**：关掉 Electron 应用再跑；还不行就一首一首跑。
3. **准确率异常低**：优先怀疑音频版本不匹配，核对时长。
4. **短经过和弦全错**：后端 min_duration=1.2s 平滑导致，属已知行为，不是 bug
   （调参见 `eval/CALIBRATION_GUIDE.md`）。
5. **不要提交**：模型权重、test-audio、gt_data 大包、reports 均已 gitignore，保持现状。
