/**
 * Tile load order:
 *  1) Bundled offline-tiles/{z}/{x}/{y}.png (BASE_URL)
 *  2) Cache API (runtime OSM prefetch)
 *  3) Network (if online)
 */

const CACHE_NAME = 'metroview-osm-tiles-v1';
const TILE_URL_TEMPLATE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SUBDOMAINS = ['a', 'b', 'c'];

function appBase() {
  try {
    const b = import.meta.env.BASE_URL || './';
    return b.endsWith('/') ? b : `${b}/`;
  } catch {
    return './';
  }
}

/** Bundled asset URL for a z/x/y tile (relative to Vite base). */
export function bundledTileUrl(z, x, y) {
  return `${appBase()}offline-tiles/${z}/${x}/${y}.png`;
}

export function tileUrl(z, x, y) {
  const s = SUBDOMAINS[(x + y) % SUBDOMAINS.length];
  return TILE_URL_TEMPLATE.replace('{s}', s).replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
}

async function openCache() {
  if (!('caches' in globalThis)) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function objectUrlFromBlob(blob) {
  return URL.createObjectURL(blob);
}

/** Try loading a bundled tile; returns blob or null. */
async function tryBundled(z, x, y) {
  const url = bundledTileUrl(z, x, y);
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size < 50) return null;
    return { blob, bundledUrl: url };
  } catch {
    return null;
  }
}

async function matchCacheAnySubdomain(cache, url) {
  const hit = await cache.match(url);
  if (hit) return hit;
  for (const s of SUBDOMAINS) {
    const alt = url.replace(/\/\/[abc]\./, `//${s}.`);
    const h = await cache.match(alt);
    if (h) return h;
  }
  // Also match bundled-path cache keys if warmed
  return null;
}

/** Create a Leaflet TileLayer that prefers bundled → Cache API → network. */
export function createCachedTileLayer(L, options = {}) {
  const TileLayerCached = L.TileLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement('img');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');
      L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
      L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));
      if (this.options.crossOrigin || this.options.crossOrigin === '') {
        tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
      }
      tile.src = '';
      const z = coords.z;
      const x = coords.x;
      const y = coords.y;
      const url = this.getTileUrl(coords);
      this._loadCached(z, x, y, url, tile, done);
      return tile;
    },

    async _loadCached(z, x, y, url, tile, done) {
      const cache = await openCache();
      try {
        // (a) Bundled offline tiles
        const bundled = await tryBundled(z, x, y);
        if (bundled) {
          tile.src = objectUrlFromBlob(bundled.blob);
          tile.dataset.fromBundled = '1';
          // Optionally mirror into Cache API under network URL for consistency
          if (cache) {
            try {
              await cache.put(
                url,
                new Response(bundled.blob.slice(), {
                  headers: { 'Content-Type': 'image/png' },
                }),
              );
            } catch {
              /* quota */
            }
          }
          return;
        }

        // (b) Cache API
        if (cache) {
          const hit = await matchCacheAnySubdomain(cache, url);
          if (hit) {
            const blob = await hit.blob();
            tile.src = objectUrlFromBlob(blob);
            tile.dataset.fromCache = '1';
            return;
          }
        }

        // (c) Network
        if (!isOnline()) {
          tile.dataset.miss = '1';
          tile.src =
            'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          this.fire('tileoffline', { url });
          done(new Error('offline-miss'), tile);
          return;
        }
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cache) {
          try {
            await cache.put(
              url,
              new Response(blob.slice(), {
                headers: { 'Content-Type': blob.type || 'image/png' },
              }),
            );
          } catch {
            /* quota */
          }
        }
        tile.src = objectUrlFromBlob(blob);
      } catch (err) {
        if (cache) {
          for (const s of SUBDOMAINS) {
            const alt = url.replace(/\/\/[abc]\./, `//${s}.`);
            const hit = await cache.match(alt);
            if (hit) {
              const blob = await hit.blob();
              tile.src = objectUrlFromBlob(blob);
              return;
            }
          }
        }
        // Last chance: bundled again (in case race)
        const bundled = await tryBundled(z, x, y);
        if (bundled) {
          tile.src = objectUrlFromBlob(bundled.blob);
          tile.dataset.fromBundled = '1';
          return;
        }
        tile.dataset.miss = '1';
        this.fire('tileoffline', { url, err });
        done(err, tile);
      }
    },
  });

  return new TileLayerCached(TILE_URL_TEMPLATE, {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    crossOrigin: true,
    ...options,
  });
}

