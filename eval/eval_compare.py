"""比对评估：eval_results.json × ground_truth.json → 报告 + 趋势。

用法：py D:\Step On Chord\eval\eval_compare.py
产出：
  eval/reports/YYYY-MM-DD.md   当日明细
  eval/accuracy_trend.jsonl    每日汇总追加行
"""
import json
import time
from pathlib import Path

EVAL = Path(r"D:\Step On Chord\eval")
RESULTS = EVAL / "eval_results.json"
GT = EVAL / "ground_truth.json"
REPORTS = EVAL / "reports"
TREND = EVAL / "accuracy_trend.jsonl"
REPORTS.mkdir(parents=True, exist_ok=True)


def root_of(chord: str) -> str:
    text = (chord or "").strip().replace("♯", "#").replace("♭", "b")
    if not text:
        return ""
    if len(text) > 1 and text[1] in "#b":
        return text[:2]
    return text[:1]


def dedupe_roots(chords: list[str]) -> list[str]:
    out = []
    for c in chords:
        r = root_of(c)
        if r and (not out or out[-1] != r):
            out.append(r)
    return out


def f1(detected: list[str], gt: list[str]) -> float | None:
    if not gt:
        return None
    d, g = detected[:8], gt
    dset, gset = set(d), set(g)
    if not dset:
        return 0.0
    prec = len(dset & gset) / len(dset)
    rec = len(dset & gset) / len(gset)
    return round(2 * prec * rec / (prec + rec), 3) if prec + rec > 0 else 0.0


def rotation_match(detected: list[str], gt: list[str]) -> bool:
    if not gt or len(detected) < len(gt):
        return False
    d = detected[: len(gt) * 2]
    n = len(gt)
    return any(d[i : i + n] == gt for i in range(max(1, len(d) - n + 1)))


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    gt_map = json.loads(GT.read_text(encoding="utf-8"))
    today = time.strftime("%Y-%m-%d")

    lines = [f"# 准确度报告 {today}", "", "| 曲目 | 检测调 | 正确调 | 调性✓ | 主歌根音(检测) | 主歌根音(谱) | 根音F1 | 循环✓ |", "|---|---|---|---|---|---|---|---|"]
    key_hits = key_total = 0
    f1_vals = []
    loop_hits = loop_total = 0

    for r in results:
        name = r.get("file", "?")
        if "error" in r:
            lines.append(f"| {name} | ERROR | | | | | | |")
            continue
        gt = gt_map.get(name) or {}
        det_key = f"{r.get('key') or '?'} {r.get('mode') or ''}".strip()
        gt_key = f"{gt.get('key')} {gt.get('mode') or ''}".strip() if gt.get("key") else "待补"

        verse = next((s for s in r.get("sections", []) if "Verse" in str(s.get("name"))), None)
        if verse is None:
            verse = max(r.get("sections", []) or [{"chords": []}], key=lambda s: len(s.get("chords", [])))
        det_roots = dedupe_roots(verse.get("chords", []))

        key_ok = ""
        if gt.get("key"):
            key_total += 1
            ok = det_key.split()[:2] == gt_key.split()[:2]
            key_hits += 1 if ok else 0
            key_ok = "✓" if ok else "✗"

        gt_roots = gt.get("verse_roots") or []
        score = f1(det_roots, gt_roots)
        if score is not None:
            f1_vals.append(score)
        loop = ""
        if gt_roots:
            loop_total += 1
            ok = rotation_match(det_roots, gt_roots)
            loop_hits += 1 if ok else 0
            loop = "✓" if ok else "✗"

        lines.append(
            f"| {name} | {det_key} | {gt_key} | {key_ok} | {' '.join(det_roots[:8])} | {' '.join(gt_roots)} | {score if score is not None else '-'} | {loop} |"
        )

    avg_f1 = round(sum(f1_vals) / len(f1_vals), 3) if f1_vals else None
    summary = {
        "date": today,
        "songs": len(results),
        "key_accuracy": round(key_hits / key_total, 3) if key_total else None,
        "avg_root_f1": avg_f1,
        "loop_accuracy": round(loop_hits / loop_total, 3) if loop_total else None,
    }
    lines += [
        "",
        f"**汇总**：调性准确率 {summary['key_accuracy']}（{key_hits}/{key_total}），根音平均F1 {avg_f1}，主歌循环命中率 {summary['loop_accuracy']}（{loop_hits}/{loop_total}）",
    ]
    (REPORTS / f"{today}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    with TREND.open("a", encoding="utf-8") as tf:
        tf.write(json.dumps(summary, ensure_ascii=False) + "\n")
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
