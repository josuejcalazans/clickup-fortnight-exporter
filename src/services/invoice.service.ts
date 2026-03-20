import fs from "node:fs";
import path from "node:path";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

import type { TimeRange } from "../utils/time";

export interface InvoiceInput {
  timeRange: TimeRange;
  totalAmount: number; // USD total
  totalHoursDecimal: number;
}

export interface InvoiceEnv {
  enablePdf: boolean;

  invoiceCode: string; // e.g. "in-1000"
  issueDateSource: "end" | "now";
  dueDays: number;

  fromName: string;
  fromCnpj: string;
  fromAddress: string;
  fromPhone: string;
  fromEmail: string;

  toName: string;

  serviceTitle: string;
  serviceDescriptionTemplate: string; // supports placeholders
}

function toBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function replaceAllSafe(text: string, search: string, replacement: string): string {
  // ES2020: avoid String.prototype.replaceAll typings/runtime.
  return text.split(search).join(replacement);
}

function getNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function loadInvoiceEnv(): InvoiceEnv {
  const defaultServiceDescriptionTemplate =
    [
      "Software Development as per agreement.",
      "Date of service: {startMonthDayOrdinal} and {endMonthDayOrdinal}, {year}.",
    ].join("\n");

  const rawServiceDescriptionTemplate =
    process.env.INVOICE_SERVICE_DESCRIPTION_TEMPLATE ?? defaultServiceDescriptionTemplate;

  // Support both real newlines and the escaped sequence "\n" in .env files.
  const serviceDescriptionTemplate = replaceAllSafe(rawServiceDescriptionTemplate, "\\n", "\n");

  return {
    enablePdf: toBool(process.env.INVOICE_PDF_ENABLE ?? "1"),

    invoiceCode: process.env.INVOICE_CODE ?? "in-1000",
    issueDateSource: (process.env.INVOICE_ISSUE_DATE_SOURCE as "end" | "now") ??
      "end",
    dueDays: getNumber(process.env.INVOICE_DUE_DAYS, 13),

    fromName: process.env.INVOICE_FROM_NAME ?? "",
    fromCnpj: process.env.INVOICE_FROM_CNPJ ?? "",
    fromAddress: process.env.INVOICE_FROM_ADDRESS ?? "",
    fromPhone: process.env.INVOICE_FROM_PHONE ?? "",
    fromEmail: process.env.INVOICE_FROM_EMAIL ?? "",

    toName: process.env.INVOICE_TO_NAME ?? "",

    serviceTitle: process.env.INVOICE_SERVICE_TITLE ?? "Software Development",
    serviceDescriptionTemplate,
  };
}

