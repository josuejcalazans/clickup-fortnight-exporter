import { ensureEnv } from "./config";
import { runCli } from "./cli";
import { startHttpServer } from "./http.server";

async function bootstrap(): Promise<void> {
  ensureEnv();

  const isCliMode = process.argv.includes("--cli");

  if (isCliMode) {
    await runCli();
  } else {
    startHttpServer();
  }
}

void bootstrap();
