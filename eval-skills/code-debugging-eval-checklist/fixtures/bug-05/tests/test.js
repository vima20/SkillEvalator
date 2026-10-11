const assert = require("assert");
const { addItem } = require("./cart.js");
const base = ["a"];
const next = addItem(base, "b");
assert.deepStrictEqual(base, ["a"]);
assert.deepStrictEqual(next, ["a", "b"]);
console.log("ok");
