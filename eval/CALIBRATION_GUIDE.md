# 校准层调参手册（模型层冻结，靠数据驱动校准）

> 原则：每次只动一个旋钮，用 eval 的 before/after 数字验证，涨了才保留。
> 数据不足（<30 首某类型）时不要调，先堆数据。

## 现状基线（2026-08-05，9 首）
- 调性准确率 0.714，根音 F1 0.728，主歌循环命中 0.167
- 华语流行 > 欧美流行 > 爵士

## 已观察的系统性错误
| 错误 | 案例 | 疑似旋钮 |
|---|---|---|
| 爵士调式判反（major/minor） | Take Five: Eb major vs Eb minor | `_estimate_key_from_chord_events` 的 minor profile 权重 |
| 爵士调性整体错 | Fly Me: F minor vs C major | diatonic prior（`_is_diatonic_root` 的 +0.025/-0.015）对爵士是错的 |
| 七和弦被压成三和弦 | 全部爵士 | refine 门（默认关）；`CHORD_QUALITY_TEMPLATES` 七和弦模板权重 |
| 根音序列顺序/偏移 | loop 命中低 | 段落边界对齐 `snap_sections_to_chord_boundaries` |

## 可调旋钮（backend/chord_recognition.py）
1. `_is_diatonic_root` 的 diatonic 加/减分（+0.025/-0.015）→ 爵士可考虑降低或按置信度自适应
2. `CHORD_QUALITY_TEMPLATES` 各 quality 的音程权重 → 影响七和弦召回
3. `refine_chord_event_qualities` 的 `upgrade_margin`/`added_tone_ratio` → 七和弦升级门（需先有 quality 级 GT 才能验证）
4. `_estimate_key_from_chord_events` 的 Krumhansl profile 与 minor 权重
5. `postprocess_chord_events` 的 `min_duration_seconds`/`low_confidence_threshold`

## 流程
1. 等每日任务攒数据（eval/accuracy_trend.jsonl 看趋势）
2. 某类型 >=30 首后，用 eval_compare 分类型统计
3. 选一个旋钮，改，重跑 eval_batch（全量），对比 trend
4. 涨了 → commit；没涨/跌 → 还原

## 何时考虑模型层
- 校准层到瓶颈（连续 2 周 trend 不涨）且数据 >=200 首带 GT
- 届时再评估 DTW 弱标注微调 / 合成七和弦探针
