"""乐谱级真值一一对比：Isophonics/ChoCo JAMS 人工标注 vs 模型输出。

数据源：eval/gt_data/v1.0.0/jams/*.jams（ChoCo v1.0.0，Isophonics 专家标注，
带时间戳的 Harte 格式和弦 + key_mode + 段落）。

对比方式：对每条人工标注和弦事件，按时间重叠找模型在同一时刻的和弦，
逐一配对输出表格，并按重叠时长加权统计根音/性质准确率。

用法：先关 Electron app，然后
  py eval/gt_compare.py            # 首次会跑推理（每首约3-5分钟），结果缓存
  py eval/gt_compare.py --skip-infer   # 只重算对比，用缓存的模型输出
"""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(r"D:\Step On Chord")
sys.path.insert(0, str(ROOT / "backend"))

AUDIO_DIR = ROOT / "test-audio"
JAMS_DIR = ROOT / "eval" / "gt_data" / "v1.0.0" / "jams"
CACHE_DIR = ROOT / "eval" / "gt_data" / "model_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR = ROOT / "eval" / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

# 曲库：音频文件 -> JAMS 标注文件
PAIRS = {
    "The Beatles - Let It Be.mp3": "isophonics_88.jams",
    "The Beatles - Yesterday.mp3": "isophonics_148.jams",
}

NOTE_TO_PC = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4,
    "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9,
    "A#": 10, "Bb": 10, "B": 11,
}
PC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def parse_harte(label: str):
    """Harte 记号 -> (root_pc, quality_family, clean_label)。N/X 返回 None。"""
    label = label.strip()
    if label in ("N", "X", ""):
        return None
    # 去掉括号装饰 F:maj(*3) -> F:maj
    label = re.sub(r"\([^)]*\)", "", label)
    # 分离斜杠低音 A:min/b7 -> A:min + /b7
    bass = ""
    if "/" in label:
        label, bass = label.split("/", 1)
    # 根音 + 性质
    if ":" in label:
        root_str, quality = label.split(":", 1)
    else:
        root_str, quality = label, "maj"
    root_str = root_str.strip()
    if root_str not in NOTE_TO_PC:
        return None
    root_pc = NOTE_TO_PC[root_str]
    q = quality.strip().lower()
    if q in ("", "maj", "major"):
        fam = "maj"
    elif q.startswith("maj7") or q.startswith("major7"):
        fam = "maj7"
    elif q.startswith("min7") or q.startswith("m7"):
        fam = "m7"
    elif q.startswith("min") or q == "m":
        fam = "min"
    elif q.startswith("7") or q.startswith("dom"):
        fam = "7"
    elif q.startswith("dim"):
        fam = "dim"
    elif q.startswith("aug"):
        fam = "aug"
    elif q.startswith("5"):
        fam = "5"
    else:
        fam = "other"
    return root_pc, fam, (root_str, quality, bass)


def load_jams(path: Path):
    d = json.loads(path.read_text(encoding="utf-8"))
    chords = []
    gt_key = None
    for ann in d.get("annotations", []):
        ns = ann.get("namespace")
        if ns == "chord":
            for ev in ann.get("data", []):
                parsed = parse_harte(ev.get("value", ""))
                if parsed is None:
                    continue
                root_pc, fam, _ = parsed
                chords.append({
                    "start": ev["time"],
                    "end": ev["time"] + ev["duration"],
                    "root": root_pc,
                    "fam": fam,
                    "label": ev.get("value", ""),
                })
        elif ns == "key_mode":
            for ev in ann.get("data", []):
                gt_key = ev.get("value")
    chords.sort(key=lambda c: c["start"])
    duration = d.get("file_metadata", {}).get("duration")
    return chords, gt_key, duration


def merge_model_chords(chords: list):
    """相邻同和弦合并，得到 (start, end, label) 列表。"""
    merged = []
    for c in sorted(chords, key=lambda x: x["start_seconds"]):
        label = c.get("raw_chord") or c.get("chord")
        if not label:
            continue
        if merged and merged[-1]["label"] == label and abs(c["start_seconds"] - merged[-1]["end"]) < 0.6:
            merged[-1]["end"] = c["end_seconds"]
        else:
            merged.append({"start": c["start_seconds"], "end": c["end_seconds"], "label": label})
    return merged


