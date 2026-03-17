import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { DEFAULT_HOURLY_RATE } from "./config";
import { fetchTimeEntriesForRange, fetchUserInfo } from "./services/clickup.service";
import { saveFilesFromTimeEntries } from "./services/export.service";
import { getQuinzenaRange, type TimeRange } from "./utils/time";

export async function runCli(): Promise<void> {
  console.clear();
  console.log("===============================================");
  console.log("   ClickUp Time Exporter - CLI Quinzenal");
  console.log("===============================================");
  console.log();

  const rl = readline.createInterface({ input, output });

  try {
    console.log("Período padrão (se deixar tudo em branco):");
    const defaultRange = getQuinzenaRange({ startParam: undefined, endParam: undefined });
    const defaultStartDate = new Date(defaultRange.start);
    const defaultEndDate = new Date(defaultRange.end);
    console.log(
      ` - ${defaultStartDate.toISOString().slice(0, 10)} até ${defaultEndDate
        .toISOString()
        .slice(0, 10)}`,
    );
    console.log();

    const useCustom = (await rl.question("Deseja informar manualmente o período? (s/N) ")).trim();

    let range: TimeRange;

    if (useCustom.toLowerCase() === "s") {
      console.log();
      console.log(
        "Informe a DATA INICIAL (dia/mês/ano). Deixe em branco para usar o início padrão da quinzena.",
      );

      const defaultStartStr = `${String(defaultStartDate.getDate()).padStart(2, "0")}/${String(
        defaultStartDate.getMonth() + 1,
      ).padStart(2, "0")}/${defaultStartDate.getFullYear()}`;
      const startDateInput = (
        await rl.question(`Data inicial (DD/MM/AAAA) [${defaultStartStr}]: `)
      ).trim();

      console.log();
      console.log(
        "Informe a DATA FINAL (dia/mês/ano). Deixe em branco para usar o fim padrão da quinzena.",
      );
      const defaultEndStr = `${String(defaultEndDate.getDate()).padStart(2, "0")}/${String(
        defaultEndDate.getMonth() + 1,
      ).padStart(2, "0")}/${defaultEndDate.getFullYear()}`;
      const endDateInput = (
        await rl.question(`Data final (DD/MM/AAAA) [${defaultEndStr}]: `)
      ).trim();

      let startDate: Date;
      let endDate: Date;

      if (!startDateInput) {
        startDate = new Date(defaultStartDate);
      } else {
        const [d, m, y] = startDateInput.split("/").map((part) => Number(part));
        if (!d || !m || !y) {
          throw new Error("Data inicial inválida. Use o formato DD/MM/AAAA.");
        }
        startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      }

      if (!endDateInput) {
        endDate = new Date(defaultEndDate);
      } else {
        const [d2, m2, y2] = endDateInput.split("/").map((part) => Number(part));
        if (!d2 || !m2 || !y2) {
          throw new Error("Data final inválida. Use o formato DD/MM/AAAA.");
        }
        endDate = new Date(y2, m2 - 1, d2, 23, 59, 59, 999);
      }

      if (endDate.getTime() < startDate.getTime()) {
        throw new Error("A data final não pode ser menor que a data inicial.");
      }

      range = {
        start: startDate.getTime(),
        end: endDate.getTime(),
      };
    } else {
      range = defaultRange;
    }

    console.log();
    const hourlyRateDefaultText =
      DEFAULT_HOURLY_RATE > 0 ? ` [padrão: ${DEFAULT_HOURLY_RATE.toFixed(2)} USD]` : "";
    const hourlyRateStr = (
      await rl.question(`Valor da sua hora em USD${hourlyRateDefaultText}: `)
    ).trim();

    let hourlyRate = DEFAULT_HOURLY_RATE;
    if (hourlyRateStr) {
      const parsed = Number(hourlyRateStr.replace(",", "."));
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error("Valor da hora inválido.");
      }
      hourlyRate = parsed;
    }

    if (!hourlyRate || hourlyRate <= 0) {
      throw new Error(
        "Nenhum valor de hora válido foi definido (nem no .env nem via CLI).",
      );
    }

    console.log();
    console.log("Buscando time entries no ClickUp...");
    const userInfo = await fetchUserInfo();
   
    const entries = await fetchTimeEntriesForRange(range, userInfo);

    console.log(`Encontradas ${entries.length} time entries. Gerando arquivos...`);
    const result = saveFilesFromTimeEntries(entries, range, hourlyRate);

    console.log();
    console.log("===============================================");
    console.log("   Exportação concluída!");
    console.log("===============================================");
    console.log(`CSV: ${result.csvFilePath}`);
    console.log(`Resumo: ${result.txtFilePath}`);
    console.log(
      `Total de horas: ${result.totalHoursInt}h ${result.totalMinutesRemainder}m (${result.totalHoursDecimal.toFixed(
        2,
      )})`,
    );
    console.log(`Valor total: $${result.totalAmount.toFixed(2)}`);
    console.log("===============================================");
  } catch (err) {
    console.error();
    const error = err as Error;
    console.error("Erro na execução da CLI:", error.message || error);
    process.exitCode = 1;
  } finally {
    rl.close();
    process.exit(process.exitCode ?? 0);
  }
}

