# Audio Float for IINA — v1.1.0 Stable

A floating **waveform audio-track selector** for [IINA](https://iina.io) with audio track metadata, explicit selection confirmation, window/fullscreen positioning, approximate OSC auto-hide, and **System / Light / Dark appearance**.

## What is new in v1.1.0

- **System** (default): follows macOS appearance via `prefers-color-scheme`; reacts without restarting IINA.
- **Light**: translucent light popup and wave button, dark track text, blue selection checkmark.
- **Dark**: dark popup and button matching IINA's dark OSC style.
- Choose appearance under **Audio Tracks → Appearance → System | Light | Dark**.
- Preference persists across restarts using `iina.preferences` key `appearance_v01`.
- Carries forward a **native hit-testing mitigation**: disables native overlay clickability while the button is invisible.

## Install

1. Download `Audio-Float-for-IINA-v1.1.0.iinaplgz` from [GitHub Releases](https://github.com/olivergiangvu/iina-audio-float/releases).
2. Open **IINA → Settings → Plugins → Install Local Package…** and select the file.
3. **Quit IINA completely (`Cmd + Q`), then reopen**. Avoid in-session hot-reload during playback, especially when migrating from v1.0.0.
4. Play a video with at least two audio tracks; click the waveform and choose a track. Check the mark updates after the audio ID is confirmed.

Existing plugin identifier `io.local.iina.audio-float-preview` is intentionally unchanged so upgrades retain the plugin's saved settings.

## Operation and limitations

- The floating audio button has separate adjustable positions for windowed and fullscreen modes; **Adjust position** in its popover.
- Auto-hide after ~2.5 seconds is best effort and **cannot exactly mirror IINA's native OSC visibility** (not exposed through IINA Plugin API).
- On IINA installations where `mpv.mouse-pos` is unavailable, a hidden overlay cannot receive hover events with native hit-testing disabled. **Click once on the video or refocus IINA to wake the button**, then click the waveform to open the selector. The wake click is not intercepted.
- Track changes use the normal IINA / mpv player integration and are confirmed before the tick is changed.
- Dynamic native plugin-menu mutation stays disabled to avoid historical initialization/reentrancy crashes.

## Crash mitigation, not a native IINA fix

A macOS 27.0.1 / IINA 1.5.0 crash after *hot-reloading* v1.0.0 showed `PluginOverlayView.hitTest(_:)` executing a nested main-thread `RunLoop` and terminating with a null-address SIGSEGV. A similar crash has been reported upstream with a different plugin: [IINA issue #6414](https://github.com/iina/iina/issues/6414).

v1.1.0 minimizes unnecessary native hit-testing by setting `overlay.setClickable(false)` when the audio button is hidden. It **does not patch IINA's Swift code**, and cannot guarantee prevention of a crash while an overlay is visible. For testing and normal upgrades, cold-start IINA after installation.

## Verification and development

```bash
python3 tests/test_release.py
node tests/test_hit_test_guard.js
node tests/test_theme_preference.js
```

The tests cover package validity, JavaScript syntax, hit-testing state transitions, theme preference messages and switching logic. Browser appearance smoke testing requires Playwright/Chromium (`tests/test_theme_browser.py`). The user verified Light and Dark UI on a Mac with IINA 1.5.0 and macOS 27; test success does not establish long-run crash-free operation.

MIT License. Independent community plugin; not affiliated with the IINA team.
