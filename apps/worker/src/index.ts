import { loop } from "./queue.js";

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
