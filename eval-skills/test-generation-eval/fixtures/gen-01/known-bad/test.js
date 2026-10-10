const assert = require("assert");
const { clamp } = require("./clamp.js");
assert.strictEqual(clamp(5, 0, 10), 999);
console.log("ok");
