function makeCounter() {
  let n = 0;
  let snapshot = 0;
  return {
    inc() { n = n + 1; snapshot = n; },
    add(k) { n = n + k; },
    value() { return snapshot; },
  };
}
module.exports = { makeCounter };
