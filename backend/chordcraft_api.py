"""Step On Chord — 精简版 FastAPI sidecar（纯本地算法，无 LLM）。

端点：
- GET  /api/health              健康检查 + 运行环境自检（acr_model / SongFormer / voicing_db）
- GET  /api/audio               本地音频文件流（渲染进程波形/播放用，wavesurfer fetch）
- POST /api/analyze             完整分析（file_path → 纯 Python 转码 → BTC + SongFormer → 合并结果）
- GET  /api/voicing-candidates  吉他和弦指法查询（迁移自 AI-ChordCraft app.py）

Voicing 数据库文件不在 reference 仓库内（源自 AI-Musician-Skills/guitar-arrange-skill），
默认读取 resources/models/voicing/chords_db_voicings.json，可用 CHORDCRAFT_VOICING_DB 覆盖；
数据库缺失时端点返回空候选且 database_available=false。
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from audio_utils import (
    SUPPORTED_AUDIO_SUFFIXES,
    UnsupportedAudioFormatError,
    transcode_media_to_wav,
)
from song_analysis import analyze_song, render_chord_sheet

app = FastAPI(title="Step On Chord Engine", version="0.1.0")

# 渲染进程从 http://localhost:5173（dev）或 file://（打包后）访问本地 sidecar，放开 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 纯 Python 解码链路（libsndfile）仅支持 wav/mp3/flac/ogg；
# TODO：m4a/aac/视频待以后通过可选 ffmpeg（签名方案）或 pyav 补齐。

_AUDIO_MEDIA_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
}

# BTC / SongFormer 都是重内存推理，桌面端一次只跑一个分析任务
_analyze_lock = threading.Lock()

_BACKEND_DIR = Path(__file__).resolve().parent


def _model_dir() -> Path:
    configured = os.environ.get("CHORDCRAFT_MODEL_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return _BACKEND_DIR.parent / "resources" / "models"


def _voicing_db_path() -> Path:
    configured = os.environ.get("CHORDCRAFT_VOICING_DB")
    if configured:
        return Path(configured).expanduser().resolve()
    return _model_dir() / "voicing" / "chords_db_voicings.json"


def _voicing_annotations_path() -> Path:
    configured = os.environ.get("CHORDCRAFT_VOICING_ANNOTATIONS")
    if configured:
        return Path(configured).expanduser().resolve()
    return _model_dir() / "voicing" / "commonness_annotations.json"


class AnalyzeRequest(BaseModel):
    file_path: str
    max_sections: int = 12
    chord_engine: str = "plkd-btc"


@app.get("/api/health")
def health() -> dict:
    model_dir = _model_dir()
    return {
        "status": "ok",
        "service": "chordcraft-engine",
        "version": "0.1.0",
        "model_dir": str(model_dir),
        "checks": {
            "acr_model": (model_dir / "acr_model").exists(),
            "songformer": (model_dir / "SongFormer").exists(),
            "voicing_db": _voicing_db_path().exists(),
        },
    }


@app.get("/api/audio")
def serve_audio(path: str) -> FileResponse:
    """本地音频文件流（wavesurfer 波形/播放 fetch 用）。

    渲染进程不直接读本地文件，统一经 sidecar HTTP 拉流；
    仅限白名单音频后缀，防止任意文件读取。
    """
    source = Path(path)
    if not source.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{source}")
    suffix = source.suffix.lower()
    if suffix not in SUPPORTED_AUDIO_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"暂不支持该格式：{suffix}（当前支持 wav / mp3 / flac / ogg）",
        )
    return FileResponse(source, media_type=_AUDIO_MEDIA_TYPES[suffix], filename=source.name)


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> JSONResponse:
    started_at = time.perf_counter()
    source = Path(request.file_path)
    if not source.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{source}")
    if source.suffix.lower() not in SUPPORTED_AUDIO_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"暂不支持该格式：{source.suffix}（当前支持 wav / mp3 / flac / ogg）",
        )

    if not _analyze_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="已有分析任务进行中，请等待完成后再试。")
    try:
        with tempfile.TemporaryDirectory(prefix="chordcraft-") as temp_dir:
            prepared_path = str(Path(temp_dir) / "prepared.wav")
            try:
                transcode_media_to_wav(str(source), prepared_path)
            except UnsupportedAudioFormatError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc

            try:
                analysis, raw_text, elapsed_seconds = analyze_song(
                    prepared_path,
                    max_sections=request.max_sections,
                    chord_engine=request.chord_engine,
                )
            except Exception as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        _analyze_lock.release()

    markdown = render_chord_sheet(analysis, source_name=source.name)
    return JSONResponse(
        {
            "file": {"name": source.name, "path": str(source)},
            "analysis": analysis,
            "markdown": markdown,
            "raw": raw_text,
            "elapsed_seconds": elapsed_seconds,
            "total_seconds": time.perf_counter() - started_at,
        }
    )


# ---- Voicing 查询（迁移自 AI-ChordCraft app.py，标注写入端点在 Phase 4 再加） ----


def _normalize_voicing_symbol(symbol: Any) -> str:
    text = str(symbol or "").strip().replace("♯", "#").replace("♭", "b")
    if not text:
        return ""
    return text[0].upper() + text[1:]


def _frets_to_shape(frets: Any) -> str:
    if not isinstance(frets, list):
        return ""
    return "".join("x" if not isinstance(fret, int) or fret < 0 else str(fret) for fret in frets[:6])


def _annotation_key(symbol: str, frets: list[int] | tuple[int, ...]) -> str:
    return f"{_normalize_voicing_symbol(symbol)}|{','.join(str(fret) for fret in frets[:6])}"


def _parse_progression(text: str) -> list[str]:
    parts = re.split(r"[\s,|>]+|(?:\s*-\s*)", text.strip())
    chords = []
    seen = set()
    for part in parts:
        chord = _normalize_voicing_symbol(part)
        if not chord or chord in seen:
            continue
        seen.add(chord)
        chords.append(chord)
    return chords


@lru_cache(maxsize=1)
def _load_voicing_database() -> dict[str, list[dict[str, Any]]]:
    path = _voicing_db_path()
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    voicings = payload.get("voicings", []) if isinstance(payload, dict) else payload
    index: dict[str, list[dict[str, Any]]] = {}
    for item in voicings:
        if not isinstance(item, dict):
            continue
        symbol = _normalize_voicing_symbol(item.get("symbol"))
        frets = item.get("frets")
        if not symbol or not isinstance(frets, list) or len(frets) != 6:
            continue
        normalized = {
            "symbol": symbol,
            "shape": item.get("shape") or _frets_to_shape(frets),
            "frets": frets,
            "fingers": item.get("fingers") or [],
            "position": item.get("position") or 1,
            "barres": item.get("barres") or [],
            "difficulty": item.get("difficulty"),
            "tags": item.get("tags") or [],
            "source_id": item.get("source_id"),
            "review_status": item.get("review_status"),
        }
        index.setdefault(symbol, []).append(normalized)
    return index


def _load_voicing_annotations() -> dict[str, Any]:
    path = _voicing_annotations_path()
    if not path.exists():
        return {"version": "0.1.0", "annotations": {}}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"version": "0.1.0", "annotations": {}}
    payload.setdefault("version", "0.1.0")
    payload.setdefault("annotations", {})
    return payload


def _candidate_sort_key(item: dict[str, Any], annotation: dict[str, Any] | None) -> tuple[float, float, float, float]:
    tags = set(item.get("tags") or [])
    commonness = float((annotation or {}).get("commonness") or 0)
    approved = 1.0 if (annotation or {}).get("status") == "preferred" else 0.0
    open_bonus = 1.0 if "open" in tags else 0.0
    common_tag = 1.0 if "common" in tags or "beginner" in tags else 0.0
    difficulty = float(item.get("difficulty") or 5)
    return (approved, commonness, open_bonus + common_tag, -difficulty)


@app.get("/api/voicing-candidates")
def voicing_candidates(progression: str = "C Am F G", limit: int = 24) -> JSONResponse:
    chords = _parse_progression(progression)
    voicing_index = _load_voicing_database()
    annotation_payload = _load_voicing_annotations()
    annotations = annotation_payload.get("annotations") or {}
    limit = max(1, min(int(limit or 24), 80))
    result: dict[str, list[dict[str, Any]]] = {}
    for chord in chords:
        candidates = []
        for item in voicing_index.get(chord, []):
            key = _annotation_key(chord, item["frets"])
            annotation = annotations.get(key)
            candidates.append({**item, "annotation_key": key, "annotation": annotation})
        candidates.sort(key=lambda item: _candidate_sort_key(item, item.get("annotation")), reverse=True)
        result[chord] = candidates[:limit]
    return JSONResponse(
        {
            "progression": progression,
            "chords": chords,
            "candidate_limit": limit,
            "candidates": result,
            "annotation_count": len(annotations),
            "database_available": bool(voicing_index),
        }
    )
