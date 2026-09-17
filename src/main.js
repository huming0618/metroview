import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './style.css';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const FALLBACK_HALF_SPAN = 0.22;
const WORLD_VIEW = { center: [25, 15], zoom: 2 };

const PALETTE = [
  '#e11d48', '#2563eb', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#ea580c', '#db2777', '#4f46e5', '#059669',
];

/** @type {import('leaflet').Map} */
let map;
/** @type {L.MarkerClusterGroup} */
let cluster;
/** @type {L.LayerGroup} */
let routeLayer;
/** @type {Array<object>} */
let metros = [];
/** @type {object|null} */
let selected = null;
/** @type {AbortController|null} */
let overpassAbort = null;
let colorIdx = 0;

const el = {
  input: document.getElementById('search-input'),
  clear: document.getElementById('clear-search'),
  results: document.getElementById('search-results'),
  status: document.getElementById('status'),
  sheet: document.getElementById('sheet'),
  title: document.getElementById('sheet-title'),
  meta: document.getElementById('sheet-meta'),
  codes: document.getElementById('sheet-codes'),
  btnFit: document.getElementById('btn-fit'),
  btnWorld: document.getElementById('btn-world'),
};

function showStatus(text) {
  if (!text) {
    el.status.hidden = true;
    el.status.textContent = '';
    return;
  }
  el.status.hidden = false;
  el.status.textContent = text;
}

function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    maxZoom: 19,
  }).setView(WORLD_VIEW.center, WORLD_VIEW.zoom);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  cluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    disableClusteringAtZoom: 8,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
  });
  map.addLayer(cluster);

  routeLayer = L.layerGroup().addTo(map);
}

function displayName(m) {
  if (m.nameZh && m.nameZh !== m.name) return `${m.nameZh} · ${m.name}`;
  return m.nameZh || m.name;
}

function cityLabel(m) {
  if (m.cityZh && m.cityZh !== m.city) return `${m.cityZh} / ${m.city}`;
  return m.cityZh || m.city || '';
}

