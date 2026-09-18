# 地铁全景 · Metro View（Android 离线版）

Capacitor 包装的 Vite + Leaflet Web 应用，面向 Android 的离线 MVP。模式对齐 [airportview](https://github.com/huming0618/airportview)。

- **包名**：`com.huming.metroview`
- **应用名**：地铁全景
- **调试 APK**：`/workspace/deliverables/metroview-offline-debug.apk`
- **Release**：[`android-offline-v1`](https://github.com/huming0618/metroview/releases/tag/android-offline-v1)

## 离线设计（airports → metros）

| 层级 | 能力 | 实现 |
|------|------|------|
| L1 应用壳 + 地铁索引 | 断网可搜索/选中 | 打包 `public/data/metros.json`（~130+ 系统） |
| L2 线网足迹 | 一屏适配不依赖 Overpass | 每条地铁预置 `bbox`；`fitMetro` **优先本地 bbox**，仅在线时 Overpass 彩色线网 |
| L3 底图瓦片 | **常用城市开箱离线** | 预置 `public/offline-tiles/{z}/{x}/{y}.png`（z12–z15）；Cache API；按钮可联网预取其它城市 |

### 内置离线底图（L3）

成都、上海、北京、广州、深圳、香港、东京、伦敦、巴黎、纽约（城市中心 seed bbox，z12–z15）。完整线网 fit 仍用 `m.bbox`。

对应 id：`cn-chengdu` `cn-shanghai` `cn-beijing` `cn-guangzhou` `cn-shenzhen` `cn-hongkong` `jp-tokyo-metro` `gb-london` `fr-paris` `us-nyc`

瓦片顺序：内置 `offline-tiles/` → Cache API → 网络。首次启动会暖缓存。

```bash
npm run seed-offline-tiles
# 限速；OSM 受限时回退 Carto Positron
```

产物：`public/offline-tiles/` + `manifest.json`。

## 环境

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/workspace/android-sdk
```

`android/local.properties`：`sdk.dir=/workspace/android-sdk`

## 重新构建

```bash
cd /workspace/metroview
npm install
# 可选：npm run seed-offline-tiles
VITE_BASE=./ npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk /workspace/deliverables/metroview-offline-debug.apk
```

或：`npm run build:android` 后再 `cd android && ./gradlew assembleDebug`。

GitHub Pages 仍用默认 `base: /metroview/`；Android 必须 `VITE_BASE=./`。

## 验收

1. 飞行模式搜索「成都」应有结果。
2. 选中成都地铁：本地 bbox 缩放，**无需点缓存**可见市中心底图。
3. 离线横幅：`常用城市已内置离线底图；其他城市可联网缓存`。
4. 其它城市：联网点「缓存此城市离线地图」后再断网可用。

## airports → metros 对照

| airportview | metroview |
|-------------|-----------|
| `airports.json` | `metros.json` |
| IATA CTU/PVG/… | 城市 成都/上海/… |
| Overpass aerodrome | Overpass subway routes |
| 缓存此机场 | 缓存此城市 |
| `com.huming.airportview` | `com.huming.metroview` |

## 许可

© OpenStreetMap；预置瓦片见 `public/offline-tiles/manifest.json`。
