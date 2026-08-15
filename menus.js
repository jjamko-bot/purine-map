// 네이버 플레이스 메뉴 조회 프록시 — __APOLLO_STATE__에서 메뉴 추출.
// GET /api/menus?id=플레이스ID
export default async function handler(req, res) {
  const id = String(req.query.id || "").trim();
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!/^\d{5,15}$/.test(id)) return res.status(400).json({ error: "valid id required" });

  try {
    const r = await fetch(`https://m.place.naver.com/restaurant/${id}/menu/list`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const html = await r.text();
    const mark = html.indexOf("__APOLLO_STATE__");
    if (mark < 0) return res.status(200).json({ menus: [] });
    const start = html.indexOf("{", mark);
    const json = extractBalanced(html, start);
    if (!json) return res.status(200).json({ menus: [] });
    let state;
    try { state = JSON.parse(json); } catch { return res.status(200).json({ menus: [] }); }

    const menus = [];
    for (const [k, v] of Object.entries(state)) {
      if (!v || typeof v !== "object") continue;
      if ("name" in v && "price" in v && Array.isArray(v.images)) {
        const mid = String(v.id || "");
        if (!(mid.startsWith(id + "_") || k.startsWith("Menu:"))) continue;
        menus.push({
          n: v.name || "",
          p: v.price || "",
          img: v.images[0] ? v.images[0] + "?type=f160_160" : "",
          rec: !!v.recommend,
          idx: typeof v.index === "number" ? v.index : 999,
        });
      }
    }
    menus.sort((a, b) => (a.rec === b.rec ? a.idx - b.idx : a.rec ? -1 : 1));
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ menus: menus.map(({ n, p, img }) => ({ n, p, img })) });
  } catch (e) {
    return res.status(502).json({ error: "fetch failed" });
  }
}

// 중괄호 밸런스 스캔으로 JSON 오브젝트 추출 (문자열 내부의 중괄호는 무시)
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
