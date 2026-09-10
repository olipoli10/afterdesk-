import { setTimeout as delay } from "node:timers/promises";
import { drainPersonalSms, personalSmsWorkerEnabled } from "../src/server/personal-assistant/sms-worker";
import { prisma } from "../src/lib/db";
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
async function main() {
  try {
    if (!personalSmsWorkerEnabled(process.env)) { console.log("PERSONAL_SMS_WORKER_DISABLED"); return; }
    do {
      const result = await drainPersonalSms();
      if (result.processed) console.log(`PERSONAL_SMS_REPLIES_PREPARED=${result.processed}`);
      if (process.argv.includes("--once") || !personalSmsWorkerEnabled(process.env)) break;
      await delay(10000);
    } while (!stopping);
  } catch { console.error("PERSONAL_SMS_WORKER_FAILED"); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
void main();
