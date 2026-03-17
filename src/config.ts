// Carrega variáveis de ambiente a partir de .env (Node 22+)
if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

export const PORT = process.env.PORT || 3000;
export const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
export const TEAM_ID = process.env.CLICKUP_TEAM_ID;
export const USER_ID = process.env.CLICKUP_USER_ID;

export const DEFAULT_HOURLY_RATE = Number(process.env.HOURLY_RATE_USD || "0");

export function ensureEnv(): void {
  if (!CLICKUP_TOKEN || !TEAM_ID) {
    console.error(
      "Faltam variáveis no ambiente (CLICKUP_API_TOKEN, CLICKUP_TEAM_ID).",
    );
    process.exit(1);
  }
}


