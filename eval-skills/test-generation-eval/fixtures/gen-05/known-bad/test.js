const assert = require("assert");
const { formatMoney } = require("./money.js");
assert.strictEqual(formatMoney(100), "100 USD");
console.log("ok");
