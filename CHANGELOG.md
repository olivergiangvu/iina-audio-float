# Changelog

## 1.1.0 — Stable: System / Light / Dark

- Add Appearance segmented control in the Audio Track popup.
- System mode automatically follows macOS Light/Dark appearance through `prefers-color-scheme`.
- Light mode includes adapted waveform, popover, tracks, selection highlight, settings, and guide colors.
- Manual Dark retains existing native-style translucent dark appearance.
- Store appearance choice in `iina.preferences` (`appearance_v01`), synchronizing the UI after every WebView handshake.
- Preserve v1.0.1 RC native hit-testing safety mitigation, audio switching, and auto-hide behavior.
- Light and Dark modes verified by the user in IINA on macOS; preserves native overlay hit-testing guard from the earlier release candidate.

## 1.0.1-rc.1 — Experimental hit-testing mitigation

- Native `overlay.setClickable(false)` while visually hidden to reduce
  unnecessary `PluginOverlayView.hitTest` execution.
- Keep original audio selection code/bridge and 2.5 second auto-hide.
- Explicitly document click/focus to wake when `mpv.mouse-pos` is unavailable.
- Test by **cold-starting** IINA; do not hot-reload the plugin during playback.

## 1.0.0 — Stable function baseline

- Native-style waveform and audio switching with confirmed mpv audio ID.
- Floating responsive selector and best-effort auto-hide.
