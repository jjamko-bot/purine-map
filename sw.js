// 퓨린 신호등 서비스워커 — 캐시 우선 즉시 표시 + 백그라운드 갱신(stale-while-revalidate)
// 문서가 실제로 갱신되면(etag 비교) 열려있는 앱에 postMessage → "새로고침" 토스트.
// /api/·외부 오리진(지도 타일 등)은 항상 네트워크. 캐싱 로직 변경 시 CACHE 버전을 올릴 것.
const CACHE = 'pm-v2';
const CORE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) return;
  const nav = e.request.mode === 'navigate';
  e.respondWith(
    caches.match(e.request, { ignoreSearch: nav }).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(async c => {
            await c.put(e.request, copy);
            if (nav && cached) {
              const oldTag = cached.headers.get('etag'), newTag = res.headers.get('etag');
              if (oldTag && newTag && oldTag !== newTag) {
                const cls = await self.clients.matchAll();
                cls.forEach(cl => cl.postMessage({ type: 'pm-updated' }));
              }
            }
          });
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
