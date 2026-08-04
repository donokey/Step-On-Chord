"""歌曲分析编排（Step On Chord 桌面版，纯本地算法，无 LLM）。

从 AI-ChordCraft 的 src/song_analysis.py 精简：
- 删除所有 LLM 调用（overall 听感生成、歌词 ASR、逐段 LLM 和声分析、hybrid 边界检测）
- 曲式分割固定 SongFormer local 模式；段落命名使用 SongFormer label 映射（英文标准名）
- 保留：BTC 和弦识别 → 后处理 → 元数据估计 → 段落边界对齐 → 和弦分配到段落 → chord sheet 渲染
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

from audio_utils import probe_audio_duration
from chord_recognition import (
    ChordRecognitionError,
    assign_chords_to_sections,
    estimate_song_metadata,
    format_timestamp,
    parse_timestamp,
    parse_timestamp_float,
    postprocess_chord_events,
    recognize_chords,
    refine_chord_event_qualities,
    snap_sections_to_chord_boundaries,
)
from structure_recognition import recognize_structure_with_songformer_local, sections_to_outline_json

DEFAULT_WORKFLOW_MAX_SECTIONS = 12
DEFAULT_CHORD_ENGINE = "plkd-btc"
DEFAULT_SECTION_BOUNDARY_SNAP_SECONDS = 1.0

# structure_recognition._songformer_label_to_section_name 输出的标准段落名，
# 用于把 "Chorus 2"、"verse" 这类写法归一化为标准名（桌面版不再做中文化别名）。
_SECTION_NAME_CANONICAL = {
    "intro": "Intro",
    "verse": "Verse",
    "pre-chorus": "Pre-Chorus",
    "pre chorus": "Pre-Chorus",
    "prechorus": "Pre-Chorus",
    "chorus": "Chorus",
    "bridge": "Bridge",
    "interlude": "Interlude",
    "solo": "Solo",
    "outro": "Outro",
    "other": "Other",
    "full song": "Full Song",
}


def _base_section_name(value: Any) -> str:
    text = str(value or "Other").strip()
    if not text:
        return "Other"
    normalized = re.sub(r"\s+", " ", text).strip()
    normalized = re.sub(r"\s*(?:\d+|[一二三四五六七八九十]+)\s*$", "", normalized).strip()
    canonical = _SECTION_NAME_CANONICAL.get(normalized.lower())
    return canonical if canonical else normalized


def _number_section_names(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, int] = {}
    for section in sections:
        base_name = _base_section_name(section.get("name"))
        section["section_type"] = base_name
        totals[base_name] = totals.get(base_name, 0) + 1

    counts: dict[str, int] = {}
    for section in sections:
        base_name = section.get("section_type") or _base_section_name(section.get("name"))
        counts[base_name] = counts.get(base_name, 0) + 1
        section["name"] = f"{base_name} {counts[base_name]}" if totals.get(base_name, 0) > 1 else base_name
    return sections


def _normalize_timestamp(value: Any) -> str | None:
    return format_timestamp(parse_timestamp(value))


def _coerce_sections(value: Any, max_sections: int = DEFAULT_WORKFLOW_MAX_SECTIONS) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    sections: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        base_name = _base_section_name(item.get("name"))
        start_seconds = parse_timestamp_float(item.get("start"))
        end_seconds = parse_timestamp_float(item.get("end"))
        section = {
            "name": base_name,
            "section_type": base_name,
            "start": format_timestamp(start_seconds) if start_seconds is not None else _normalize_timestamp(item.get("start")),
            "end": format_timestamp(end_seconds) if end_seconds is not None else _normalize_timestamp(item.get("end")),
            "start_seconds": start_seconds,
            "end_seconds": end_seconds,
            "chords": item.get("chords") or [],
        }
        sections.append(section)

    sections.sort(
        key=lambda section: (
            section.get("start_seconds")
            if isinstance(section.get("start_seconds"), (int, float))
            else parse_timestamp(section.get("start")) or 0
        )
    )
    for section in sections:
        section["source_sections"] = [
            {
                "name": section.get("name"),
                "start": section.get("start"),
                "end": section.get("end"),
                "start_seconds": section.get("start_seconds"),
                "end_seconds": section.get("end_seconds"),
            }
        ]
    return _number_section_names(sections[:max_sections])


def _section_start_seconds(section: dict[str, Any]) -> float | None:
    value = section.get("start_seconds")
    if isinstance(value, (int, float)):
        return float(value)
    return parse_timestamp_float(section.get("start"))


def _section_end_seconds(section: dict[str, Any]) -> float | None:
    value = section.get("end_seconds")
    if isinstance(value, (int, float)):
        return float(value)
    return parse_timestamp_float(section.get("end"))


def _normalize_section_times(sections: list[dict[str, Any]], duration_seconds: int | None) -> list[dict[str, Any]]:
    if not sections:
        return sections

    normalized = [dict(section) for section in sections]
    if _section_start_seconds(normalized[0]) is None:
        normalized[0]["start"] = "00:00"
        normalized[0]["start_seconds"] = 0.0

    starts = [_section_start_seconds(section) for section in normalized]
    for index, section in enumerate(normalized):
        start = starts[index]
        end = _section_end_seconds(section)
        next_start = starts[index + 1] if index + 1 < len(starts) else None

        if start is None:
            previous_end = _section_end_seconds(normalized[index - 1]) if index > 0 else 0.0
            start = previous_end if previous_end is not None else 0
            section["start"] = format_timestamp(start)
            section["start_seconds"] = float(start)
            starts[index] = start

        if end is None and next_start is not None and next_start > start:
            section["end"] = format_timestamp(next_start)
            section["end_seconds"] = float(next_start)
        elif end is None and duration_seconds is not None and duration_seconds > start:
            section["end"] = format_timestamp(duration_seconds)
            section["end_seconds"] = float(duration_seconds)
        elif end is not None and end <= start:
            fallback_end = next_start if next_start is not None and next_start > start else duration_seconds
            if fallback_end is not None and fallback_end > start:
                section["end"] = format_timestamp(fallback_end)
                section["end_seconds"] = float(fallback_end)

    return normalized


def _is_degenerate_structure(sections: list[dict[str, Any]], duration_seconds: int | float | None) -> bool:
    if not sections:
        return True
    if not isinstance(duration_seconds, (int, float)) or duration_seconds < 60:
        return False
    if len(sections) <= 1:
        return True
    if len(sections) > 2:
        return False

    first = sections[0]
    first_type = str(first.get("section_type") or _base_section_name(first.get("name"))).strip()
    start = _section_start_seconds(first)
    end = _section_end_seconds(first)
    if start is None or end is None:
        return False
    first_duration_ratio = max(0.0, end - start) / max(float(duration_seconds), 1.0)
    return first_type in {"Intro", "Full Song"} and first_duration_ratio >= 0.65


def _merge_chord_lists(left: list[Any], right: list[Any]) -> list[Any]:
    merged = [item for item in left if isinstance(item, dict)]
    for item in right:
        if isinstance(item, dict):
            merged.append(item)

    def sort_key(item: dict[str, Any]) -> tuple[int, int]:
        seconds = parse_timestamp(item.get("time"))
        return (1, 10**9) if seconds is None else (0, seconds)

    merged.sort(key=sort_key)
    return merged


def _group_display_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: list[dict[str, Any]] = []
    for section in sections:
        section_type = section.get("section_type") or _base_section_name(section.get("name"))
        child = dict(section)
        child["section_type"] = section_type
        child.pop("child_sections", None)

        current = grouped[-1] if grouped else None
        if current and current.get("section_type") == section_type:
            current["end"] = child.get("end") or current.get("end")
            current["chords"] = _merge_chord_lists(current.get("chords") or [], child.get("chords") or [])
            current["child_sections"].append(child)
            continue

        grouped.append(
            {
                "name": section_type,
                "section_type": section_type,
                "start": child.get("start"),
                "end": child.get("end"),
                "chords": list(child.get("chords") or []),
                "child_sections": [child],
            }
        )

    return _number_section_names(grouped)


def _derive_global_progressions(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, ...]] = set()
    progressions: list[dict[str, Any]] = []
    for section in sections:
        chords = []
        for item in section.get("chords") or []:
            if isinstance(item, dict) and item.get("chord"):
                chord = str(item["chord"]).strip()
                if chord and (not chords or chords[-1] != chord):
                    chords.append(chord)
        if not chords:
            likely = section.get("likely_chords") or []
            chords = [str(chord).strip() for chord in likely if str(chord).strip()]
        if not chords:
            continue
        progression = tuple(chords[:8])
        if progression in seen:
            continue
        seen.add(progression)
        progressions.append(
            {
                "label": str(section.get("name") or "段落"),
                "progression": list(progression),
                "where": f"{section.get('start') or '?'} - {section.get('end') or '?'}",
            }
        )
        if len(progressions) >= 6:
            break
    return progressions


def _build_practice_tips(analysis: dict[str, Any]) -> list[str]:
    overall = analysis.get("overall") or {}
    tips = []
    if overall.get("tempo_bpm"):
        tips.append(f"先用 {overall['tempo_bpm']} BPM 的 70%-80% 慢速练习，再回到原速。")
    if overall.get("capo_suggestion"):
        tips.append(f"按 {overall['capo_suggestion']} 试一版开放和弦指法，比较是否更接近原曲音色。")
    tips.append("先循环练主歌/副歌的核心走向，再把前奏、桥段和尾奏接进完整结构。")
    tips.append("对标注 ? 的和弦单独回放确认低音走向和三音色彩。")
    return tips


def analyze_song_workflow(
    audio_path: str,
    max_sections: int = DEFAULT_WORKFLOW_MAX_SECTIONS,
    chord_engine: str = DEFAULT_CHORD_ENGINE,
) -> tuple[dict[str, Any], str, float]:
    """纯本地算法流程：SongFormer 曲式分割 → BTC 和弦识别 → 合并分配（输入需为 mono WAV）。"""
    started_at = time.perf_counter()
    resolved_chord_engine = (chord_engine or DEFAULT_CHORD_ENGINE).strip().lower()
    if resolved_chord_engine in {"llm", "hybrid"}:
        raise ValueError("桌面版已移除 LLM / Hybrid 和弦引擎，请使用 plkd-btc 系列本地引擎。")

    duration_seconds = probe_audio_duration(audio_path)

    # ---- 1. SongFormer 曲式分割（local 模式） ----
    songformer_sections, structure_recognition = recognize_structure_with_songformer_local(
        audio_path,
        duration_seconds=duration_seconds,
        max_sections=max(max_sections, 64),
    )
    sections = _normalize_section_times(
        _coerce_sections(songformer_sections, max_sections=max(max_sections, len(songformer_sections))),
        duration_seconds=duration_seconds,
    )
    structure_warning = None
    if _is_degenerate_structure(sections, duration_seconds):
        structure_warning = "SongFormer 结构划分结果较粗，已保留 SongFormer 原始结果。"

    raw_steps: dict[str, Any] = {
        "workflow": [
            "songformer_structure",
            "automatic_chord_recognition",
            "map_chords_to_sections",
            "group_sections",
        ],
        "chord_engine": resolved_chord_engine,
        "structure_engine": "songformer-local",
        "songformer_structure": sections_to_outline_json(songformer_sections),
        "structure_recognition": structure_recognition,
        "structure_recognition_warning": structure_warning,
        "chord_recognition": None,
        "automatic_metadata": None,
        "section_boundary_alignment": None,
    }

    # ---- 2. BTC 和弦识别 → 后处理 → 元数据 → 边界对齐 → 分配到段落 ----
    chord_recognition_warning = None
    automatic_metadata: dict[str, Any] = {}
    detailed_sections: list[dict[str, Any]]
    try:
        raw_chord_events = recognize_chords(audio_path, engine=resolved_chord_engine)
        chord_events = postprocess_chord_events(raw_chord_events, key=None)
        raw_steps["chord_recognition"] = {
            "engine": resolved_chord_engine,
            "postprocessing": {
                "enabled": True,
                "key": None,
                "min_duration_seconds": 1.2,
                "low_confidence_threshold": 0.18,
            },
            "raw_events": raw_chord_events,
            "events": chord_events,
        }
        automatic_metadata = estimate_song_metadata(audio_path, chord_events)
        raw_steps["automatic_metadata"] = automatic_metadata

        # ---- 2.5 七和弦精炼（实验性，默认关闭）----
        # 校准结论：流行混音中旋律音污染 chroma，模板升级会把 BTC 正确的三和弦
        # 错误升级为 maj7/add9（晴天事故）；爵士曲目上也有误升级。默认输出 BTC
        # 原始三和弦，七和弦需求由手动校正功能承担。设 CHORDCRAFT_REFINE_QUALITIES=1 可重新开启。
        refine_enabled = os.environ.get("CHORDCRAFT_REFINE_QUALITIES", "").strip() == "1"
        quality_refinement: dict[str, Any] = {"enabled": refine_enabled, "stats": None, "error": None}
        if refine_enabled:
            try:
                refined_events, refine_stats = refine_chord_event_qualities(
                    audio_path,
                    chord_events,
                    key=automatic_metadata.get("key"),
                )
                chord_events = refined_events
                quality_refinement["stats"] = refine_stats
            except Exception as exc:  # noqa: BLE001 - 精炼失败不应中断主流程
                quality_refinement["error"] = str(exc)
        raw_steps["quality_refinement"] = quality_refinement

        aligned_sections, boundary_adjustments = snap_sections_to_chord_boundaries(
            sections,
            chord_events,
            max_snap_seconds=DEFAULT_SECTION_BOUNDARY_SNAP_SECONDS,
        )
        raw_steps["section_boundary_alignment"] = {
            "enabled": True,
            "max_snap_seconds": DEFAULT_SECTION_BOUNDARY_SNAP_SECONDS,
            "adjustments": boundary_adjustments,
        }
        detailed_sections = assign_chords_to_sections(chord_events, aligned_sections)
    except ChordRecognitionError as exc:
        chord_recognition_warning = f"自动和弦识别引擎 {resolved_chord_engine} 不可用或执行失败：{exc}"
        raw_steps["chord_recognition"] = {"engine": resolved_chord_engine, "error": str(exc)}
        detailed_sections = [dict(section, chords=[]) for section in sections]

    if not automatic_metadata:
        automatic_metadata = estimate_song_metadata(audio_path, [])
        raw_steps["automatic_metadata"] = automatic_metadata
    metadata_warning = None
    if not any(automatic_metadata.get(key) for key in ["key", "mode", "tempo_bpm", "time_signature"]):
        metadata_warning = "自动基础信息估计没有得到可用的调性、速度或拍号结果。"

    overall = {
        "key": automatic_metadata.get("key"),
        "mode": automatic_metadata.get("mode"),
        "tempo_bpm": automatic_metadata.get("tempo_bpm"),
        "time_signature": automatic_metadata.get("time_signature"),
        "capo_suggestion": None,
        "feel": None,
        "confidence": automatic_metadata.get("confidence") or "low",
    }

    display_sections = _group_display_sections(detailed_sections)

    analysis: dict[str, Any] = {
        "title_guess": None,
        "song_description": "",
        "overall": overall,
        "lyrics_segments": [],
        "sections": display_sections,
        "raw_sections": detailed_sections,
        "global_chord_progressions": _derive_global_progressions(display_sections),
        "practice_tips": _build_practice_tips({"overall": overall, "sections": display_sections}),
        "uncertain_points": [],
        "workflow": {
            "mode": "local",
            "steps": [
                {
                    "name": "songformer_structure",
                    "status": "partial" if structure_warning else "done",
                    "engine": "songformer-local",
                },
                {
                    "name": "automatic_chord_recognition",
                    "status": "partial" if chord_recognition_warning else "done",
                    "engine": resolved_chord_engine,
                },
                {"name": "map_chords_to_sections", "status": "done", "sections": len(detailed_sections)},
                {"name": "group_sections", "status": "done", "sections": len(display_sections)},
            ],
            "notes": [],
        },
    }
    for warning in (chord_recognition_warning, structure_warning, metadata_warning):
        if warning:
            analysis["uncertain_points"].append(warning)

    raw_text = json.dumps(raw_steps, ensure_ascii=False, indent=2)
    return analysis, raw_text, time.perf_counter() - started_at


def analyze_song(
    audio_path: str,
    max_sections: int = DEFAULT_WORKFLOW_MAX_SECTIONS,
    chord_engine: str = DEFAULT_CHORD_ENGINE,
) -> tuple[dict[str, Any], str, float]:
    """分析入口：返回 (analysis, raw_text, elapsed_seconds)。"""
    if not Path(audio_path).exists():
        raise FileNotFoundError(f"Audio file does not exist: {audio_path}")
    return analyze_song_workflow(audio_path, max_sections=max_sections, chord_engine=chord_engine)


# ---- Chord Sheet 渲染（/api/analyze 响应的 markdown 字段，Phase 4 导出复用） ----


def _value(value: Any, fallback: str = "-") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def _format_chord_line(chords: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    current: list[str] = []
    for index, item in enumerate(chords, start=1):
        time_label = _value(item.get("time"), "")
        if item.get("end"):
            time_label = f"{time_label}-{_value(item.get('end'), '')}"
        chord = _value(item.get("display_chord") or item.get("chord"))

        cell = f"{time_label} {chord}".strip()
        current.append(cell)

        if index % 4 == 0:
            lines.append(" | ".join(current))
            current = []
    if current:
        lines.append(" | ".join(current))
    return lines


def _lyrics_for_section(section: dict[str, Any], lyrics_segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    section_start = parse_timestamp_float(section.get("start_seconds")) or parse_timestamp_float(section.get("start"))
    section_end = parse_timestamp_float(section.get("end_seconds")) or parse_timestamp_float(section.get("end"))
    if section_start is None or section_end is None or section_end <= section_start:
        return []

    matched = []
    for segment in lyrics_segments:
        if not isinstance(segment, dict):
            continue
        lyric_start = parse_timestamp_float(segment.get("start_seconds")) or parse_timestamp_float(segment.get("start"))
        lyric_end = parse_timestamp_float(segment.get("end_seconds")) or parse_timestamp_float(segment.get("end"))
        if lyric_start is None:
            continue
        if lyric_end is None or lyric_end <= lyric_start:
            lyric_end = lyric_start + 1
        if lyric_end > section_start and lyric_start < section_end:
            matched.append(segment)
    matched.sort(key=lambda item: parse_timestamp_float(item.get("start_seconds")) or parse_timestamp_float(item.get("start")) or 0)
    return matched


def render_chord_sheet(analysis: dict[str, Any], source_name: str | None = None) -> str:
    overall = analysis.get("overall") or {}
    title = _value(analysis.get("title_guess"), Path(source_name).stem if source_name else "未命名歌曲")

    lines = [
        f"# {title}",
        "",
        "## 歌曲概览",
        "",
        f"- 音频来源：{_value(source_name)}",
        f"- 调性：{_value(overall.get('key'))}",
        f"- 调式：{_value(overall.get('mode'))}",
        f"- 速度：{_value(overall.get('tempo_bpm'))} BPM",
        f"- 拍号：{_value(overall.get('time_signature'))}",
        f"- 置信度：{_value(overall.get('confidence'))}",
        "",
    ]

    song_description = str(analysis.get("song_description") or "").strip()
    if song_description:
        lines.extend(["## 整体听感", "", song_description, ""])

    lines.extend(["", "## 和弦谱", ""])

    sections = analysis.get("sections") or []
    lyrics_segments = analysis.get("lyrics_segments") or []
    if not sections:
        lines.append("_没有返回段落分析。_")
    for section in sections:
        name = _value(section.get("name"), "段落")
        start = _value(section.get("start"), "?")
        end = _value(section.get("end"), "?")
        lines.extend(
            [
                f"### {name} [{start} - {end}]",
                "",
            ]
        )
        child_sections = section.get("child_sections") if isinstance(section.get("child_sections"), list) else []
        if not child_sections:
            child_sections = [section]

        for child in child_sections:
            child_name = _value(child.get("name"), "小段落")
            child_start = _value(child.get("start"), "?")
            child_end = _value(child.get("end"), "?")
            lines.extend([f"#### {child_name} [{child_start} - {child_end}]", ""])
            chord_lines = _format_chord_line(child.get("chords") or [])
            if chord_lines:
                lines.extend(chord_lines)
            else:
                lines.append("_这个小段落没有返回和弦。_")
            child_lyrics = _lyrics_for_section(child, lyrics_segments if isinstance(lyrics_segments, list) else [])
            if child_lyrics:
                lines.append("")
                for segment in child_lyrics:
                    lines.append(
                        f"[{_value(segment.get('start'), '?')} - {_value(segment.get('end'), '?')}] "
                        f"{_value(segment.get('text'))}"
                    )
            lines.append("")
        lines.append("")

    lines.extend(["## 练习建议", ""])
    tips = analysis.get("practice_tips") or []
    lines.extend(f"- {tip}" for tip in tips) if tips else lines.append("- -")

    uncertain_points = analysis.get("uncertain_points") or []
    if uncertain_points:
        lines.extend(["", "## 不确定点", ""])
        lines.extend(f"- {point}" for point in uncertain_points)

    return "\n".join(lines).strip() + "\n"
