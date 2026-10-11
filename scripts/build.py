#!/usr/bin/env python3
"""Build a reproducible IINA .iinaplgz release from the repository root."""
from pathlib import Path
import json
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'Info.json').read_text(encoding='utf-8'))
version = manifest['version']
name = f'Audio-Float-for-IINA-v{version}.iinaplgz'
out = ROOT / 'dist' / name
out.parent.mkdir(exist_ok=True)
paths = ['Info.json', 'main.js', 'ui/index.html', 'README.md', 'LICENSE']
with ZipFile(out, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
    for rel in paths:
        content = (ROOT / rel).read_bytes()
        info = ZipInfo(rel, (2026, 10, 11, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, content, compress_type=ZIP_DEFLATED, compresslevel=9)
print(out)
