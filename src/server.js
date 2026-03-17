import { ensureEnv } from "./config.js";
import { runCli } from "./cli.js";
import { startHttpServer } from "./http.server.js";

ensureEnv();

const isCliMode = process.argv.includes("--cli");

if (isCliMode) {
  runCli();
} else {
  startHttpServer();
}
