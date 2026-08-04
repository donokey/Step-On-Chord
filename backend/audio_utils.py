"""音频工具：纯 Python 解码、转码、切片、时长探测。

解码链路：librosa.load（soundfile/libsndfile 后端）→ numpy → soundfile.write。
不再依赖 ffmpeg/ffprobe（公司安全软件会拦截未签名二进制，见项目决策记录）。

支持格式：.wav / .mp3 / .flac / .ogg（libsndfile ≥ 1.2 原生支持）。
TODO：m4a / aac / 视频音频轨暂不支持，后续可通过可选 ffmpeg（代码签名方案）
或 pyav/audioread 扩展补齐；届时在此文件内新增解码分支即可，接口保持不变。
"""

from __future__ import annotations

import math
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

# BTC / SongFormer 管线的统一输入格式
TARGET_SAMPLE_RATE = 44100

# 切片输出的采样率（与原 ffmpeg 切片链路保持一致）
SLICE_SAMPLE_RATE = 16000

SUPPORTED_AUDIO_SUFFIXES = {".wav", ".mp3", ".flac", ".ogg"}


class UnsupportedAudioFormatError(RuntimeError):
    """格式不在白名单内（libsndfile 无法解码）。"""


def _ensure_supported(audio_path: str) -> Path:
    path = Path(audio_path)
    if path.suffix.lower() not in SUPPORTED_AUDIO_SUFFIXES:
        raise UnsupportedAudioFormatError(
            f"暂不支持该格式：{path.suffix or path.name}（当前支持 wav / mp3 / flac / ogg）"
        )
    return path


def transcode_media_to_wav(
    input_path: str,
    output_path: str,
    sample_rate: int = TARGET_SAMPLE_RATE,
) -> None:
    """任意受支持音频 → mono WAV（BTC / SongFormer 管线的统一输入格式）。"""
    _ensure_supported(input_path)
    try:
        audio, _ = librosa.load(input_path, sr=sample_rate, mono=True)
    except Exception as exc:
        raise RuntimeError(f"音频解码失败：{exc}") from exc
    try:
        sf.write(output_path, audio, sample_rate, subtype="PCM_16")
    except Exception as exc:
        raise RuntimeError(f"WAV 写回失败：{exc}") from exc


def slice_audio(
    audio_path: str,
    output_path: str,
    start_seconds: int | float,
    end_seconds: int | float,
) -> None:
    """切取 [start_seconds, end_seconds) 片段，输出 mono 16000Hz WAV。"""
    _ensure_supported(audio_path)
    start = max(0.0, float(start_seconds))
    end = float(end_seconds)
    if end <= start:
        raise ValueError(f"切片区间无效：[{start}, {end})")
    try:
        audio, sr = librosa.load(audio_path, sr=SLICE_SAMPLE_RATE, mono=True)
    except Exception as exc:
        raise RuntimeError(f"音频解码失败：{exc}") from exc
    start_frame = int(start * sr)
    end_frame = min(int(math.ceil(end * sr)), audio.shape[0])
    segment = audio[start_frame:end_frame] if start_frame < audio.shape[0] else np.zeros(0, dtype=audio.dtype)
    try:
        sf.write(output_path, segment, sr, subtype="PCM_16")
    except Exception as exc:
        raise RuntimeError(f"切片写回失败：{exc}") from exc


def probe_audio_duration(audio_path: str) -> int | None:
    """探测音频时长（秒，取整）；失败返回 None。"""
    try:
        _ensure_supported(audio_path)
    except UnsupportedAudioFormatError:
        return None
    try:
        return max(1, int(sf.info(audio_path).duration))
    except Exception:
        pass
    try:
        return max(1, int(librosa.get_duration(filename=audio_path)))
    except Exception:
        return None