function formatMoneyUsdPtBr(amount: number): string {
  // pt-BR format: 3000 -> "3.000,00"
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatUsdDisplay(amount: number): string {
  // Screenshot 2 style: "$2,333.00"
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function formatUsDate(date: Date): string {
  // MM/DD/YYYY
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function monthNameEnglish(monthIndex: number): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[monthIndex] ?? "";
}

function ordinalEnglish(day: number): string {
  const mod10 = day % 10;
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function escapeHtml(text: string): string {
  // pdfmake escapes automatically; keep function for now to reuse text builder.
  // (No HTML output is generated anymore, but we keep this to avoid larger diffs.)
  return text;
}

function buildServiceDescription(env: InvoiceEnv, timeRange: TimeRange): string {
  const start = new Date(timeRange.start);
  const end = new Date(timeRange.end);

  const year = String(end.getFullYear());
  const startMonthDayOrdinal = `${monthNameEnglish(start.getMonth())} ${ordinalEnglish(start.getDate())}`;
  const endMonthDayOrdinal = `${monthNameEnglish(end.getMonth())} ${ordinalEnglish(end.getDate())}`;

  return env.serviceDescriptionTemplate
    .split("{startMonthDayOrdinal}").join(startMonthDayOrdinal)
    .split("{endMonthDayOrdinal}").join(endMonthDayOrdinal)
    .split("{year}").join(year);
}

function formatUsDateMMDDYYYY(timestampOrDate: number | Date): string {
  const date = timestampOrDate instanceof Date ? timestampOrDate : new Date(timestampOrDate);
  // MM/DD/YYYY
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

/** Só arredonda o topo; a base fica reta (o `rect` do pdfmake aplica r nos quatro cantos). */
function roundedTopRectPolylinePoints(params: {
  w: number;
  h: number;
  r: number;
  steps?: number;
}): { x: number; y: number }[] {
  const { w, h, steps = 12 } = params;
  const r = Math.min(params.r, w / 2, h / 2);
  if (r <= 0) {
    return [
      { x: 0, y: h },
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
    ];
  }

  const pts: { x: number; y: number }[] = [];
  pts.push({ x: 0, y: h }, { x: 0, y: r });

  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    pts.push({ x: r - r * Math.cos(t), y: r - r * Math.sin(t) });
  }

  pts.push({ x: w - r, y: 0 });

  for (let i = 1; i <= steps; i++) {
    const θ = (-Math.PI / 2) + (i / steps) * (Math.PI / 2);
    pts.push({ x: w - r + r * Math.cos(θ), y: r + r * Math.sin(θ) });
  }

  pts.push({ x: w, y: h });
  return pts;
}


function buildInvoiceDocDefinition(params: {
  env: InvoiceEnv;
  input: InvoiceInput;
}): unknown {
  const { env, input } = params;

  const issueDate = env.issueDateSource === "now" ? new Date() : new Date(input.timeRange.end);
  const dueDate = new Date(issueDate.getTime());
  dueDate.setDate(dueDate.getDate() + env.dueDays);

  const serviceDescription = buildServiceDescription(env, input.timeRange);
  const serviceDescriptionLines = serviceDescription
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  // ── Cores ──────────────────────────────────────────────────
  const purple = "#5b21b6";   // roxo escuro
  const muted  = "#6b7280";
  const text   = "#111827";

  // ── Dimensões ──────────────────────────────────────────────
  const cardWidth       = 520;
  const cardRadius      = 14;
  const headerHeight    = 220;  // um pouco mais alto para respirar
  const serviceBoxRadius = 12;
  const serviceBoxHeight = 72 + Math.max(0, serviceDescriptionLines.length - 1) * 14;
  const bodyWidth       = cardWidth - 24;
  const bodyBg          = "#f8f7fc";
  const bodyBgHeight    = 330;
  const headerCanvasH   = headerHeight + cardRadius;
  const headerPurplePoints = roundedTopRectPolylinePoints({
    w: cardWidth,
    h: headerCanvasH,
    r: cardRadius,
  });

  const providerLines = [
    { text: env.fromName,    style: "providerNameWhite" },
    { text: env.fromCnpj,   style: "providerMetaWhite" },
    env.fromAddress ? { text: env.fromAddress, style: "providerMetaWhite" } : undefined,
    env.fromPhone   ? { text: env.fromPhone,   style: "providerMetaWhite" } : undefined,
    env.fromEmail   ? { text: env.fromEmail,   style: "providerMetaWhite" } : undefined,
  ].filter(Boolean);

  // vfs_fonts only ships Roboto; without a matching `fonts` entry pdfmake throws
  // "Font 'Helvetica' ... is not defined in the font section".
  const fonts = {
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  };

  return {
    pageSize: "A4",
    pageMargins: [0, 0, 0, 0],
    fonts,
    defaultStyle: { font: "Roboto", color: text },
    styles: {
      // ── Header ────────────────────────────────────────────
      providerNameWhite: { font: "Roboto", fontSize: 18, bold: true,  color: "white", characterSpacing: 0.3 },
      providerMetaWhite: { font: "Roboto", fontSize: 10, bold: false, color: "white", characterSpacing: 0.2, lineHeight: 1.5 },

      invoiceLabelWhite: { font: "Roboto", fontSize: 24, bold: true,  color: "white", characterSpacing: 2 },
      invoiceCodeWhite:  { font: "Roboto", fontSize: 11, bold: false, color: "white", characterSpacing: 0.3 },

      sectionLabelWhite: { font: "Roboto", fontSize: 10, bold: true,  color: "white", characterSpacing: 1.5 },
      toNameWhite:       { font: "Roboto", fontSize: 15, bold: false, color: "white", characterSpacing: 0.2 },

      dateHeaderWhite: { font: "Roboto", fontSize: 10, bold: true,  color: "white", characterSpacing: 1.5 },
      dateValueWhite:  { font: "Roboto", fontSize: 13, bold: true,  color: "white", characterSpacing: 0.2 },

      // ── Body ──────────────────────────────────────────────
      serviceBoxTitle:  { font: "Roboto", fontSize: 16, bold: true,  color: text },
      serviceBoxDesc:   { font: "Roboto", fontSize: 10.5, bold: false, color: "#4b5563", lineHeight: 1.4 },
      serviceBoxAmount: { font: "Roboto", fontSize: 14, bold: true,  color: text },

      amountPayableLabel: { font: "Roboto", fontSize: 10, bold: true,  color: muted, characterSpacing: 1 },
      amountPayableValue: { font: "Roboto", fontSize: 18, bold: true,  color: text },

      footerText: { font: "Roboto", fontSize: 9, bold: false, color: "#9ca3af" },
    },
    content: [
      {
        columns: [
          { width: "*", text: "" },
          {
            width: cardWidth,
            stack: [
              // ── Header roxo escuro ───────────────────────
              {
                stack: [
                  {
                    canvas: [
                      {
                        type: "polyline",
                        points: headerPurplePoints,
                        closePath: true,
                        color: purple,
                        lineWidth: 0,
                      },
                    ],
                  },
                  {
                    margin: [0, -headerCanvasH, 0, 0],
                    table: {
                      widths: [cardWidth],
                      body: [
                        [
                          {
                            // Transparente: o roxo é só o canvas com `r`; fill na célula apagava os cantos.
                            border: [false, false, false, false],
                            margin: [30, 28, 30, 28],   // padding generoso
                            stack: [
                              // Linha 1: nome da empresa + "INVOICE"
                              {
                                columns: [
                                  { width: "*",    stack: [...providerLines] },
                                  {
                                    width: "auto",
                                    stack: [
                                      { text: "INVOICE",          style: "invoiceLabelWhite", alignment: "right" },
                                      { text: `Nº ${env.invoiceCode}`, style: "invoiceCodeWhite",  alignment: "right", margin: [0, 5, 0, 0] },
                                    ],
                                  },
                                ],
                              },

                              // Linha 2: INVOICE TO
                              {
                                stack: [
                                  { text: "INVOICE TO", style: "sectionLabelWhite" },
                                  { text: env.toName,   style: "toNameWhite", margin: [0, 5, 0, 0] },
                                ],
                                margin: [0, 20, 0, 0],
                              },

                              // Linha 3: datas
                              {
                                columns: [
                                  {
                                    width: "*",
                                    stack: [
                                      { text: "ISSUE DATE",                    style: "dateHeaderWhite" },
                                      { text: formatUsDateMMDDYYYY(issueDate), style: "dateValueWhite", margin: [0, 4, 0, 0] },
                                    ],
                                  },
                                  {
                                    width: "*",
                                    stack: [
                                      { text: "DUE DATE",                    style: "dateHeaderWhite" },
                                      { text: formatUsDateMMDDYYYY(dueDate), style: "dateValueWhite", margin: [0, 4, 0, 0] },
                                    ],
                                  },
                                ],
                                margin: [0, 18, 0, 0],
                              },
                            ],
                          },
                        ],
                      ],
                    },
                    layout: "noBorders",
                  },
                ],
                margin: [0, 20, 0, 0],   // 20pt do topo da página (sem borda cinza)
              },

              // ── Body ─────────────────────────────────────
              {
                stack: [
                  // Fundo body
                  {
                    canvas: [
                      {
                        type: "rect",
                        x: 0, y: 0,
                        w: cardWidth,
                        h: bodyBgHeight,
                        r: 0,
                        color: bodyBg,
                        lineWidth: 0,
                      },
                    ],
                    margin: [0, -8, 0, 0],
                  },

                  // Service box (branco arredondado)
                  {
                    margin: [0, -(bodyBgHeight - 8), 0, 0],
                    stack: [
                      {
                        canvas: [
                          {
                            type: "rect",
                            x: 12, y: 0,
                            w: bodyWidth,
                            h: serviceBoxHeight,
                            r: serviceBoxRadius,
                            color: "#ffffff",
                            lineWidth: 0,
                          },
                        ],
                      },
                      {
                        margin: [0, -serviceBoxHeight, 0, 0],
                        table: {
                          widths: ["*", "auto"],
                          body: [
                            [
                              {
                                border: [false, false, false, false],
                                margin: [28, 16, 16, 16],
                                stack: [
                                  { text: env.serviceTitle, style: "serviceBoxTitle", margin: [0, 0, 0, 6] },
                                  ...serviceDescriptionLines.map((line) => ({
                                    text: line,
                                    style: "serviceBoxDesc",
                                  })),
                                ],
                              },
                              {
                                border: [false, false, false, false],
                                margin: [16, 16, 28, 16],
                                text: formatUsdDisplay(input.totalAmount),
                                style: "serviceBoxAmount",
                                alignment: "right",
                              },
                            ],
                          ],
                        },
                        layout: "noBorders",
                      },
                    ],
                  },

                  // Amount payable
                  {
                    columns: [
                      { text: "", width: "*" },
                      {
                        width: "auto",
                        stack: [
                          { text: "AMOUNT PAYABLE",               style: "amountPayableLabel", alignment: "right" },
                          { text: formatUsdDisplay(input.totalAmount), style: "amountPayableValue", alignment: "right", margin: [0, 5, 0, 0] },
                        ],
                      },
                    ],
                    margin: [0, 18, 12, 0],
                  },

                  // Separador
                  {
                    canvas: [
                      { type: "line", x1: 0, y1: 0, x2: cardWidth, y2: 0, lineWidth: 1, lineColor: "#e5e7eb" },
                    ],
                    margin: [0, 16, 0, 0],
                  },

                  {
                    margin: [0, 10, 12, 16],
                    text: "Invoice generated by iUrdex Tech system",
                    style: "footerText",
                    alignment: "right",
                  },
                ],
              },
            ],
          },
          { width: "*", text: "" },
        ],
      },
    ],
    _meta: { version: 1 },
  };
}

export async function generateInvoicePdf(params: {
  env: InvoiceEnv;
  input: InvoiceInput;
  outputPdfPath: string;
}): Promise<void> {
  const { env, input, outputPdfPath } = params;
  if (!env.enablePdf) return;

  const dir = path.dirname(outputPdfPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Bind virtual file system fonts (pdfmake expects vfs to be an object of fontName -> base64).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfMake as any).vfs = pdfFonts as any;

  const docDefinition = buildInvoiceDocDefinition({ env, input }) as Record<string, unknown>;

  // pdfmake@0.3.7: callback em getBuffer pode não funcionar em Node; use o return Promise.
  const pdfDoc = (pdfMake as any).createPdf(docDefinition);
  const buffer = await pdfDoc.getBuffer();
  fs.writeFileSync(outputPdfPath, buffer as Buffer);
}

