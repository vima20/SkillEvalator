const assert = require("assert");
const path = require("path");
const { safeJoin } = require("./safePath.js");
const root = path.join(__dirname, "root");
assert.ok(safeJoin(root, "a.txt").startsWith(path.resolve(root)));
assert.throws(() => safeJoin(root, "../secret.txt"), /traversal/i);
console.log("ok");
