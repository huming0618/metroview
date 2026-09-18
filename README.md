# 地铁全景 · Metro View

Mobile-first web + **Android 离线** app：搜索世界地铁系统，一屏适配线网（OSM 底图 + Overpass 彩色线路）。

体验与离线方案对齐 [airportview](https://github.com/huming0618/airportview)。

## Features

- 搜索/浏览全球主要地铁系统（城市 + 系统名，中英）
- 选中后：优先内置 `bbox` → `fitBounds`；在线再拉 Overpass 线网并着色
- 移动优先：全屏地图、顶部搜索、底部信息卡
- 深链：`?q=成都` / `?q=Chengdu` / `#Shanghai`
- **Android 离线**：常用城市内置 z12–z15 底图；其它城市可联网缓存。见 [docs/android-offline-build.md](docs/android-offline-build.md)

## Quick start（Web）

```bash
npm install
npm run dev          # http://localhost:5173/metroview/
npm run build        # GitHub Pages base /metroview/
npm run preview
```

Android 离线包请用相对路径：

```bash
VITE_BASE=./ npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Android 离线 APK

- 包名：`com.huming.metroview`
- 本地：`/workspace/deliverables/metroview-offline-debug.apk`
- Release：[`android-offline-v1`](https://github.com/huming0618/metroview/releases/tag/android-offline-v1)

内置离线底图：成都、上海、北京、广州、深圳、香港、东京、伦敦、巴黎、纽约。

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/workspace/android-sdk
npm install
# 可选：npm run seed-offline-tiles
VITE_BASE=./ npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk /workspace/deliverables/metroview-offline-debug.apk
```

## Data

[`public/data/metros.json`](public/data/metros.json)（约 130+ 条）。

## Deploy（Pages）

https://huming0618.github.io/metroview/

## License

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
