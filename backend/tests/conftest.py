import sys
from pathlib import Path

# 让测试可以直接 import backend 模块（不依赖安装）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
