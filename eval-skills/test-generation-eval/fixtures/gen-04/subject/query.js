function parseQuery(qs) {
  const s = String(qs || "").replace(/^\?/, "");
  if (!s) return {};
  const out = {};
  for (const part of s.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent(i === -1 ? part : part.slice(0, i));
    const v = decodeURIComponent(i === -1 ? "" : part.slice(i + 1));
    out[k] = v;
  }
  return out;
}
module.exports = { parseQuery };