def infer_song(audio_path: Path):
    """跑完整分析，返回 (model_chords, detected_key/mode)。结果缓存。"""
    from audio_utils import transcode_media_to_wav
    from song_analysis import analyze_song

    cache = CACHE_DIR / (audio_path.stem + ".json")
    if cache.exists():
        d = json.loads(cache.read_text(encoding="utf-8"))
        return d["chords"], d["key"], d["mode"]

    wav = str(AUDIO_DIR / ("_gt_" + audio_path.stem + ".wav"))
    t0 = time.perf_counter()
    print(f"[infer] {audio_path.name} ...", flush=True)
    transcode_media_to_wav(str(audio_path), wav)
    analysis, _raw, _elapsed = analyze_song(wav)
    Path(wav).unlink(missing_ok=True)

    chords = []
    for section in analysis.get("sections") or []:
        for c in section.get("chords") or []:
            if c.get("time_seconds") is None or c.get("end_seconds") is None:
                continue
            chords.append({
                "start_seconds": c["time_seconds"],
                "end_seconds": c["end_seconds"],
                "raw_chord": c.get("raw_chord") or c.get("chord"),
            })
    overall = analysis.get("overall") or {}
    out = {
        "chords": chords,
        "key": overall.get("key"),
        "mode": overall.get("mode"),
        "elapsed": round(time.perf_counter() - t0, 1),
    }
    cache.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[infer] done in {out['elapsed']}s, {len(chords)} chord events, "
          f"key={out['key']} {out['mode']}", flush=True)
    return chords, out["key"], out["mode"]


def overlap(a_s, a_e, b_s, b_e):
    return max(0.0, min(a_e, b_e) - max(a_s, b_s))


def dtw_align(gt_chords, gt_dur, model_parsed, model_dur, rate=10.0):
    """DTW 对齐 GT 根音序列与模型根音序列（one-hot chroma 帧）。

    返回 (map_fn, frame_acc, n_frames)：
      map_fn(t_gt) -> t_model  把标注时间轴映射到音频时间轴（吸收速度漂移/版本差）
      frame_acc               沿 warping path 的帧级根音命中率（对齐质量）
    """
    import numpy as np
    import librosa

    n_gt = max(int(gt_dur * rate), 1)
    n_md = max(int(model_dur * rate), 1)

    def gt_root_at(t):
        for g in gt_chords:
            if g["start"] <= t < g["end"]:
                return g["root"]
        return None

    def md_root_at(t):
        for mp in model_parsed:
            if mp["start"] <= t < mp["end"]:
                return (mp["parsed"][0] if mp["parsed"] else None)
        return None

    gt_seq = [gt_root_at(i / rate) for i in range(n_gt)]
    md_seq = [md_root_at(i / rate) for i in range(n_md)]

    N_CLASS = 12  # 13th dim = no-chord
    X = np.zeros((13, n_gt))
    for i, r in enumerate(gt_seq):
        X[r if r is not None else N_CLASS, i] = 1.0
    Y = np.zeros((13, n_md))
    for i, r in enumerate(md_seq):
        Y[r if r is not None else N_CLASS, i] = 1.0

    _D, wp = librosa.sequence.dtw(X=X, Y=Y, metric="cosine")
    wp = np.asarray(wp)  # (n, 2): [gt_frame, model_frame]

    match = tot = 0
    for gi, mi in wp:
        gr = gt_seq[gi]
        mr = md_seq[mi]
        if gr is None and mr is None:
            continue  # 两边都无和弦，不计入
        if gr is None or mr is None:
            tot += 1  # 只有一边无和弦，算不匹配
            continue
        tot += 1
        if gr == mr:
            match += 1
    frame_acc = match / tot if tot else 0.0

    # 预聚合：每个 gt 帧对应的模型帧中位数
    gt_to_md = {}
    for gi, mi in wp:
        gt_to_md.setdefault(int(gi), []).append(int(mi))

    def map_fn(t_gt):
        gi = int(round(t_gt * rate))
        gi = max(0, min(gi, n_gt - 1))
        while gi not in gt_to_md and gi < n_gt:
            gi += 1
        if gi not in gt_to_md:
            return t_gt
        mi = int(np.median(gt_to_md[gi]))
        return mi / rate

    return map_fn, frame_acc, tot


