import { createSign } from "node:crypto";

export type SheetValue = string | number | boolean | null;

const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function credentials() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new Error("Google Sheets credentials are not configured.");
  return { clientEmail, privateKey };
}

export function spreadsheetId() {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "1XGrFyCW-fS5-rRiBMsjtWR8f4peHz_gu05Z4Qx3URH8";
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { clientEmail, privateKey } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({ iss: clientEmail, scope: SHEETS_SCOPE, aud: TOKEN_AUDIENCE, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${base64Url(signer.sign(privateKey))}`;
  const response = await fetch(TOKEN_AUDIENCE, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status}).`);
  const payload = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return cachedToken.value;
}

async function googleFetch(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google Sheets request failed (${response.status}).`);
  return response;
}

export async function readSheet(range: string) {
  const response = await googleFetch(`/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
  const payload = await response.json() as { values?: unknown[][] };
  return payload.values ?? [];
}

export async function replaceSheetTables(tables: Array<{ sheet: string; rows: SheetValue[][] }>) {
  await googleFetch(`/values:batchClear`, {
    method: "POST",
    body: JSON.stringify({ ranges: tables.map((table) => `'${table.sheet}'!A2:ZZ`) }),
  });
  await googleFetch(`/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: tables.map((table) => ({ range: `'${table.sheet}'!A1`, majorDimension: "ROWS", values: table.rows })),
    }),
  });
}
