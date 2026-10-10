const assert = require("assert");
const { safeDivide } = require("./divide.js");
assert.strictEqual(safeDivide(10, 2), 5);
assert.strictEqual(safeDivide(1, 4), 0.25);
assert.strictEqual(safeDivide(3, 0), null);
assert.throws(() => safeDivide("1", 2), TypeError);
assert.throws(() => safeDivide(1, null), TypeError);
console.log("ok");
