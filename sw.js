// 私人金流帳本 Service Worker
// 修改 index.html 後，把版本號 +1，iPhone 重開 App 就會抓到新版
const CACHE_NAME = 'ledger-v7';

const LOCAL_FILES = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

// 外部 CDN 函式庫（必須快取，否則離線時整個 App 會無法執行）
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/decimal.js/10.4.3/decimal.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_FILES);
    // CDN 檔以 no-cors 抓取（opaque response 無法用 addAll，需手動 put）
    await Promise.all(CDN_FILES.map(async url => {
      try {
        const res = await fetch(new Request(url, { mode: 'no-cors' }));
        await cache.put(url, res);
      } catch (e) { /* 單一檔失敗不影響安裝，之後執行時會再快取 */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 主頁面：網路優先（有網路就拿最新版），離線時用快取
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) { // 只快取正常的頁面，避免把錯誤頁存起來
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // 其他資源（函式庫、圖示）：快取優先，沒有才上網並存起來
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
