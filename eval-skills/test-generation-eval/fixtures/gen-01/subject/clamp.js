function clamp(n, min, max) {
  if (min > max) throw new Error("min > max");
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
module.exports = { clamp };
