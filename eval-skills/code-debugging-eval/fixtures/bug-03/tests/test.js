const assert = require("assert");
const { displayName } = require("./user.js");
assert.strictEqual(displayName({ profile: { name: "Ada" } }), "ADA");
assert.strictEqual(displayName(null), "ANONYMOUS");
assert.strictEqual(displayName({}), "ANONYMOUS");
assert.strictEqual(displayName({ profile: {} }), "ANONYMOUS");
console.log("ok");