def compare_song(audio_name: str, jams_name: str, skip_infer: bool):
    audio_path = AUDIO_DIR / audio_name
    jams_path = JAMS_DIR / jams_name
    gt_chords, gt_key, gt_dur = load_jams(jams_path)

    if skip_infer:
        cache = CACHE_DIR / (audio_path.stem + ".json")
        d = json.loads(cache.read_text(encoding="utf-8"))
        model_chords_raw, model_key, model_mode = d["chords"], d["key"], d["mode"]
    else:
        model_chords_raw, model_key, model_mode = infer_song(audio_path)

    model_chords = merge_model_chords(model_chords_raw)

    # 每个模型和弦解析为 (root_pc, fam)
    model_parsed = []
    for mc in model_chords:
        p = parse_harte(mc["label"])
        model_parsed.append({**mc, "parsed": p})

    # 音频实际时长（模型时间轴），与标注时长对比可暴露版本差异
    import librosa
    model_dur = float(librosa.get_duration(path=str(audio_path)))
    dur_delta = model_dur - (gt_dur or model_dur)

    def model_at(t: float):
        """返回覆盖时刻 t 的模型和弦；无覆盖时取最近的一个。"""
        for mp in model_parsed:
            if mp["start"] <= t < mp["end"]:
                return mp
        best = None
        best_d = None
        for mp in model_parsed:
            d = min(abs(t - mp["start"]), abs(t - mp["end"]))
            if best_d is None or d < best_d:
                best_d = d
                best = mp
        return best

    def weighted_acc(map_fn):
        """中点采样：每条 GT 事件在其中点经 map_fn 映射后取模型和弦，按时值加权。"""
        tot = hit_root = hit_exact = hit_fam = mm_dur = mm_hit = 0.0
        for g in gt_chords:
            mid = (g["start"] + g["end"]) / 2.0
            mp = model_at(map_fn(mid))
            dur = g["end"] - g["start"]
            tot += dur
            if mp is None or mp["parsed"] is None:
                continue
            m_root, m_fam, _ = mp["parsed"]
            if m_root == g["root"]:
                hit_root += dur
            if m_root == g["root"] and m_fam == g["fam"]:
                hit_exact += dur
            if m_fam == g["fam"]:
                hit_fam += dur
            if g["fam"] in ("maj", "min"):
                mm_dur += dur
                if m_root == g["root"] and m_fam == g["fam"]:
                    mm_hit += dur
        z = tot if tot > 0 else 1.0
        mz = mm_dur if mm_dur > 0 else 1.0
        return {
            "root": hit_root / z, "exact": hit_exact / z,
            "fam": hit_fam / z, "majmin": mm_hit / mz, "tot": tot,
        }

    # 基线：不做对齐（恒等映射）
    acc_at_0 = weighted_acc(lambda t: t)
    # DTW 对齐：吸收速度漂移 / 版本差
    map_fn, align_quality, _nframes = dtw_align(
        gt_chords, gt_dur, model_parsed, model_dur)
    final = weighted_acc(map_fn)

    # 逐事件表（中点经 DTW 映射）
    rows = []
    for g in gt_chords:
        mid = (g["start"] + g["end"]) / 2.0
        best = model_at(map_fn(mid))
        if best is None or best["parsed"] is None:
            rows.append((g, None, "-"))
        else:
            rows.append((g, best, "Y" if best["parsed"][0] == g["root"] else "N"))

    result = {
        "audio": audio_name,
        "jams": jams_name,
        "gt_key": gt_key,
        "model_key": f"{model_key} {model_mode or ''}".strip(),
        "key_match": (gt_key or "").split()[0].split(":")[0] == (model_key or ""),
        "n_gt": len(gt_chords),
        "n_model": len(model_chords),
        "gt_dur": round(gt_dur or 0, 1),
        "model_dur": round(model_dur, 1),
        "dur_delta": round(dur_delta, 1),
        "align_quality": f"{align_quality:.3f}",
        "version_flag": "可能版本不符" if (abs(dur_delta) > 8 or align_quality < 0.5) else "",
        "root_acc_at0": f"{acc_at_0['root']:.3f}",
        "root_acc": f"{final['root']:.3f}",
        "exact_acc": f"{final['exact']:.3f}",
        "fam_acc": f"{final['fam']:.3f}",
        "majmin_acc": f"{final['majmin']:.3f}",
        "rows": rows,
    }
    return result


