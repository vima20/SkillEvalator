const path = require("path");
function safeJoin(root, userPath) {
  const resolved = path.resolve(root, userPath);
  const rootResolved = path.resolve(root) + path.sep;
  if (resolved !== path.resolve(root) && !resolved.startsWith(rootResolved)) {
    throw new Error("path traversal");
  }
  return resolved;
}
module.exports = { safeJoin };
