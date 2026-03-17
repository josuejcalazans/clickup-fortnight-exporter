import { ensureEnv } from "@src/config";
import { runCli } from "./cli";
import { startHttpServer } from "./http.server";
ensureEnv();
const isCliMode = process.argv.includes("--cli");
if (isCliMode) {
    runCli();
}
else {
    startHttpServer();
}
