function unique(arr) {
  if (!Array.isArray(arr)) throw new TypeError("array required");
  return [...new Set(arr)];
}
module.exports = { unique };
