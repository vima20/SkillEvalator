import { pollOnce } from "../apps/worker/src/queue.ts";

const did = await pollOnce();
console.log("did", did);
process.exit(did ? 0 : 2);