def fmt_time(t):
    return f"{int(t // 60):02d}:{t % 60:04.1f}"


def write_report(results):
    date = time.strftime("%Y-%m-%d")
    path = REPORT_DIR / f"gt-beatles-{date}.md"
    lines = [f"# 乐谱级真值对比 {date}",
             "",
             "数据源：Isophonics 专家人工标注（via ChoCo v1.0.0 JAMS，带时间戳）。",
             "对齐方式：DTW 动态时间规整把标注时间轴映射到音频时间轴（吸收速度漂移/版本差），"
             "再对每条 GT 和弦在中点采样模型输出，按时值加权。`根音@0` 为不做对齐的基线。",
             "`对齐质量` 是 DTW 帧级根音命中率——过低说明音频与标注很可能不是同一版本。",
             "`maj/min准确率` 仅统计 GT 为 maj/min 的段落（当前模型词表上限）。",
             ""]
    lines.append("| 曲目 | GT调 | 模型调 | 调性 | GT数 | 时长差(音-标) | 对齐质量 | 根音@0 | 根音准确率 | maj/min | 完全匹配 | 备注 |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in results:
        lines.append(
            f"| {r['audio']} | {r['gt_key']} | {r['model_key']} | "
            f"{'✓' if r['key_match'] else '✗'} | {r['n_gt']} | {r['dur_delta']:+.1f}s | "
            f"{r['align_quality']} | {r['root_acc_at0']} | {r['root_acc']} | "
            f"{r['majmin_acc']} | {r['exact_acc']} | {r['version_flag']} |"
        )
    for r in results:
        lines.append("")
        lines.append(f"## {r['audio']} 逐和弦对照")
        lines.append("")
        lines.append("| 时间 | GT标注 | 模型输出 | 根音✓ |")
        lines.append("|---|---|---|---|")
        for g, best, mark in r["rows"]:
            gt_lbl = f"{PC_NAMES[g['root']]}:{g['fam']} ({g['label']})"
            if best is None:
                m_lbl, m_time = "(无覆盖)", ""
            else:
                m_lbl = best["label"]
                m_time = fmt_time(best["start"])
            lines.append(
                f"| {fmt_time(g['start'])}–{fmt_time(g['end'])} | {gt_lbl} | "
                f"{m_lbl} @{m_time} | {mark} |"
            )
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main():
    skip_infer = "--skip-infer" in sys.argv
    if not skip_infer:
        # 推理前确认没有 Electron app 在抢内存
        import subprocess
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq electron.exe"],
            capture_output=True, text=True).stdout
        if "electron.exe" in out and "Step On Chord" in out:
            print("警告：检测到 Step On Chord Electron 进程，建议先关闭（SongFormer 需要内存）")
    results = []
    for audio, jams in PAIRS.items():
        r = compare_song(audio, jams, skip_infer)
        print(f"[compare] {audio}: root={r['root_acc']} (noalign {r['root_acc_at0']}) "
              f"majmin={r['majmin_acc']} align={r['align_quality']} "
              f"dur_delta={r['dur_delta']:+.1f}s key={'OK' if r['key_match'] else 'NO'} "
              f"{r['version_flag']}", flush=True)
        results.append(r)
    path = write_report(results)
    print("REPORT ->", path)


if __name__ == "__main__":
    main()
