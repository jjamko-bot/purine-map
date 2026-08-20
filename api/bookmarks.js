// 네이버 즐겨찾기 폴더 공유 링크 → 목록 프록시 (v19.6)
// GET /api/bookmarks?u=<naver.me 공유링크 | 32hex shareId>
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const u = String(req.query.u || "").slice(0, 300).trim();
  if (!u) return res.status(400).json({ error: "u required" });
  try {
    let shareId = null;
    const hex = u.match(/\b([0-9a-f]{32})\b/i);
    if (hex) shareId = hex[1];
    else {
      let url;
      try { url = new URL(u.startsWith("http") ? u : "https://" + u); } catch { return res.status(400).json({ error: "bad url" }); }
      if (!/(^|\.)naver\.(me|com)$/.test(url.hostname) && !/\.naver\.com$/.test(url.hostname))
        return res.status(400).json({ error: "naver link only" });
      // 단축 링크 리다이렉트 추적 (네이버 도메인 내에서만, 최대 4단계)
      let cur = url.href;
      for (let i = 0; i < 4 && !shareId; i++) {
        const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": UA } });
        const loc = r.headers.get("location");
        if (!loc) { const m2 = (await r.text()).match(/shares\/([0-9a-f]{32})/i); if (m2) shareId = m2[1]; break; }
        cur = new URL(loc, cur).href;
        const m = cur.match(/\b([0-9a-f]{32})\b/i);
        if (m) { shareId = m[1]; break; }
        if (!/naver\.(me|com)$/.test(new URL(cur).hostname) && !/\.naver\.com$/.test(new URL(cur).hostname)) break;
      }
    }
    if (!shareId) return res.status(422).json({ error: "share id not found" });
    const r = await fetch(
      `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${shareId}/bookmarks?start=0&limit=1000`,
      { headers: { "User-Agent": UA, Referer: "https://pages.map.naver.com/", "Accept-Language": "ko-KR,ko;q=0.9" } }
    );
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const d = await r.json();
    const all = d.bookmarkList || [];
    // 음식점·술집만 (카페·디저트는 앱 분류 규칙상 제외)
    const list = all.filter(b => ["음식점", "BAR"].includes(b.mcidName || b.mcid));
    return res.status(200).json({
      places: list.map(b => ({ id: String(b.sid), name: b.name, x: Number(b.px) || 0, y: Number(b.py) || 0, addr: b.address || "" })),
      total: all.length,
    });
  } catch (e) {
    return res.status(500).json({ error: "fail" });
  }
}