function addMarkers() {
  cluster.clearLayers();
  const icon = L.divIcon({
    className: 'metro-marker',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  for (const m of metros) {
    const marker = L.marker([m.lat, m.lon], { icon, title: displayName(m) });
    marker.on('click', () => selectMetro(m, { fit: true }));
    cluster.addLayer(marker);
  }
}

function searchMetros(q) {
  const raw = q.trim();
  if (raw.length < 1) return [];
  const lower = raw.toLowerCase();
  const scored = [];

  for (const m of metros) {
    let score = 0;
    const fields = [
      [m.cityZh, 100],
      [m.nameZh, 95],
      [m.city, 90],
      [m.name, 85],
      [m.country, 40],
      [m.countryCode, 35],
      [m.id, 30],
    ];
    for (const [val, base] of fields) {
      if (!val) continue;
      const v = String(val).toLowerCase();
      if (v === lower) {
        score = Math.max(score, base);
      } else if (v.startsWith(lower) || String(val).startsWith(raw)) {
        score = Math.max(score, base - 10);
      } else if (v.includes(lower) || String(val).includes(raw)) {
        score = Math.max(score, base - 25);
      }
    }
    if (score > 0) scored.push({ m, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name),
  );
  return scored.slice(0, 30).map((s) => s.m);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderResults(list) {
  if (!list.length) {
    el.results.hidden = true;
    el.results.innerHTML = '';
    return;
  }
  el.results.hidden = false;
  el.results.innerHTML = list
    .map((m, i) => {
      const place = [cityLabel(m), m.country].filter(Boolean).join(' · ');
      return `<li role="option" data-idx="${i}" tabindex="-1">
        <div class="result-name">${escapeHtml(displayName(m))}</div>
        <div class="result-sub">${escapeHtml(place)}</div>
      </li>`;
    })
    .join('');
  el.results._items = list;
}

function typeLabel(t) {
  return (
    {
      metro: '地铁 / Metro',
      subway: '地铁 / Subway',
      light_rail: '轻轨 / Light rail',
    }[t] || t || '地铁'
  );
}

function openSheet(m) {
  selected = m;
  el.title.textContent = displayName(m);
  el.meta.textContent = [cityLabel(m), m.country].filter(Boolean).join(' · ');
  el.codes.textContent = typeLabel(m.type);
  el.sheet.hidden = false;
  setTimeout(() => map.invalidateSize(), 50);
}

function fallbackBounds(m) {
  const half = FALLBACK_HALF_SPAN;
  return L.latLngBounds(
    [m.lat - half, m.lon - half],
    [m.lat + half, m.lon + half],
  );
}

/** Prefer baked bbox [south, west, north, east]. */
function localBounds(m) {
  if (Array.isArray(m.bbox) && m.bbox.length === 4) {
    const [s, w, n, e] = m.bbox;
    const b = L.latLngBounds([s, w], [n, e]);
    if (b.isValid()) return b;
  }
  return fallbackBounds(m);
}

function overpassRadiusM(m) {
  if (Array.isArray(m.bbox) && m.bbox.length === 4) {
    const [s, w, n, e] = m.bbox;
    const latSpan = Math.abs(n - s);
    const lonSpan = Math.abs(e - w);
    const approxKm = Math.max(latSpan, lonSpan) * 111 * 0.6;
    return Math.round(Math.min(45000, Math.max(10000, approxKm * 1000)));
  }
  return 25000;
}

function nextPaletteColor() {
  const c = PALETTE[colorIdx % PALETTE.length];
  colorIdx += 1;
  return c;
}

function parseColour(tags) {
  if (!tags) return null;
  const raw = tags.colour || tags.color;
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return s;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
  return null;
}

function wayToLatLngs(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return null;
  return geometry.map((p) => [p.lat, p.lon]);
}

function osmElementsToLines(elements) {
  const lines = [];
  const wayGeom = new Map();

  for (const el of elements) {
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      wayGeom.set(el.id, el.geometry);
    }
  }

  for (const el of elements) {
    if (el.type === 'relation' && Array.isArray(el.members)) {
      const colour = parseColour(el.tags) || nextPaletteColor();
      const name = el.tags?.name || el.tags?.ref || '';
      for (const mem of el.members) {
        if (mem.type !== 'way') continue;
        const geom = mem.geometry || wayGeom.get(mem.ref);
        const latlngs = wayToLatLngs(geom);
        if (latlngs) lines.push({ latlngs, colour, name, source: 'relation' });
      }
    }
  }

  // Standalone subway ways (if few/no relations)
  if (lines.length < 5) {
    for (const el of elements) {
      if (el.type !== 'way') continue;
      const tags = el.tags || {};
      if (tags.railway !== 'subway' && tags.railway !== 'light_rail') continue;
      const latlngs = wayToLatLngs(el.geometry);
      if (!latlngs) continue;
      lines.push({
        latlngs,
        colour: parseColour(tags) || nextPaletteColor(),
        name: tags.name || '',
        source: 'way',
      });
    }
  }

  return lines;
}

function boundsFromLines(lines) {
  if (!lines.length) return null;
  let bounds = null;
  for (const line of lines) {
    const b = L.latLngBounds(line.latlngs);
    bounds = bounds ? bounds.extend(b) : b;
  }
  return bounds && bounds.isValid() ? bounds : null;
}

function drawRoutes(lines) {
  routeLayer.clearLayers();
  colorIdx = 0;
  for (const line of lines) {
    L.polyline(line.latlngs, {
      color: line.colour,
      weight: 3.5,
      opacity: 0.88,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(routeLayer);
  }
}

async function queryOverpass(m, signal) {
  const radius = overpassRadiusM(m);
  const query = `
[out:json][timeout:40];
(
  relation["type"="route"]["route"="subway"](around:${radius},${m.lat},${m.lon});
  relation["type"="route"]["route"="light_rail"](around:${radius},${m.lat},${m.lon});
  way["railway"="subway"](around:${radius},${m.lat},${m.lon});
);
out body;
>;
out geom;
`.trim();

  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.elements || [];
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('Overpass failed');
}

function applyFit(bounds) {
  const padTop =
    72 +
    (parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
    ) || 0);
  const padBottom = el.sheet.hidden ? 24 : 200;
  map.invalidateSize();
  map.fitBounds(bounds, {
    paddingTopLeft: [16, padTop],
    paddingBottomRight: [16, padBottom],
    maxZoom: 13,
    animate: true,
  });
}

/**
 * Fit strategy:
 * 1) baked bbox (immediate one-screen fit)
 * 2) Overpass subway geometry → draw colored routes → refit
 * 3) city-center fallback already covered by localBounds
 */
async function fitMetro(m) {
  if (overpassAbort) overpassAbort.abort();
  overpassAbort = new AbortController();
  const { signal } = overpassAbort;

  routeLayer.clearLayers();
  colorIdx = 0;

  const baked = localBounds(m);
  applyFit(baked);

  showStatus('正在加载 OSM 地铁线网…');
  try {
    const elements = await queryOverpass(m, signal);
    const lines = osmElementsToLines(elements);
    if (lines.length) {
      drawRoutes(lines);
      const geoBounds = boundsFromLines(lines);
      if (geoBounds) {
        // Prefer geometry bounds, but don't zoom out wildly beyond baked bbox
        applyFit(geoBounds);
        showStatus(`已绘制 ${lines.length} 段线路`);
      } else {
        showStatus('已按本地范围适配');
      }
    } else {
      showStatus('未找到线网几何，使用本地范围');
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn('Overpass failed', err);
    showStatus('Overpass 超时/失败，使用本地范围');
  }

  setTimeout(() => showStatus(''), 2500);
}

function selectMetro(m, { fit = true } = {}) {
  openSheet(m);
  el.results.hidden = true;
  el.input.value = displayName(m);
  el.clear.hidden = false;
  if (fit) fitMetro(m);
}

function goWorld() {
  if (overpassAbort) overpassAbort.abort();
  routeLayer.clearLayers();
  selected = null;
  el.sheet.hidden = true;
  showStatus('');
  map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom, { animate: true });
  setTimeout(() => map.invalidateSize(), 50);
}

function wireUi() {
  let debounce;
  el.input.addEventListener('input', () => {
    const q = el.input.value;
    el.clear.hidden = !q;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      renderResults(searchMetros(q));
    }, 120);
  });

  el.input.addEventListener('focus', () => {
    if (el.input.value.trim()) renderResults(searchMetros(el.input.value));
  });

  el.clear.addEventListener('click', () => {
    el.input.value = '';
    el.clear.hidden = true;
    el.results.hidden = true;
    el.input.focus();
  });

  el.results.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-idx]');
    if (!li) return;
    const idx = Number(li.dataset.idx);
    const m = el.results._items?.[idx];
    if (m) selectMetro(m, { fit: true });
  });

  el.btnFit.addEventListener('click', () => {
    if (selected) fitMetro(selected);
  });

  el.btnWorld.addEventListener('click', goWorld);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.results.hidden = true;
    }
  });
}

