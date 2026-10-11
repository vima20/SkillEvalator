function firstTag(html) {
  const m = html.match(/<(.+)>/);
  return m ? m[1] : null;
}
module.exports = { firstTag };
