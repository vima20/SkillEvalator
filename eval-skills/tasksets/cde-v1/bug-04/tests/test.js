const assert = require("assert");
const { getUserName } = require("./fetchUser.js");
(async () => {
  const name = await getUserName(async () => ({ name: "Lin" }));
  assert.strictEqual(name, "Lin");
  console.log("ok");
})().catch((e) => { console.error(e); process.exit(1); });
