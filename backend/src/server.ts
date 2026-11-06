import "./config.js";
import { buildApp } from "./app.js";
const app = await buildApp();
try {
  await app.listen({
    port: Number(process.env.PORT) || 4000,
    host: process.env.HOST || "127.0.0.1",
  });
  console.log("Balanced Life API: http://localhost:4000/api/v1");
} catch (error) {
  app.log.error(error);
  console.error(error);
  process.exit(1);
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
