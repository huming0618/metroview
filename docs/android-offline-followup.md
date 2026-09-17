# Android / 离线后续（非 v1）

本仓库 v1 为纯 Web（Vite + Leaflet + OSM 在线瓦片 + Overpass）。

若需要与 [airportview](https://github.com/huming0618/airportview) 类似的 Android 离线体验，可后续：

1. Capacitor 包装现有 `dist/`
2. 为常用城市预置线网 bbox（已有）与可选离线底图瓦片
3. 参考 airportview 的 `tileCache` / `docs/android-offline-build.md`

v1 不要求实现以上能力。
