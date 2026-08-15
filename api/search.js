// 네이버 지도 instant-search 프록시 — 브라우저 CORS 우회용.
// GET /api/search?q=검색어&c=위도,경도
export default async function handler(req, res) {
  const q = String(req.query.q || "").slice(0, 60).trim();
  const c = String(req.query.c || "").slice(0, 44).trim();
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!q) return res.status(400).json({ error: "q required" });

  const url = `https://map.naver.com/p/api/search/instant-search?query=${encodeURIComponent(q)}${
    /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(c) ? `&coords=${c}` : ""
  }`;
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  try {
    // 쿠키 부트스트랩: 맵 홈에서 NNB 등 세션 쿠키 획득 (봇 감지 완화)
    let cookie = "";
    try {
      const home = await fetch("https://map.naver.com/", { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" }, redirect: "follow" });
      const sc = typeof home.headers.getSetCookie === "function" ? home.headers.getSetCookie() : [home.headers.get("set-cookie") || ""];
      cookie = sc.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
    } catch {}
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://map.naver.com/",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        Accept: "application/json, text/plain, */*",
        "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const j = await r.json();
    const places = (j.place || []).slice(0, 10).map((p) => ({
      id: String(p.sid || p.id || ""),
      name: p.title || "",
      cat: p.ctg || "",
      addr: (p.shortAddress && p.shortAddress[0]) || p.roadAddress || p.jibunAddress || "",
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      review: (p.review && Number(p.review.count)) || 0,
    })).filter((p) => p.id && p.name);
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
    return res.status(200).json({ places });
  } catch (e) {
    return res.status(502).json({ error: "fetch failed" });
  }
}
