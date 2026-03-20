### README (English)

#### ClickUp Time Exporter – CLI & HTTP Service

Node.js CLI and service to export ClickUp time entries to CSV, a summary file, and an invoice PDF with the billing total. Supports fortnightly (or custom date range) exports, `.env` configuration, and optional automated runs via cron.

---

### 1. Requirements

- **Node.js** ≥ 22 (recommended)
- **pnpm** (or adapt commands to `npm` / `yarn`)
- A ClickUp account with:
  - **Personal API Token**
  - **Team (Workspace) ID**
---

### 2. Clone and Install

```bash
git clone <REPO_URL> clickup-time-exporter
cd clickup-time-exporter

pnpm install
```

---

### 3. Environment Configuration

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

`/.env.example`:

```env
CLICKUP_API_TOKEN=your_token_here
CLICKUP_TEAM_ID=your_team_id_here
HOURLY_RATE_USD=8

# Optional: invoice PDF (HTML -> PDF via Playwright)
INVOICE_PDF_ENABLE=1
INVOICE_CODE=in-1000
INVOICE_TO_NAME=SpringBolt, LLC
```

- **`CLICKUP_API_TOKEN`**: your personal API token (see below).
- **`CLICKUP_TEAM_ID`**: the ID of your ClickUp Team / Workspace.
- **`HOURLY_RATE_USD`**: your hourly rate (used to compute the total amount).
- **`INVOICE_PDF_ENABLE`**: set to `1` to generate `exports/invoice_*.pdf` after each export.

---

### 4. How to Get the ClickUp API Token

1. Log in to **ClickUp**.
2. Click your **avatar (profile picture)** in the bottom-left corner.
3. Go to **Settings**.
4. In the sidebar, open **Apps** or **My Apps** (depending on UI version).
5. Look for **API** / **API Token**.
6. Click **Generate** or **Show** and copy your **Personal API Token**.
7. Paste it into `.env`:

```env
CLICKUP_API_TOKEN=pk_XXXXXXXXXXXXXXXXXXXX
```

---

### 5. How to Get Your TEAM_ID (Workspace ID)

There are two easy ways:

#### Option A – Using the API

Make a simple `curl` request with your token:

```bash
curl -H "Authorization: YOUR_TOKEN_HERE" \
  https://api.clickup.com/api/v2/team
```

You will get a JSON response like:

```json
{
  "teams": [
    {
      "id": "12345678",
      "name": "My Workspace",
      ...
    }
  ]
}
```

Use the `"id"` value as `CLICKUP_TEAM_ID`:

```env
CLICKUP_TEAM_ID=12345678
```

#### Option B – From the URL (workspace)

1. Open ClickUp in the browser.
2. Navigate to any List/Task page; in many older URL formats you’ll see something like:

   - `https://app.clickup.com/12345678/v/...`

   In this case, `12345678` is typically your **Team ID**.

3. Confirm by checking with the API method above if you want to be sure.

---

### 6. How to Get Your USER_ID (Optional)

If you want to fix the user and not rely on auto-detection:

```bash
curl -H "Authorization: YOUR_TOKEN_HERE" \
  https://api.clickup.com/api/v2/user
```

Example response snippet:

```json
{
  "user": {
    "id": 987654321,
    "username": "your.name",
    ...
  }
}
```

Use that `id` as `CLICKUP_USER_ID` in `.env`:

```env
CLICKUP_USER_ID=987654321
```

---

### 7. Running the CLI (development)

This runs the CLI directly from TypeScript with live reload:

```bash
pnpm dev:cli
```

You will see an interactive prompt:

- Shows the **default fortnight range** (based on today).
- Asks if you want to manually set:
  - Start date (DD/MM/YYYY)
  - End date (DD/MM/YYYY)
- Asks for your hourly rate (default is `HOURLY_RATE_USD` from `.env`).
- Fetches time entries from ClickUp.
- Generates:
  - `exports/time-entries_<start>_to_<end>.csv`
  - `exports/summary_<start>_to_<end>.txt`
  - `exports/invoice_<INVOICE_CODE>_<start>_to_<end>.pdf` (if `INVOICE_PDF_ENABLE=1`)

`pdfmake` generates the PDF directly (no Chromium installation needed).

#### Optional: e-mail (Gmail) após o export

Com `EMAIL_ENABLE=1`, após gravar CSV, `summary` e PDF, o app envia um e-mail em inglês ao Finance com **CSV + PDF** em anexo (o PDF só entra se `INVOICE_PDF_ENABLE=1`).

Configure no `.env`:

- `GMAIL_USER` — conta Gmail
- `GMAIL_APP_PASSWORD` — [senha de app](https://myaccount.google.com/apppasswords) (não use a senha normal da conta)
- `EMAIL_TO` — destinatários separados por vírgula ou `;`
- Opcionais: `EMAIL_FROM` (default = `GMAIL_USER`), `EMAIL_SIGNATURE_NAME` (default = `INVOICE_FROM_NAME`)

O assunto segue o período, ex.: `Invoice - March 1st - March 15th, 2026`. Horas e valor no corpo são lidos do `summary_*.txt` gerado na mesma execução.

**Assinatura do Gmail:** envios por SMTP **não** usam a assinatura guardada em *Gmail → Configurações*. O repo inclui `email-signature.html` (contacto Springbolt) — ativa com `EMAIL_SIGNATURE_HTML_FILE=./email-signature.html` no `.env`. A primeira linha usa placeholders `{{SIGNATURE_DISPLAY_NAME}}` e `{{SIGNATURE_JOB_TITLE}}`, preenchidos por `EMAIL_SIGNATURE_DISPLAY_NAME` e `EMAIL_SIGNATURE_JOB_TITLE` (fallback do nome: `EMAIL_SIGNATURE_NAME`). Os clientes recebem `text/plain` + `text/html` com esse bloco no fim.

Se o envio falhar, o export dos arquivos **não** é desfeito; o erro aparece no log / resposta JSON (`emailError`).

---

### 8. Running the HTTP Server (development)

```bash
pnpm dev
```

The server starts and exposes:

- `GET /export/fortnight?start=YYYY-MM-DD&end=YYYY-MM-DD`  
  - If `start`/`end` are omitted, it uses the current fortnight rule.
  - Writes CSV, summary, and (optional) invoice PDF in `exports/`.

---

### 9. Build and Run in Production

Build the project to `dist`:

```bash
pnpm build
```

Run the server from the compiled JavaScript:

```bash
pnpm start      # node dist/server.js
pnpm cli        # node dist/server.js --cli
```

- `pnpm start`: starts the HTTP server + cron.
- `pnpm cli`: runs the CLI once (uses the same compiled code in `dist`).

---

### 10. Cron (automatic fortnight exports)

The HTTP server configures a cron job that runs:

- **Day 1** of every month at **01:00**
- **Day 16** of every month at **01:00**

For each run it:

- Computes the last fortnight range.
- Fetches your ClickUp time entries.
- Writes new CSV + summary files under `exports/` (and invoice PDF when `INVOICE_PDF_ENABLE=1`).

Make sure the server is running continuously (e.g. via systemd, PM2, Docker, etc.) if you want the cron behavior in production.