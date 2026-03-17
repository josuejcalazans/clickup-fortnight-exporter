import express, { type Request, type Response } from "express";
import cron from "node-cron";
import { ensureEnv, PORT } from "./config";
import {
  getLastFortnightRange,
  getQuinzenaRange,
  type TimeRange,
} from "./utils/time";
import { fetchTimeEntriesForRange, fetchUserInfo } from "./services/clickup.service";
import { saveFilesFromTimeEntries } from "./services/export.service";

export function startHttpServer(): void {
  ensureEnv();

  const app = express();

  app.get("/export/fortnight", async (req: Request, res: Response) => {
    try {
      const { start, end } = req.query as { start?: string; end?: string };
      const range: TimeRange = getQuinzenaRange({
        startParam: start,
        endParam: end,
      });
      const userInfo = await fetchUserInfo();

      const entries = await fetchTimeEntriesForRange(range,userInfo);
      const result = saveFilesFromTimeEntries(entries, range);

      res.json({
        message: "Arquivos gerados com sucesso.",
        entriesCount: entries.length,
        csvFilePath: result.csvFilePath,
        txtFilePath: result.txtFilePath,
        totalHours: `${result.totalHoursInt}h ${result.totalMinutesRemainder}m`,
        totalHoursDecimal: result.totalHoursDecimal.toFixed(2),
        totalAmount: Number(result.totalAmount.toFixed(2)),
        usedRange: {
          start: new Date(range.start).toISOString(),
          end: new Date(range.end).toISOString(),
        },
      });
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: unknown } };
      console.error(error.response?.data || error.message);
      res
        .status(400)
        .json({ error: error.message || "Erro ao gerar arquivos." });
    }
  });

  // Cron quinzenal: dia 1 e 16 de cada mês às 01:00
  cron.schedule("0 1 1,16 * *", async () => {
    try {
      const range = getLastFortnightRange();
      const userInfo = await fetchUserInfo();
      const entries = await fetchTimeEntriesForRange(range, userInfo);
      const result = saveFilesFromTimeEntries(entries, range);

      console.log(
        `[CRON] Arquivos gerados: ${result.csvFilePath}, ${result.txtFilePath} (entries: ${entries.length})`,
      );
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: unknown } };
      console.error(
        "[CRON] Erro ao gerar arquivos:",
        error.response?.data || error.message,
      );
    }
  });

  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(
      "Use GET /export/fortnight para gerar o CSV + TXT quinzenal (regra automática de quinzena).",
    );
    console.log("Para usar a CLI interativa, rode: npm run dev:cli ou npm run cli");
  });
}

