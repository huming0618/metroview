# 地铁全景 · Metro View

Mobile-first web app to search world metro/subway systems and fit the **whole network** onto one phone screen (OSM basemap + colored route overlays from OpenStreetMap).

中文 UI 标题：**地铁全景 · Metro View**。体验对齐 [airportview](https://github.com/huming0618/airportview)。

## Features

- 搜索/浏览全球主要地铁系统（城市 + 系统名，中英）
- 选中后：优先使用内置 `bbox` → `map.fitBounds`；再拉取 Overpass 地铁线网几何并绘制彩色线路
- 移动优先：全屏地图、顶部搜索、底部信息卡（「定位到此线网」「返回全球视图」）
- 深链：`?q=成都` / `?q=Chengdu` / `#Shanghai` 在数据加载后自动选中

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173/metroview/
npm run build        # output → dist/
npm run preview
```

GitHub Pages base path defaults to `/metroview/` (`VITE_BASE` 可覆盖，例如 `VITE_BASE=./ npm run build`)。

## Data

Bundled index: [`public/data/metros.json`](public/data/metros.json)（约 130+ 条，侧重中国 + 全球枢纽）。

字段：`id`, `name`, `nameZh?`, `city`, `cityZh?`, `country`, `countryCode`, `lat`, `lon`, `bbox?` `[s,w,n,e]`, `type?`。

选中时：

1. 有 `bbox` → 立即适配一屏  
2. Overpass 查询 `route=subway` / `light_rail` / `railway=subway`（多端点重试）→ 按 `colour`/`color` 着色 → 再 `fitBounds`  
3. 失败则用城市中心约 ±0.22° 估算范围  

## Deploy

Push to `main` 触发 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)。Pages URL：

https://huming0618.github.io/metroview/

## Limitations (v1)

- Overpass 可能超时/限流；大都市线网几何较重，首次加载可能需数秒
- 部分城市 OSM 线网标签不完整，彩色线路可能缺失，此时仍用 bbox 适配
- 同一城市多个系统（如东京 Metro / 都营）各自独立条目
- **Android / 离线**：可参考 airportview 后续接入 Capacitor + 离线瓦片，见 [docs/android-offline-followup.md](docs/android-offline-followup.md)（v1 未实现）

## License

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
