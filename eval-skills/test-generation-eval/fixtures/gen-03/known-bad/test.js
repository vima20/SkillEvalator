const assert = require("assert");
const { unique } = require("./unique.js");
assert.deepStrictEqual(unique([1, 1, 2]), [1, 1, 2]);
console.log("ok");
