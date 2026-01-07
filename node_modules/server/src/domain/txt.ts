export type VoucherRow = {
  account: number;
  debit: number;
  credit: number;
  costCenter?: string;
  project?: string;
  description?: string;
};

const toNumber = (s: string): number => {
  const n = Number(String(s).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

const normalizeDate = (s: string | undefined): string | undefined => {
  if (!s) return undefined;
  const raw = s.trim();
  // Stöd YYYYMMDD → YYYY-MM-DD
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  // Låt redan formaterade datum passera (t.ex. YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return undefined;
};

export type TxtParseResult = {
  rows: VoucherRow[];
  inferredDate?: string;
  inferredDescription?: string;
};

const splitColumns = (raw: string): string[] => {
  if (raw.includes(";")) return raw.split(";");
  if (raw.includes("\t")) return raw.split("\t");
  if (raw.includes(",")) return raw.split(",");
  return raw.split(/\s+/);
};

// Mappning enligt krav:
// 1) kostnadsställe
// 2) konto
// 3) belopp (positiv -> debet, negativ -> kredit)
// 4) datum (samma på varje rad)
// sista) beskrivning (samma på alla)
export const parseTxt = (txt: string): TxtParseResult => {
  const rows: VoucherRow[] = [];
  let inferredDate: string | undefined;
  let inferredDescription: string | undefined;
  for (const line of txt.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) continue;
    const cols = splitColumns(raw).map((c) => c.trim());
    if (cols.length < 4) continue;
    const costCenter = cols[0] || undefined;
    const account = Number(cols[1]);
    if (!Number.isFinite(account)) continue;
    const amount = toNumber(cols[2]);
    const dateStr = normalizeDate(cols[3]);
    const description = cols[cols.length - 1] || undefined;
    if (!inferredDate) inferredDate = dateStr;
    if (!inferredDescription) inferredDescription = description;
    const debit = amount > 0 ? amount : 0;
    const credit = amount < 0 ? Math.abs(amount) : 0;
    rows.push({ account, debit, credit, costCenter, description });
  }
  return { rows, inferredDate, inferredDescription };
};

export const buildFortnoxVoucher = (args: {
  voucherSeries: string;
  description?: string;
  transactionDate: string; // YYYY-MM-DD
  rows: VoucherRow[];
}) => {
  const rows = args.rows.map((r) => ({
    Account: r.account,
    Debit: r.debit > 0 ? r.debit : 0,
    Credit: r.credit > 0 ? r.credit : 0,
    CostCenter: r.costCenter || undefined,
    Project: r.project || undefined,
    Description: r.description || args.description || undefined,
    TransactionInformation: r.description || args.description || undefined,
  }));
  return {
    Voucher: {
      Description: args.description ?? "",
      TransactionDate: args.transactionDate,
      VoucherSeries: args.voucherSeries,
      VoucherRows: rows,
    },
  };
};


