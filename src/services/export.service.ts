import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { DEFAULT_HOURLY_RATE } from "../config";
import { formatLocalDateYMD, msToRoundedMinutes, type TimeRange } from "../utils/time";
import type { ClickUpTimeEntry } from "./clickup.service";
import { sendInvoiceExportEmail, loadInvoiceEmailEnv } from "./email.service";
import { generateInvoicePdf, loadInvoiceEnv } from "./invoice.service";

export function getExportDir() {
  const projectRoot = path.join(__dirname, "..", "..");
  const exportsDir = path.join(projectRoot, "exports");

  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir);
  }

  return exportsDir;
}

export type SaveFilesResult = {
  csvFilePath: string;
  txtFilePath: string;
  totalHoursInt: number;
  totalMinutesRemainder: number;
  totalHoursDecimal: number;
  totalAmount: number;
  invoicePdfFilePath?: string;
  emailSent?: boolean;
  emailError?: string;
};

async function saveFilesFromTimeEntriesAsync(
  entries: ClickUpTimeEntry[],
  { start, end }: TimeRange,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): Promise<SaveFilesResult> {
  const exportsDir = getExportDir();

  const startDate = formatLocalDateYMD(start);
  const endDate = formatLocalDateYMD(end);

  const csvFilename = `time-entries_${startDate}_to_${endDate}.csv`;
  const csvFilePath = path.join(exportsDir, csvFilename);

  let totalDurationMs = 0;

  const records = entries.map((entry) => {
    const durationMs = Number(entry.duration);
    totalDurationMs += durationMs;

    const { hours, minutes } = msToRoundedMinutes(durationMs);

    return {
      task_id: entry.task?.id || "",
      task_name: entry.task?.name || "",
      date: new Date(Number(entry.start)).toISOString().slice(0, 10),
      hours,
      minutes,
    };
  });

  const csv = stringify(records, {
    header: true,
    columns: [
      { key: "task_id", header: "Task ID" },
      { key: "task_name", header: "Task" },
      { key: "date", header: "Date" },
      { key: "hours", header: "Hours" },
      { key: "minutes", header: "Minutes" },
    ],
  });

  fs.writeFileSync(csvFilePath, csv, "utf8");

  const totalMinutes = Math.floor(totalDurationMs / 60000);
  const totalHoursInt = Math.floor(totalMinutes / 60);
  const totalMinutesRemainder = totalMinutes % 60;
  const totalHoursDecimal = totalHoursInt + totalMinutesRemainder / 60;

  const totalAmount = Number((totalHoursDecimal * hourlyRate).toFixed(2));
  const summaryText =
    `Total Hours: ${totalHoursInt}h ${totalMinutesRemainder}m (${totalHoursDecimal.toFixed(
      2,
    )})\n` + `Total Amount: $${totalAmount.toFixed(2)}\n`;

  const txtFilename = `summary_${startDate}_to_${endDate}.txt`;
  const txtFilePath = path.join(exportsDir, txtFilename);

  fs.writeFileSync(txtFilePath, summaryText, "utf8");

  const invoiceEnv = loadInvoiceEnv();
  let invoicePdfFilePath: string | undefined;

  if (invoiceEnv.enablePdf) {
    const invoiceFilename = `invoice_${invoiceEnv.invoiceCode}_${startDate}_to_${endDate}.pdf`;
    invoicePdfFilePath = path.join(exportsDir, invoiceFilename);

    await generateInvoicePdf({
      env: invoiceEnv,
      input: {
        timeRange: { start, end },
        totalAmount,
        totalHoursDecimal,
      },
      outputPdfPath: invoicePdfFilePath,
    });
  }

  const result: SaveFilesResult = {
    csvFilePath,
    txtFilePath,
    totalHoursInt,
    totalMinutesRemainder,
    totalHoursDecimal,
    totalAmount,
    invoicePdfFilePath,
  };

  const emailEnv = loadInvoiceEmailEnv();
  if (emailEnv.enable) {
    try {
      await sendInvoiceExportEmail({ range: { start, end }, result, emailEnv });
      result.emailSent = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.emailError = msg;
      console.error("[email] Falha ao enviar:", msg);
    }
  }

  return result;
}

// Backwards-compatible name (callers must now await this function).
export async function saveFilesFromTimeEntries(
  entries: ClickUpTimeEntry[],
  range: TimeRange,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): Promise<SaveFilesResult> {
  return saveFilesFromTimeEntriesAsync(entries, range, hourlyRate);
}

