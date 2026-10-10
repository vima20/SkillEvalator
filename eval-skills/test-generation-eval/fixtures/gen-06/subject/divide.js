function safeDivide(a, b) {
  if (typeof a !== "number" || typeof b !== "number") {
    throw new TypeError("numbers required");
  }
  if (b === 0) return null;
  return a / b;
}
module.exports = { safeDivide };
