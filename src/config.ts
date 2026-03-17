import { fetchUserInfo } from "./services/clickup.service";

// Carrega variáveis de ambiente a partir de .env (Node 22+)
if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

export const PORT = process.env.PORT || 3000;
export const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
export const TEAM_ID = process.env.CLICKUP_TEAM_ID;

let USER_ID: string | undefined = process.env.CLICKUP_USER_ID;

export const DEFAULT_HOURLY_RATE = Number(process.env.HOURLY_RATE_USD || "0");

export async function ensureEnv(): Promise<void> {
  if (!CLICKUP_TOKEN || !TEAM_ID) {
    console.error(
      "Faltam variáveis no ambiente (CLICKUP_API_TOKEN, CLICKUP_TEAM_ID).",
    );
    process.exit(1);
  }

  if (!USER_ID) {
    try {
      const data = await fetchUserInfo();
      // A API /user do ClickUp normalmente retorna { user: { id: ... } }
      const resolvedId =
        (data as any)?.user?.id ??
        (data as any)?.id ??
        undefined;

      if (!resolvedId) {
        throw new Error("Não foi possível obter o USER_ID a partir da API do ClickUp.");
      }

      USER_ID = String(resolvedId);
    } catch (error) {
      const err = error as Error;
      console.error(
        "Erro ao buscar USER_ID na API do ClickUp:",
        err.message || err,
      );
      process.exit(1);
    }
  }
}

export function getUserId(): string {
  if (!USER_ID) {
    throw new Error("USER_ID ainda não foi inicializado. Certifique-se de chamar ensureEnv() antes.");
  }
  return USER_ID;
}


