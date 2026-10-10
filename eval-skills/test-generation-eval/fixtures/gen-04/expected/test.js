const assert = require("assert");
const { parseQuery } = require("./query.js");
assert.deepStrictEqual(parseQuery("a=1&b=2"), { a: "1", b: "2" });
assert.deepStrictEqual(parseQuery("?x=hi%20there"), { x: "hi there" });
assert.deepStrictEqual(parseQuery(""), {});
assert.deepStrictEqual(parseQuery("flag"), { flag: "" });
console.log("ok");
