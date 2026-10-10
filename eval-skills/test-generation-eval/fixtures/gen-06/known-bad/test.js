const assert = require("assert");
const { safeDivide } = require("./divide.js");
assert.strictEqual(safeDivide(10, 2), 0);
console.log("ok");
