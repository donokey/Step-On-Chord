"""BTC 引擎 A/B 对比：PL（三和弦）vs SL（大词表，原生七和弦）。

用法（先关掉 Electron，SongFormer 吃内存）：
  py eval/eval_ab_engine.py              # 全部有 GT 的歌
  py eval/eval_ab_engine.py --limit 10   # 只跑前 10 首（满足"≥10 首"规则）

产出：
  eval/ab_results.json              明细（每首 × 每引擎）
  eval/reports/ab-YYYY-MM-DD.md     并排对比表

指标口径与 eval_compare.py 一致（Verse 段落根音 F1 / 调性准确率 / 循环命中），
另加 extended_rate（延伸和弦占比，读 arrangement_chord/raw_chord——注意现行管线在
_parse_lab_events 里把 chord/display_chord 简化成了三和弦，延伸形式只在 arrangement_chord 里）。
路径全部走仓库相对位置，任意机器 clone 后可直接运行（需先备好模型与 test-audio）。
"""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "eval"))

from audio_utils import transcode_media_to_wav  # noqa: E402
from song_analysis import analyze_song  # noqa: E402
from eval_compare import dedupe_roots, f1, rotation_match  # noqa: E402

AUDIO_DIR = ROOT / "test-audio"
GT_PATH = ROOT / "eval" / "ground_truth.json"
OUT = ROOT / "eval" / "ab_results.json"
REPORTS = ROOT / "eval" / "reports"
REPORTS.mkdir(parents=True, exist_ok=True)

# plkd-btc 的 auto 变体在 PL 存在时恒用 PL（三和弦）；btc-sl 显式走 SL 大词表
ENGINES = {"pl": "plkd-btc", "sl": "btc-sl"}

ROOT_RE = re.compile(r"^[A-G][#b]?")


def is_extended(symbol: str) -> bool:
    """去掉根音后，性质不是大三/小三即视为延伸和弦（兼容 'C:maj7' 与 'Cmaj7' 两种写法）。"""
    body = ROOT_RE.sub("", (symbol or "").strip()).lstrip(":").lower()
    return body not in ("", "m", "maj", "min", "major", "minor")


def _event_symbol(event: object, *fields: str) -> str:
    if not isinstance(event, dict):
        return str(event)
    for field in fields:
        value = event.get(field)
        if value:
            return str(value)
    return ""


def verse_roots_from(analysis: dict) -> list[str]:
    """与 eval_compare 同口径：取 Verse 段（无则取最长段）的去重根音序列。"""
    sections = analysis.get("sections") or []
    verse = next((s for s in sections if "Verse" in str(s.get("name"))), None)
    if verse is None:
        verse = max(sections or [{"chords": []}], key=lambda s: len(s.get("chords") or []))
    chords = [_event_symbol(c, "display_chord", "chord") for c in verse.get("chords") or []]
    return dedupe_roots(chords)


def all_chord_symbols(analysis: dict) -> list[str]:
    """全曲和弦符号，优先取保留延伸性质的 arrangement_chord（SL 的七和弦在这里）。"""
    out = []
    for s in analysis.get("sections") or []:
        for c in s.get("chords") or []:
            symbol = _event_symbol(c, "arrangement_chord", "raw_chord", "chord")
            if symbol:
                out.append(symbol)
    return out


def run_one(wav: str, engine: str) -> dict:
    t0 = time.perf_counter()
    analysis, _raw, _elapsed = analyze_song(wav, chord_engine=engine)
    overall = analysis.get("overall") or {}
    symbols = all_chord_symbols(analysis)
    return {
        "key": overall.get("key"),
        "mode": overall.get("mode"),
        "bpm": overall.get("tempo_bpm"),
        "roots": verse_roots_from(analysis),
        "chord_count": len(symbols),
        "extended_rate": round(sum(1 for c in symbols if is_extended(c)) / len(symbols), 3) if symbols else 0.0,
        "elapsed_seconds": round(time.perf_counter() - t0, 1),
    }


