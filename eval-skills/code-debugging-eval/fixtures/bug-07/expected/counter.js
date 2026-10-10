function makeCounter() {
  let n = 0;
  return {
    inc() { n = n + 1; },
    add(k) { n = n + k; },
    value() { return n; },
  };
}
module.exports = { makeCounter };
