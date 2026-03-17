import express from "express";
import cron from "node-cron";
import { ensureEnv, PORT } from "./config.js";
import { getLastFortnightRange, getQuinzenaRange } from "./utils/time.js";
import { fetchTimeEntriesForRange } from "./services/clickup.service.js";
import { saveFilesFromTimeEntries } from "./services/export.service.js";

export function startHttpServer() {
  ensureEnv();

  const app = express();

  app.get("/export/fortnight", async (req, res) => {
    try {
      const { start, end } = req.query;
      const range = getQuinzenaRange({
        startParam: start,
        endParam: end,
      });

      const entries = await fetchTimeEntriesForRange(range);
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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err?.response?.data || err.message);
      res.status(400).json({ error: err.message || "Erro ao gerar arquivos." });
    }
  });

  // Cron quinzenal: dia 1 e 16 de cada mês às 01:00
  cron.schedule("0 1 1,16 * *", async () => {
    try {
      const range = getLastFortnightRange();
      const entries = await fetchTimeEntriesForRange(range);
      const result = saveFilesFromTimeEntries(entries, range);
      // eslint-disable-next-line no-console
      console.log(
        `[CRON] Arquivos gerados: ${result.csvFilePath}, ${result.txtFilePath} (entries: ${entries.length})`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[CRON] Erro ao gerar arquivos:",
        err?.response?.data || err.message,
      );
    }
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(
      "Use GET /export/fortnight para gerar o CSV + TXT quinzenal (regra automática de quinzena).",
    );
    // eslint-disable-next-line no-console
    console.log("Para usar a CLI interativa, rode: node src/server.js --cli");
  });
}

