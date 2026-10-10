const assert = require("assert");
const { firstTag } = require("./parse.js");
assert.strictEqual(firstTag("<b>hi</b>"), "b");
assert.strictEqual(firstTag("<span class=\"x\">z</span>"), "span class=\"x\"");
console.log("ok");
