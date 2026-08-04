"""批量评估：模型加载一次，循环分析 test-audio/ 下所有 mp3，输出 JSON 结果。

用法：先关掉 Electron app（内存不够两个 SongFormer），再跑：
  py D:\Step On Chord\eval\eval_batch.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, r"D:\Step On Chord\backend")

from audio_utils import transcode_media_to_wav
from song_analysis import analyze_song

AUDIO_DIR = Path(r"D:\Step On Chord\test-audio")
OUT = Path(r"D:\Step On Chord\eval\eval_results.json")
HISTORY = Path(r"D:\Step On Chord\eval\tested_history.jsonl")
OUT.parent.mkdir(parents=True, exist_ok=True)

# ---- 轮换选歌：未测优先，其次最久未测；--limit N 限制数量 ----
limit = None
for i, a in enumerate(sys.argv[1:], 1):
    if a == "--limit" and i < len(sys.argv) - 1:
        try:
            limit = int(sys.argv[i + 1])
        except ValueError:
            limit = None

tested_at: dict[str, str] = {}
if HISTORY.exists():
    for line in HISTORY.read_text(encoding="utf-8").splitlines():
        try:
            rec = json.loads(line)
            tested_at[rec["file"]] = rec.get("date", "")
        except Exception:
            continue

all_files = sorted(AUDIO_DIR.glob("*.mp3"))
untested = [f for f in all_files if f.name not in tested_at]
tested = [f for f in all_files if f.name in tested_at]
tested.sort(key=lambda f: tested_at.get(f.name, ""))
files = (untested + tested) if limit else all_files
if limit:
    files = files[:limit]
print(f"total {len(all_files)} files, testing {len(files)} (limit={limit})", flush=True)

results = []
for f in files:
    t0 = time.perf_counter()
    wav = str(AUDIO_DIR / ("_eval_" + f.stem + ".wav"))
    try:
        transcode_media_to_wav(str(f), wav)
        analysis, _raw, _elapsed = analyze_song(wav)
        overall = analysis.get("overall") or {}
        sections = [
            {
                "name": s.get("name"),
                "chords": [c.get("chord") for c in s.get("chords") or []],
            }
            for s in analysis.get("sections") or []
        ]
        results.append(
            {
                "file": f.name,
                "key": overall.get("key"),
                "mode": overall.get("mode"),
                "bpm": overall.get("tempo_bpm"),
                "time_signature": overall.get("time_signature"),
                "confidence": overall.get("confidence"),
                "sections": sections,
                "elapsed_seconds": round(time.perf_counter() - t0, 1),
            }
        )
        print(
            f"DONE {f.name} | key={overall.get('key')} {overall.get('mode')} | "
            f"bpm={overall.get('tempo_bpm')} | {time.perf_counter() - t0:.0f}s",
            flush=True,
        )
        with HISTORY.open("a", encoding="utf-8") as hf:
            hf.write(json.dumps({"file": f.name, "date": time.strftime("%Y-%m-%d")}, ensure_ascii=False) + "\n")
    except Exception as exc:  # noqa: BLE001
        results.append({"file": f.name, "error": str(exc)})
        print(f"FAIL {f.name}: {exc}", flush=True)
    finally:
        Path(wav).unlink(missing_ok=True)

OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print("ALL DONE ->", OUT, flush=True)
