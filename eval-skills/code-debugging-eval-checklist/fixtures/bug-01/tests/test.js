const assert = require("assert");
const { sumToN } = require("./sum.js");
assert.strictEqual(sumToN(0), 0);
assert.strictEqual(sumToN(1), 1);
assert.strictEqual(sumToN(10), 55);
console.log("ok");
