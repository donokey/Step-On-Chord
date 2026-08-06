"""Step On Chord — Python sidecar 入口（PyInstaller 打包同用本文件）。

- 从 argv[1] 读取监听端口（默认 18923）
- 向 stdout 打印就绪信号 ``CHORDCRAFT_READY port=xxxxx``（Electron 侧据此判定就绪）
- 模型目录约定：开发期 <项目根>/resources/models；打包后 <exe 同级>/models
  （通过 CHORDCRAFT_MODEL_DIR 环境变量传给各算法模块）
"""

import os
import sys

# 模型目录优先级：外部注入（Electron 打包版传 userData/models）> exe 同级默认值（PyInstaller
# --onedir）> 开发期 <项目根>/resources/models。Electron 打包版必须用 userData/models，
# 否则首启下载的权重落在 %APPDATA% 而引擎读 exe 同级目录，分析必然失败。
_configured_model_dir = os.environ.get("CHORDCRAFT_MODEL_DIR")
if _configured_model_dir:
    _model_dir = _configured_model_dir
elif getattr(sys, "frozen", False):
    _model_dir = os.path.join(os.path.dirname(sys.executable), "models")
else:
    _model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "resources", "models")

os.environ["CHORDCRAFT_MODEL_DIR"] = os.path.abspath(_model_dir)

# 模型/运行时资源默认走国内镜像（用户可自行覆盖；打包版必须内置，否则
# transformers/huggingface_hub 会尝试直连 huggingface.co 而失败）
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import uvicorn  # noqa: E402

from chordcraft_api import app  # noqa: E402

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18923
    # 就绪信号必须先打印且 flush，保证 Electron sidecar 管理器立即读到
    print(f"CHORDCRAFT_READY port={port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
