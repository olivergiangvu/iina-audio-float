# Changelog

## [1.0.0] — 2026-10-11

**First stable release, promoted from v0.9.5 after successful real-world validation.**

- Native-style waveform audio selector, responsive layout calibration, and best-effort 2.5-second auto-hide.
- Audio track selection with active-track confirmation, using IINA's core audio API and mpv fallback.
- WebView-to-plugin message handlers registered after overlay load, preserving reliable track switching.
- Removed reliance on dynamic native menu updates associated with an early-beta startup crash.
- Added GitHub update metadata and release packaging. The plugin identifier and previous layout settings remain unchanged.

**No runtime feature changes relative to the verified v0.9.5** apart from the displayed version. The native OSC state is not observable through the plugin API, so visual synchronization remains best-effort.
