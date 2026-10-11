const path = require("path");
function safeJoin(root, userPath) {
  return path.join(root, userPath);
}
module.exports = { safeJoin };
