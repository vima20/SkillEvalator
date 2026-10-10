const assert = require("assert");
const { unique } = require("./unique.js");
assert.deepStrictEqual(unique([1, 1, 2, 3, 2]), [1, 2, 3]);
assert.deepStrictEqual(unique([]), []);
assert.deepStrictEqual(unique(["a", "a", "b"]), ["a", "b"]);
assert.throws(() => unique(null), TypeError);
console.log("ok");
