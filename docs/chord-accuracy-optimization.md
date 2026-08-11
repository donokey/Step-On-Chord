# 和弦识别准确度优化计划（v1.0）

- **日期**: 2026-08-11
- **基线**: 调性准确率 0.714 / 主歌根音 F1 0.728（公司电脑，eval_compare 口径：Verse 段去重根音序列）
- **关联**: v0.3-execution-plan.md B4（七和弦精炼盘点）/ B5（eval 闭环重建）
- **执行方式**: 评测可在任意一台备好环境的电脑上跑（见"三、执行前提"）

## 一、关键发现（2026-08-11 代码盘点）

1. **SL 大词表模型已在库中但未生效**：`resources/models/acr_model/checkpoints/SL/btc_model_large_voca.pt`（170 类，原生支持七和弦/挂留/增减）早已下载，调用路径 `engine="btc-sl"` 也是通的；但默认引擎 `plkd-btc` 的 `auto` 变体在 PL 存在时恒选 PL（`chord_recognition.py` L1539-1542），PL 只输出三和弦。
2. **即便切 SL，七和弦也会在解析层被砍掉**：`_parse_lab_events` 里 `simplify_chord_symbol` 把 `C:maj7` 归并成 `C`（min→m，其余只留根音）。延伸形式保留在事件的 `arrangement_chord` / `raw_chord` 字段里，未进主流出。**这就是 B4 要摸的底：路径完好，差最后一公里。**

## 二、优化选项菜单（按性价比排序）

| # | 方案 | 预期收益 | 成本 | 说明 |
|---|---|---|---|---|
| 1 | **SL 大词表 A/B 实测** | 摸清性质维度上限 | 0.5 天（跑分 + 看报告） | 用 `eval/eval_ab_engine.py`；决策树见第四节 |
| 2 | **打通延伸和弦输出** | 用户可见七和弦 | 0.5-1 天 | 视 #1 结果：让 `arrangement_chord` 的延伸形式进入 display_chord（可选保守策略：同根音时采纳） |
| 3 | **HMM/维特比平滑** | 根音 F1 +5~15% | 0.5-1 天，纯后处理 | 调性上下文纠孤立离调和弦；独立于引擎选择 |
| 4 | **PL+SL 双模型融合** | 根音+性质兼得 | 1 天 | PL 定根音边界，SL 补性质；CPU 推理翻倍 |
| 5 | **段落级投票** | 重复段落一致性 | 1 天 | SongFormer 已给段落结构，同类段落（副歌1/2/3）跨段投票纠错 |
| 6 | **调音偏移校正** | 老录音/非标准 440Hz | 0.5 天 | 识别前估计 tuning offset 补偿 chroma |
| 7 | **人声分离（demucs）** | 人声重的歌治本 | 2-3 天 + ~300MB 模型 + 每首多 1-3 分钟 | 对应已知边界"人声/多轨混音置信度低" |
| 8 | ~~MuQ 质量精炼~~ | — | — | **视 #1 结果可能整条砍掉**：SL 是更便宜的七和弦来源 |

## 三、执行前提（另一台电脑跑评测）

1. `git pull` 拿到本计划与 `eval/eval_ab_engine.py`。
2. 按 `docs/run-eval-on-new-machine.md` 备齐：Python 3.12 + 推理依赖（torch CPU 先装）、模型权重（**确认 SL checkpoint 存在**：`resources/models/acr_model/checkpoints/SL/btc_model_large_voca.pt`，prepare-models.ps1 会下）、SongFormer/MusicFM。
3. test-audio 93 首手动拷贝（版权不入库），放仓库根的 `test-audio/`。
4. 跑之前**关掉 Electron 应用**（SongFormer 吃 ~4.5GB 内存）。

## 四、SL 实测执行（B4 主体）

```powershell
py eval/eval_ab_engine.py --limit 15   # 跑全部有 GT 的歌，预计 30-90 分钟（CPU）
```

- 产出：`eval/ab_results.json`（明细）+ `eval/reports/ab-YYYY-MM-DD.md`（并排对比表）
- 指标：调性准确率 / 根音 F1 / 循环命中（与基线同口径）+ SL 延伸率 + 两引擎耗时对比

**决策树**：

- SL 根音 ≥ PL 且延伸率合理（0.2-0.5）→ 直接切默认引擎为 SL，再做 #2 打通延伸输出；MuQ（#8）砍掉
- SL 根音明显 < PL 但延伸率有价值 → 做 #4 融合（PL 根音 + SL 性质）
- 两者都不理想 → 退回 #3 HMM 平滑优先，SL 留作实验引擎

## 五、纪律

- 每次精度测试 ≥10 首（既定规则）
- 评测期间 CPU 满载，安排在挂机时段
- 评测产出（ab_results.json / reports）不入库，报告结论回填到本文档与 v0.3 计划 B4/B5
