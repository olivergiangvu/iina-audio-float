# Audio Float for IINA

**Stable v1.0.0** · Quick audio-track switching from a native-style floating waveform button in [IINA](https://iina.io/).

Audio Float adds a compact audio selector for videos with multiple language, dubbed, or commentary tracks. It supplements the existing IINA on-screen controller (OSC) without modifying IINA itself.

## Features

- **One-click audio selection** — view embedded audio tracks and switch immediately. The selected track is confirmed by reading the actual audio ID before the UI updates.
- **Waveform icon** — compact translucent button styled to visually complement IINA's native OSC.
- **Best-effort auto-hide** — the button hides after approximately 2.5 seconds of idle time, remains accessible with the selector open, and reappears through available mouse/click/focus signals.
- **Responsive placement** — separate window/fullscreen calibration and adjustments for approximate OSC placement.
- **Local playback control only** — uses IINA's plugin API and mpv; no cloud accounts, network permission, or external media service.

## Compatibility and verification

- **Verified by the project user:** IINA **1.5.0 (Build 180)** on macOS **27**, with real playback, audio switching, waveform icon and auto-hide working.
- Other IINA/macOS versions have **not** been verified by the project user. Please open an issue with the IINA/macOS versions and logs when reporting compatibility problems.
- This is **not exact OSC synchronization**: IINA's plugin API does not expose the OSC's native visible/hidden state or exact frame. If `mpv.mouse-pos` is unavailable, a click or focusing the IINA window may be needed to wake the button. Dragging or moving the OSC may require manual recalibration.

## Installation

### Install from GitHub (recommended after this repository's first published release)

1. In **IINA → Settings → Plugins**, choose the installation option for GitHub plugins (or **Get Plugins…** if shown in your version).
2. Use `https://github.com/olivergiangvu/iina-audio-float`.
3. Enable **Audio Float for IINA**, quit IINA completely (`⌘Q`) and relaunch.

### Local package

1. Download **`Audio-Float-for-IINA-v1.0.0.iinaplgz`** from [GitHub Releases](https://github.com/olivergiangvu/iina-audio-float/releases) once published.
2. In **IINA → Settings → Plugins**, choose **Install Local Package…** and select the file.
3. Quit IINA completely and relaunch.

To upgrade from v0.9.5, replace the existing Audio Float installation. **The plugin identifier remains unchanged** (`io.local.iina.audio-float-preview`) to preserve the existing settings and avoid installing a duplicate. The previous `layout_v04` calibration keys are deliberately retained.

**Note on automatic updates:** `Info.json` includes `ghRepo` and monotonic integer `ghVersion`. IINA's GitHub update checks can work after installation from the published repository; an older local-only package may need one manual install to adopt the GitHub metadata.

## Usage

Open a video with multiple audio tracks, reveal the controls and click the waveform button. Choose the preferred track; the check mark moves only after playback confirms the new audio ID.

Select **Adjust position** within the popup to calibrate the placement for window and fullscreen modes. Auto-hide is approximate, not synchronized to IINA's internal OSC animation.

## Design / stability notes

- IINA's `overlay.loadFile()` **clears previously registered WebView message handlers**. Audio Float registers them **after** `iina.plugin-overlay-loaded`; this fixed the UI-to-player audio switching bug during beta testing.
- The plugin does **not** dynamically mutate native plugin menus or call `menu.forceUpdate()`. An early beta's startup menu updates triggered an IINA crash.
- The application reads tracks from IINA's `core.audio.tracks`, with an mpv fallback, and validates `core.audio.id`/`aid` after selection.
- No native IINA source modification or separate mpv IPC server is required.

## Troubleshooting

For a reproducible issue, open **IINA → Settings → Advanced → Open the log viewer** (the exact label may vary by version), set logging to **Debug**, and filter for `Audio Float 1.0.0`.

If the icon is not shown after upgrading, quit and reopen IINA rather than relying on plugin hot-reload. If the popup shows no audio tracks, verify that the media actually contains more than one audio track. When auto-hide misses a mouse event, click within the video to wake it.

## Building a package from source

```bash
python3 scripts/build.py
```

This produces `dist/Audio-Float-for-IINA-v1.0.0.iinaplgz` from the source files with a deterministic ZIP layout. For local validation, run `python3 tests/test_release.py` and `node --check main.js` (Node.js optional locally).

## Project / contribution

This is an independent third-party plugin and is **not affiliated with the IINA development team**. Please use GitHub issues for bugs and pull requests for improvements. Do not include tokenized media URLs, private playback logs, or personal filesystem paths in public issues.

Released under the [MIT License](LICENSE). Copyright © 2026 Oliver Giang Vu.
