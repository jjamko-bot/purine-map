// 네이버 플레이스 검색 프록시 — m.place.naver.com/restaurant/list의 __APOLLO_STATE__에서 추출.
// (map.naver.com instant-search는 데이터센터 IP를 차단하지만 m.place.naver.com은 허용)
// GET /api/search?q=검색어
export default async function handler(req, res) {
  const q = String(req.query.q || "").slice(0, 60).trim();
  const c = String(req.query.c || "").slice(0, 44).trim(); // "위도,경도"
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!q) return res.status(400).json({ error: "q required" });

  // 상호명 검색은 중심 좌표가 있어야 결과가 나옴 — 기본값은 서울 중심
  let lat = 37.5666, lng = 126.9784;
  const m = c.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (m) { lat = Number(m[1]); lng = Number(m[2]); }

  try {
    const r = await fetch(`https://m.place.naver.com/restaurant/list?query=${encodeURIComponent(q)}&x=${lng}&y=${lat}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const html = await r.text();
    const mark = html.indexOf("__APOLLO_STATE__");
    if (mark < 0) return res.status(200).json({ places: [] });
    const json = extractBalanced(html, html.indexOf("{", mark));
    if (!json) return res.status(200).json({ places: [] });
    let state;
    try { state = JSON.parse(json); } catch { return res.status(200).json({ places: [] }); }

    const seen = new Set();
    const places = [];
    for (const v of Object.values(state)) {
      if (!v || typeof v !== "object") continue;
      if (v.id && v.name && v.category && (v.x || v.y) && !seen.has(v.id)) {
        seen.add(v.id);
        places.push({
          id: String(v.id),
          name: v.name,
          cat: v.category || "",
          addr: v.commonAddress || v.fullAddress || v.roadAddress || "",
          x: Number(v.x) || 0,
          y: Number(v.y) || 0,
          review: Number(String(v.visitorReviewCount || "0").replace(/,/g, "")) || 0,
        });
        if (places.length >= 10) break;
      }
    }
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
    return res.status(200).json({ places });
  } catch (e) {
    return res.status(502).json({ error: "fetch failed" });
  }
}

function extractBalanced(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
