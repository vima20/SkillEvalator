const assert = require("assert");
const { clamp } = require("./clamp.js");
assert.strictEqual(clamp(5, 0, 10), 5);
assert.strictEqual(clamp(-1, 0, 10), 0);
assert.strictEqual(clamp(99, 0, 10), 10);
assert.strictEqual(clamp(0, 0, 10), 0);
assert.throws(() => clamp(1, 5, 2), /min > max/);
console.log("ok");