function lon2tile(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
function lat2tile(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z),
  );
}

/**
 * Prefetch tiles for a Leaflet LatLngBounds at zoom levels zMin..zMax.
 * Returns { ok, fail, total }.
 */
export async function prefetchTiles(bounds, zMin = 12, zMax = 16, onProgress) {
  if (!isOnline()) throw new Error('offline');
  const cache = await openCache();
  if (!cache) throw new Error('no-cache-api');

  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  const jobs = [];
  for (let z = zMin; z <= zMax; z++) {
    const x0 = lon2tile(west, z);
    const x1 = lon2tile(east, z);
    const y0 = lat2tile(north, z);
    const y1 = lat2tile(south, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        jobs.push({ z, x, y });
      }
    }
  }

  const MAX = 800;
  const list = jobs.slice(0, MAX);
  let ok = 0;
  let fail = 0;
  const concurrency = 4;
  let i = 0;

  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const { z, x, y } = list[idx];
      const url = tileUrl(z, x, y);
      try {
        const existing = await cache.match(url);
        if (existing) {
          ok++;
        } else {
          // Prefer bundled if present (warm cache without network)
          const bundled = await tryBundled(z, x, y);
          if (bundled) {
            await cache.put(
              url,
              new Response(bundled.blob, {
                headers: { 'Content-Type': 'image/png' },
              }),
            );
            ok++;
          } else {
            const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            await cache.put(
              url,
              new Response(blob, { headers: { 'Content-Type': blob.type || 'image/png' } }),
            );
            ok++;
            await new Promise((r) => setTimeout(r, 80));
          }
        }
      } catch {
        fail++;
      }
      if (onProgress) onProgress({ ok, fail, total: list.length, done: ok + fail });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { ok, fail, total: list.length, truncated: jobs.length > MAX };
}

export async function countCachedTilesApprox() {
  const cache = await openCache();
  if (!cache) return 0;
  const keys = await cache.keys();
  return keys.length;
}

/**
 * Warm Cache API from bundled offline-tiles listed in manifest (best-effort, non-blocking).
 */
export async function warmCacheFromBundled(onProgress) {
  const cache = await openCache();
  if (!cache) return { warmed: 0 };
  let manifest;
  try {
    const res = await fetch(`${appBase()}offline-tiles/manifest.json`);
    if (!res.ok) return { warmed: 0 };
    manifest = await res.json();
  } catch {
    return { warmed: 0 };
  }

  // Walk known metro bboxes from manifest if present; otherwise skip heavy walk
  const metros = manifest.metros || [];
  if (!metros.length) return { warmed: 0 };

  const zMin = manifest.zoom?.min ?? 12;
  const zMax = manifest.zoom?.max ?? 15;
  const jobs = [];
  const seen = new Set();
  for (const a of metros) {
    const bbox = a.seedBbox || a.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) continue;
    const [south, west, north, east] = bbox;
    for (let z = zMin; z <= zMax; z++) {
      const x0 = lon2tile(west, z);
      const x1 = lon2tile(east, z);
      const y0 = lat2tile(north, z);
      const y1 = lat2tile(south, z);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = `${z}/${x}/${y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          jobs.push({ z, x, y });
        }
      }
    }
  }

  let warmed = 0;
  const BATCH = 24;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const slice = jobs.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async ({ z, x, y }) => {
        const netUrl = tileUrl(z, x, y);
        try {
          if (await cache.match(netUrl)) {
            warmed++;
            return;
          }
          const bundled = await tryBundled(z, x, y);
          if (!bundled) return;
          await cache.put(
            netUrl,
            new Response(bundled.blob, { headers: { 'Content-Type': 'image/png' } }),
          );
          warmed++;
        } catch {
          /* ignore */
        }
      }),
    );
    if (onProgress) onProgress({ warmed, total: jobs.length });
  }
  return { warmed, total: jobs.length };
}