function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  let q = params.get('q') || '';
  if (!q && location.hash.length > 1) {
    try {
      q = decodeURIComponent(location.hash.slice(1));
    } catch {
      q = location.hash.slice(1);
    }
  }
  q = (q || '').trim();
  if (!q) return false;

  el.input.value = q;
  el.clear.hidden = false;
  const hits = searchMetros(q);
  if (!hits.length) {
    renderResults([]);
    showStatus(`未找到地铁系统：${q}`);
    setTimeout(() => showStatus(''), 2500);
    return false;
  }

  const lower = q.toLowerCase();
  const exact =
    hits.find((m) => m.cityZh === q) ||
    hits.find((m) => m.nameZh === q) ||
    hits.find((m) => (m.city || '').toLowerCase() === lower) ||
    hits.find((m) => (m.name || '').toLowerCase() === lower) ||
    hits[0];

  selectMetro(exact, { fit: true });
  return true;
}

async function loadData() {
  showStatus('加载地铁数据…');
  const res = await fetch(`${import.meta.env.BASE_URL}data/metros.json`);
  if (!res.ok) throw new Error('无法加载 metros.json');
  metros = await res.json();
  showStatus(`已加载 ${metros.length} 个地铁系统`);
  setTimeout(() => showStatus(''), 1500);
}

async function main() {
  initMap();
  wireUi();
  try {
    await loadData();
    addMarkers();
    requestAnimationFrame(() => {
      applyDeepLink();
    });
  } catch (err) {
    console.error(err);
    showStatus('地铁数据加载失败');
  }
}

main();
