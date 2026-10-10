const assert = require("assert");
const { parseQuery } = require("./query.js");
assert.deepStrictEqual(parseQuery("a=1"), { a: "2" });
console.log("ok");
