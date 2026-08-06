# 乐谱级真值对比 — 进度存档

最后更新：2026-08-06

## 已完成

1. **数据源**：Isophonics 官网被公司网拦截，改用 ChoCo v1.0.0 镜像
   （GitHub: smashub/choco releases，zip 存于 `eval/gt_data/choco_v1.zip`，
   解包标注在 `eval/gt_data/v1.0.0/jams/isophonics_*.jams`，共 225 条 Isophonics 曲目）。

2. **对比脚本**：`eval/gt_compare.py`
   - JAMS 解析（Harte 记号 → 根音/性质）
   - 推理结果缓存：`eval/gt_data/model_cache/<歌名>.json`（重跑加 `--skip-infer`）
   - DTW 动态时间规整对齐（吸收速度漂移/版本差）+ GT 事件中点采样
   - 自动"版本不符"标记：|时长差|>8s 或对齐质量<0.5
   - 报告输出：`eval/reports/gt-beatles-YYYY-MM-DD.md`

3. **首轮结果**（报告：`eval/reports/gt-beatles-2026-08-05.md`）

| 曲目 | GT调 | 模型调 | 根音准确率(DTW) | 备注 |
|---|---|---|---|---|
| Let It Be | C | C ✓ | 0.861 | 时长差 -4.4s，同版本，干净对比 |
| Yesterday | F | F ✓ | 0.860 | 时长差 +63.9s，**版本不符**（我们 mp3 191s vs 标注 127s） |

关键结论：
- 调性识别 2/2 全对（专家标注验证）
- 不做对齐时根音仅 0.2x 是时间轴错位假象，DTW 对齐后 ~0.86
- 主要错误源：短经过和弦（<1.2s）被后端 min_duration 平滑掉

## 待办（2026-08-06 起）

变更：每日定时测试任务（cron c941375d，每天 12:30 跑 10 首）已于 2026-08-06 **取消**——
这台公司电脑跑测试太吃力，改在用户的另一台电脑上跑。
评估流程全部脚本化（`eval_batch.py` / `gt_compare.py`），可移植：新机器装好 Python 依赖即可复现。

用户规定：**以后每次测试至少测 10 首**。

下一次测试：用同样方式测**国内摇滚**（草东没有派对的/万能青年旅店等，test-audio 已有音频）。
开放问题——国内摇滚没有 Isophonics 标注，GT 来源需先定：
- 方案 A：吉他谱网站（有版权+无时间戳，需解析+对齐，成本高）
- 方案 B：用户手动填 `eval/ground_truth.json`（用户熟悉草东/万青，可填段落和弦进行，走 eval_compare 流程）
- 方案 C：混合——段落级 GT（手动）+ 抽几首做逐和弦人工标注

注意：
- 跑推理前先关掉 Electron app（SongFormer 需 ~4.5GB 内存）
- 版本匹配：下载音频后先核对时长是否与 GT 标注一致
- Windows 控制台 print 避免 ✓✗（GBK 崩溃），报告文件无此限制
- ChoCo 还覆盖 Queen Greatest Hits I/II、Carole King 等（Bohemian Rhapsody=isophonics_267，但我们 mp3 也版本不符 -28s）
