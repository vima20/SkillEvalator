const assert = require("assert");
const { formatMoney } = require("./money.js");
assert.strictEqual(formatMoney(0), "0.00 USD");
assert.strictEqual(formatMoney(105), "1.05 USD");
assert.strictEqual(formatMoney(-50, "EUR"), "-0.50 EUR");
assert.strictEqual(formatMoney(99), "0.99 USD");
assert.throws(() => formatMoney(1.5), TypeError);
console.log("ok");