def main() -> None:
    limit = None
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a == "--limit" and i + 1 < len(argv):
            limit = int(argv[i + 1])

    gt_map = json.loads(GT_PATH.read_text(encoding="utf-8"))
    # 只选：test-audio 里存在 且 GT 有 key 或 verse_roots 的歌
    candidates = []
    for name, gt in sorted(gt_map.items()):
        if not (gt.get("key") or gt.get("verse_roots")):
            continue
        if (AUDIO_DIR / name).exists():
            candidates.append(name)
    if limit:
        candidates = candidates[:limit]
    print(f"eligible {len(candidates)} songs: {', '.join(candidates)}", flush=True)
    if not candidates:
        print("没有可评测的歌（test-audio 缺音频或 GT 无标注）", flush=True)
        return

    results = []
    for name in candidates:
        src = AUDIO_DIR / name
        wav = AUDIO_DIR / ("_ab_" + src.stem + ".wav")
        record = {"file": name, "engines": {}}
        try:
            transcode_media_to_wav(str(src), str(wav))
            for eng_key, eng in ENGINES.items():
                print(f"[{name}] engine={eng_key} ...", flush=True)
                try:
                    record["engines"][eng_key] = run_one(str(wav), eng)
                except Exception as exc:
                    record["engines"][eng_key] = {"error": str(exc)}
        except Exception as exc:
            record["error"] = str(exc)
        finally:
            wav.unlink(missing_ok=True)
        results.append(record)
        OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---- 报告 ----
    today = time.strftime("%Y-%m-%d")
    lines = [
        f"# 引擎 A/B 对比 {today}",
        "",
        "| 曲目 | 正确调 | PL调✓ | SL调✓ | PL根音F1 | SL根音F1 | PL循环✓ | SL循环✓ | SL延伸率 | PL耗时s | SL耗时s |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    agg = {k: {"key_hit": 0, "key_total": 0, "f1": [], "loop_hit": 0, "loop_total": 0, "time": 0.0} for k in ENGINES}
    sl_ext = []

    for r in results:
        name = r["file"]
        gt = gt_map.get(name) or {}
        gt_key = f"{gt.get('key')} {gt.get('mode') or ''}".strip() if gt.get("key") else ""
        gt_roots = gt.get("verse_roots") or []
        cells = {k: {"key": "", "f1": "-", "loop": "", "time": "-"} for k in ENGINES}
        for eng_key in ENGINES:
            e = r["engines"].get(eng_key) or {}
            if "error" in e:
                cells[eng_key] = {"key": "ERR", "f1": "ERR", "loop": "ERR", "time": "-"}
                continue
            det_key = f"{e.get('key') or '?'} {e.get('mode') or ''}".strip()
            if gt_key:
                agg[eng_key]["key_total"] += 1
                ok = det_key.split()[:2] == gt_key.split()[:2]
                agg[eng_key]["key_hit"] += 1 if ok else 0
                cells[eng_key]["key"] = "✓" if ok else "✗"
            score = f1(e.get("roots") or [], gt_roots)
            if score is not None:
                agg[eng_key]["f1"].append(score)
                cells[eng_key]["f1"] = str(score)
            if gt_roots:
                agg[eng_key]["loop_total"] += 1
                ok = rotation_match(e.get("roots") or [], gt_roots)
                agg[eng_key]["loop_hit"] += 1 if ok else 0
                cells[eng_key]["loop"] = "✓" if ok else "✗"
            cells[eng_key]["time"] = str(e.get("elapsed_seconds", "-"))
            agg[eng_key]["time"] += float(e.get("elapsed_seconds") or 0)
        ext = (r["engines"].get("sl") or {}).get("extended_rate")
        if ext is not None:
            sl_ext.append(ext)
        lines.append(
            f"| {name} | {gt_key or '待补'} | {cells['pl']['key']} | {cells['sl']['key']} | {cells['pl']['f1']} | {cells['sl']['f1']} | {cells['pl']['loop']} | {cells['sl']['loop']} | {ext if ext is not None else '-'} | {cells['pl']['time']} | {cells['sl']['time']} |"
        )

    def acc(hit, total):
        return round(hit / total, 3) if total else None

    def avg(vals):
        return round(sum(vals) / len(vals), 3) if vals else None

    summary = {
        "date": today,
        "songs": len(results),
        "pl": {"key_accuracy": acc(agg["pl"]["key_hit"], agg["pl"]["key_total"]), "avg_root_f1": avg(agg["pl"]["f1"]), "loop_accuracy": acc(agg["pl"]["loop_hit"], agg["pl"]["loop_total"]), "total_seconds": round(agg["pl"]["time"], 1)},
        "sl": {"key_accuracy": acc(agg["sl"]["key_hit"], agg["sl"]["key_total"]), "avg_root_f1": avg(agg["sl"]["f1"]), "loop_accuracy": acc(agg["sl"]["loop_hit"], agg["sl"]["loop_total"]), "avg_extended_rate": avg(sl_ext), "total_seconds": round(agg["sl"]["time"], 1)},
    }
    lines += [
        "",
        f"**PL 汇总**：调性 {summary['pl']['key_accuracy']}，根音F1 {summary['pl']['avg_root_f1']}，循环 {summary['pl']['loop_accuracy']}，总耗时 {summary['pl']['total_seconds']}s",
        f"**SL 汇总**：调性 {summary['sl']['key_accuracy']}，根音F1 {summary['sl']['avg_root_f1']}，循环 {summary['sl']['loop_accuracy']}，延伸率 {summary['sl']['avg_extended_rate']}，总耗时 {summary['sl']['total_seconds']}s",
    ]
    (REPORTS / f"ab-{today}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
