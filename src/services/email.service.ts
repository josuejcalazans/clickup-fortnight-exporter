import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  formatInvoiceBodyBetweenPeriod,
  formatInvoiceEmailSubject,
} from "../utils/english-dates";
import type { TimeRange } from "../utils/time";

/** Dados do export para montar o e-mail (evita import circular com export.service). */
export type ExportSnapshotForEmail = {
  csvFilePath: string;
  txtFilePath: string;
  invoicePdfFilePath?: string;
  totalHoursInt: number;
  totalMinutesRemainder: number;
  totalAmount: number;
};

export interface InvoiceEmailEnv {
  enable: boolean;
  gmailUser: string;
  gmailAppPassword: string;
  toAddresses: string[];
  fromAddress: string;
  /** HTML colado da assinatura do Gmail (SMTP não usa a assinatura guardada na conta). */
  signatureHtml: string;
}

function toBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadSignatureHtmlFromEnv(): string {
  const filePath = process.env.EMAIL_SIGNATURE_HTML_FILE?.trim();
  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    return fs.readFileSync(resolved, "utf8");
  }
  const inline = process.env.EMAIL_SIGNATURE_HTML;
  if (!inline?.trim()) return "";
  return replaceAllSafe(inline, "\\n", "\n");
}

function replaceAllSafe(text: string, search: string, replacement: string): string {
  return text.split(search).join(replacement);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Preenche `email-signature.html` (ou HTML inline) a partir das envs. */
export function injectSignatureTemplateVars(html: string): string {
  const displayName =
    process.env.EMAIL_SIGNATURE_DISPLAY_NAME?.trim() ||
    process.env.EMAIL_SIGNATURE_NAME?.trim() ||
    "";
  const jobTitle = process.env.EMAIL_SIGNATURE_JOB_TITLE?.trim() ?? "";

  return replaceAllSafe(
    replaceAllSafe(html, "{{SIGNATURE_DISPLAY_NAME}}", escapeHtml(displayName)),
    "{{SIGNATURE_JOB_TITLE}}",
    escapeHtml(jobTitle),
  );
}

export function loadInvoiceEmailEnv(): InvoiceEmailEnv {
  const gmailUser = process.env.GMAIL_USER?.trim() ?? "";
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "") ?? "";
  const toRaw = process.env.EMAIL_TO ?? "";
  const fromAddress = (process.env.EMAIL_FROM?.trim() || gmailUser).trim();


  const enable = toBool(process.env.EMAIL_ENABLE ?? "0");
  let signatureHtml = "";
  if (enable) {
    try {
      signatureHtml = injectSignatureTemplateVars(loadSignatureHtmlFromEnv().trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`EMAIL_SIGNATURE_HTML / EMAIL_SIGNATURE_HTML_FILE: ${msg}`);
    }
  }

  return {
    enable,
    gmailUser,
    gmailAppPassword,
    toAddresses: parseAddressList(toRaw),
    fromAddress,
    signatureHtml,
  };
}

function readSummaryHoursAndAmount(txtPath: string, fallback: ExportSnapshotForEmail): {
  hoursLine: string;
  amountStr: string;
} {
  let raw = "";
  try {
    raw = fs.readFileSync(txtPath, "utf8");
  } catch {
    return {
      hoursLine: `${fallback.totalHoursInt}h ${fallback.totalMinutesRemainder}m`,
      amountStr: `$${fallback.totalAmount.toFixed(2)}`,
    };
  }

  const hoursFull = raw.match(/Total Hours:\s*([^\n]+)/);
  const amountM = raw.match(/Total Amount:\s*(\$[\d.]+)/);
  const hoursCompact = raw.match(/Total Hours:\s*(\d+h\s*\d+m)\b/);

  const hoursLine =
    hoursCompact?.[1]?.trim() ||
    (hoursFull?.[1]
      ? hoursFull[1].replace(/\s*\([^)]+\)\s*$/, "").trim()
      : `${fallback.totalHoursInt}h ${fallback.totalMinutesRemainder}m`);

  const amountStr =
    amountM?.[1]?.trim() || `$${fallback.totalAmount.toFixed(2)}`;

  return { hoursLine, amountStr };
}

function buildPlainBody(params: {
  betweenPeriod: string;
  csvBasename: string;
  pdfBasename?: string;
  hoursLine: string;
  amountStr: string;
}): string {
  const sig =  "\nBest regards,";

  const attachmentLines = [
    `Attachment: ${params.csvBasename}`,
    ...(params.pdfBasename ? [`Attachment: ${params.pdfBasename}`] : []),
  ];

  return [
    "Dear Finance Team,",
    "",
    `Please find attached the invoice for services rendered ${params.betweenPeriod}.`,
    "",
    ...attachmentLines,
    "",
    `Total Hours: ${params.hoursLine}`,
    `Total Amount: ${params.amountStr}`,
    "",
    "Please don't hesitate to reach out if you need any additional information or clarification.",
    sig,
    "",
  ].join("\n");
}

function plainTextToHtmlFragment(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n\n+/)
    .map((block) => `<p style="margin:0 0 1em 0">${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function buildAlternativeHtmlBody(plainBody: string, signatureHtml: string): string {
  const main = plainTextToHtmlFragment(plainBody);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">${main}</div>${signatureHtml}`;
}

export async function sendInvoiceExportEmail(params: {
  range: TimeRange;
  result: ExportSnapshotForEmail;
  emailEnv?: InvoiceEmailEnv;
}): Promise<void> {
  const emailEnv = params.emailEnv ?? loadInvoiceEmailEnv();
  if (!emailEnv.enable) return;

  if (!emailEnv.gmailUser || !emailEnv.gmailAppPassword) {
    throw new Error("EMAIL_ENABLE=1 requires GMAIL_USER and GMAIL_APP_PASSWORD.");
  }
  if (emailEnv.toAddresses.length === 0) {
    throw new Error("EMAIL_ENABLE=1 requires EMAIL_TO (comma-separated addresses).");
  }

  const { range, result } = params;
  const { hoursLine, amountStr } = readSummaryHoursAndAmount(result.txtFilePath, result);

  const subject = formatInvoiceEmailSubject(range.start, range.end);
  const betweenPeriod = formatInvoiceBodyBetweenPeriod(range.start, range.end);
  const csvBasename = path.basename(result.csvFilePath);
  const pdfBasename =
    result.invoicePdfFilePath && fs.existsSync(result.invoicePdfFilePath)
      ? path.basename(result.invoicePdfFilePath)
      : undefined;
  const text = buildPlainBody({
    betweenPeriod,
    csvBasename,
    pdfBasename,
    hoursLine,
    amountStr,
  });

  const attachments: nodemailer.SendMailOptions["attachments"] = [
    {
      filename: path.basename(result.csvFilePath),
      content: fs.readFileSync(result.csvFilePath),
    },
  ];

  if (result.invoicePdfFilePath && fs.existsSync(result.invoicePdfFilePath)) {
    attachments.push({
      filename: path.basename(result.invoicePdfFilePath),
      content: fs.readFileSync(result.invoicePdfFilePath),
    });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailEnv.gmailUser,
      pass: emailEnv.gmailAppPassword,
    },
  });

  const html =
    emailEnv.signatureHtml.length > 0
      ? buildAlternativeHtmlBody(text, emailEnv.signatureHtml)
      : undefined;

  await transporter.sendMail({
    from: emailEnv.fromAddress,
    to: emailEnv.toAddresses.join(", "),
    subject,
    text,
    ...(html ? { html } : {}),
    attachments,
  });
}
