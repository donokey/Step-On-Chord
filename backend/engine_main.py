"""Step On Chord — Python sidecar 入口（PyInstaller 打包同用本文件）。

- 从 argv[1] 读取监听端口（默认 18923）
- 向 stdout 打印就绪信号 ``CHORDCRAFT_READY port=xxxxx``（Electron 侧据此判定就绪）
- 模型目录约定：开发期 <项目根>/resources/models；打包后 <exe 同级>/models
  （通过 CHORDCRAFT_MODEL_DIR 环境变量传给各算法模块）
"""

import os
import sys

if getattr(sys, "frozen", False):
    # PyInstaller --onedir：模型权重在 exe 同级 models/ 目录
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
