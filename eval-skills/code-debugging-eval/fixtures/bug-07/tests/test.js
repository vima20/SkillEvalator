const assert = require("assert");
const { makeCounter } = require("./counter.js");
const c = makeCounter();
c.inc();
c.add(4);
assert.strictEqual(c.value(), 5);
console.log("ok");
