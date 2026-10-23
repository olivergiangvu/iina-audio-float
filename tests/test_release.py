#!/usr/bin/env python3
"""Static smoke tests for a release; runtime IINA/macOS testing is separate."""
from pathlib import Path
from zipfile import ZipFile
import json, subprocess, shutil, sys

ROOT = Path(__file__).resolve().parent.parent
m = json.loads((ROOT / 'Info.json').read_text(encoding='utf-8'))
assert m['name'] == 'Audio Float for IINA'
assert m['identifier'] == 'io.local.iina.audio-float-preview' # upgrade continuity
assert m['version'] == '1.1.0'
assert m['ghRepo'] == 'olivergiangvu/iina-audio-float'
assert isinstance(m['ghVersion'], int) and m['ghVersion'] > 0
assert m['permissions'] == ['video-overlay']
js = (ROOT / 'main.js').read_text(encoding='utf-8')
ui = (ROOT / 'ui' / 'index.html').read_text(encoding='utf-8')
assert "const VERSION = '1.1.0'" in js
assert "event.on('iina.plugin-overlay-loaded'" in js
assert "overlay.onMessage('af-set-track'" in js
assert 'function setTrack(id)' in js
assert 'window.iina.postMessage' in ui
assert 'audio' in ui.lower()
assert 'prefers-color-scheme: dark' in ui
assert 'af-theme-config' in ui
assert 'af-theme-change' in ui
assert "overlay.onMessage('af-theme-change'" in js
assert "prefs.set(appearanceKey,appearance)" in js
assert m['preferenceDefaults']['appearance_v01']=='system'
for f in ('main.js','ui/index.html'):
    assert (ROOT / f).is_file()
if shutil.which('node'):
    subprocess.run(['node','--check',str(ROOT / 'main.js')], check=True)
    subprocess.run(['node',str(ROOT / 'tests' / 'test_hit_test_guard.js')], check=True)
    subprocess.run(['node',str(ROOT / 'tests' / 'test_theme_preference.js')], check=True)
subprocess.run([sys.executable,str(ROOT / 'scripts' / 'build.py')], check=True)
out = ROOT / 'dist' / 'Audio-Float-for-IINA-v1.1.0.iinaplgz'
with ZipFile(out) as z:
    assert z.testzip() is None
    assert {'Info.json','main.js','ui/index.html','README.md','LICENSE'} <= set(z.namelist())
    assert json.loads(z.read('Info.json')) == m
print('PASS — manifest, stable identity, source, archive integrity, syntax (if Node present)')
