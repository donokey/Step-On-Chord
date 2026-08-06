# -*- mode: python ; coding: utf-8 -*-
"""Step On Chord — Python sidecar PyInstaller 打包 spec（onedir 模式）。

构建：  python -m PyInstaller backend/build.spec
产物：  dist/chordcraft-engine/chordcraft-engine.exe（由 scripts/build-backend.ps1
        整体移动到 resources/python-backend/，与 electron/sidecar.ts 的生产路径约定一致）

约定：
- torch 环境必须先装 CPU 版（download.pytorch.org/whl/cpu），本 spec 不再拉 CUDA
- 模型权重不打包：运行时目录 <exe 同级>/models（engine_main.py frozen 分支），
  Electron 侧以 CHORDCRAFT_MODEL_DIR 覆盖为用户目录下的 models
- SongFormer 运行时代码（app.py/src）随模型一起由首启下载/引导流程放置，
  运行时通过 importlib 从磁盘加载，这里只需把它依赖的 pip 包全部冻结
"""

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# 这些包的数据文件（模板/配置/查找表）缺失会导致 import 即报错，整包收集；
# 注意必须在 Analysis() 构造时传入 datas 由其归一化，PyInstaller 6.x 不允许直接追加到 a.datas
extra_datas = []
for pkg in ('gradio', 'transformers', 'huggingface_hub', 'librosa', 'matplotlib', 'x_clip', 'jams'):
    try:
        extra_datas += collect_data_files(pkg)
    except Exception:
        pass

# 以下包运行时依赖磁盘上的原始 .py 文件（PYZ 归档内不可见）：
# - msaf：glob 扫描 algorithms/ 子目录（`for file in files` + `del file`）
# - x_transformers / ema_pytorch / muq：torch.jit.script 编译需要 inspect 源码
from pathlib import Path as _Path
import site as _site
for _pkg_name in ("msaf", "x_transformers", "ema_pytorch", "muq"):
    for _sp in _site.getsitepackages():
        _pkg_dir = _Path(_sp) / _pkg_name
        if _pkg_dir.is_dir():
            extra_datas.append((str(_pkg_dir), _pkg_name))
            break

extra_hiddenimports = []
# msaf / omegaconf 等子模块靠动态 import，全量收集
for pkg in ('msaf', 'omegaconf', 'ema_pytorch'):
    try:
        extra_hiddenimports += collect_submodules(pkg)
    except Exception:
        pass

a = Analysis(
    ['engine_main.py'],
    pathex=['.'],
    binaries=[],
    datas=extra_datas,
    hiddenimports=[
        # ---- FastAPI / uvicorn（uvicorn 用字符串动态加载协议实现）----
        'fastapi',
        'pydantic',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # ---- 音频 / 数值 ----
        'numpy',
        'scipy',
        'scipy.signal',
        'scipy.sparse.csgraph',
        'soundfile',
        'audioread',
        'librosa',
        'resampy',
        'soxr',
        'samplerate',
        'numba',
        'llvmlite',
        'mir_eval',
        'yaml',
        'jsonschema',
        # ---- pkg_resources 运行时依赖（setuptools vendored 别名在冻结环境不可靠，
        #      需先 pip install jaraco.text jaraco.functools more_itertools 装独立包）----
        'jaraco',
        'jaraco.text',
        'jaraco.functools',
        'more_itertools',
        'packaging',
        'platformdirs',
        # ---- torch（CPU 版）----
        'torch',
        'torch.nn.functional',
        # ---- SongFormer 运行时依赖（app.py 运行时动态加载，PyInstaller 静态分析看不到）----
        'gradio',
        'omegaconf',
        'ema_pytorch',
        'muq',
        'safetensors',
        'safetensors.torch',
        'transformers',
        'huggingface_hub',
        'x_transformers',
        'einops',
        'matplotlib',
        'matplotlib.pyplot',
        'msaf',
    ] + extra_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'IPython',
        'jupyter',
        'notebook',
        'pytest',
        'setuptools',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='chordcraft-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,  # 无控制台窗口；stdout 就绪信号仍通过管道传给 Electron
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='chordcraft-engine',
)
