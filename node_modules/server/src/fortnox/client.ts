import { request } from "undici";

export const fortnoxGetJson = async (url: string, token: string) => {
  const res = await request(url, {
    method: "GET",
    headers: { Authorization: token, Accept: "application/json" }
  });
  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    throw new Error(`Fortnox GET failed ${res.statusCode} url=${url} body=${bodyText}`);
  }
  return res.body.json();
};

export const fortnoxGetText = async (url: string, token: string) => {
  const res = await request(url, {
    method: "GET",
    headers: { Authorization: token, Accept: "text/plain" }
  });
  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    const err: any = new Error(`Fortnox GET failed ${res.statusCode}`);
    err.fortnox = { statusCode: res.statusCode, body: bodyText };
    throw err;
  }
  return res.body.text();
};

export const fortnoxGetTextWithAccept = async (url: string, token: string, accept: string) => {
  const res = await request(url, {
    method: "GET",
    headers: { Authorization: token, Accept: accept }
  });
  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    const err: any = new Error(`Fortnox GET failed ${res.statusCode}`);
    err.fortnox = { statusCode: res.statusCode, body: bodyText };
    throw err;
  }
  return res.body.text();
};

export const fortnoxPostJson = async (url: string, token: string, body: unknown) => {
  const res = await request(url, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (res.statusCode >= 400) {
    const bodyText = await res.body.text();
    let parsed: any = null;
    try { parsed = JSON.parse(bodyText); } catch {}
    const friendlyMessage = parsed?.ErrorInformation?.message || parsed?.message || bodyText;
    const err: any = new Error(`Fortnox POST failed ${res.statusCode}: ${friendlyMessage}`);
    err.fortnox = { statusCode: res.statusCode, body: parsed ?? bodyText };
    throw err;
  }
  return res.body.json();
};

export const getMe = async (token: string) => {
  const url = `https://api.fortnox.se/3/me`;
  return fortnoxGetJson(url, token);
};

export const getCompanyInformation = async (token: string) => {
  const url = `https://api.fortnox.se/3/companyinformation`;
  return fortnoxGetJson(url, token);
};

/**
 * Hämta en specifik verifikation
 * Enligt Fortnox API: GET /3/vouchers/{VoucherSeries}/{VoucherNumber}?financialyear={financialyear}
 */
export const getVoucher = async (
  token: string,
  args: { series: string; number: number | string; financialYear: number | string }
) => {
  const url = `https://api.fortnox.se/3/vouchers/${encodeURIComponent(args.series)}/${encodeURIComponent(String(args.number))}?financialyear=${encodeURIComponent(String(args.financialYear))}`;
  return fortnoxGetJson(url, token);
};

export const getFinancialYearsByDate = async (token: string, date: string) => {
  const url = `https://api.fortnox.se/3/financialyears?date=${encodeURIComponent(date)}`;
  return fortnoxGetJson(url, token);
};

/**
 * Lista verifikationer för ett räkenskapsår
 */
export const listVouchers = async (
  token: string,
  args: {
    financialYear?: number | string;
    financialYearDate?: string;
    limit?: number;
    offset?: number;
  }
) => {
  const params: string[] = [];
  if (args.financialYear) params.push(`financialyear=${encodeURIComponent(String(args.financialYear))}`);
  if (args.financialYearDate) params.push(`financialyeardate=${encodeURIComponent(args.financialYearDate)}`);
  if (args.limit) params.push(`limit=${args.limit}`);
  if (args.offset) params.push(`offset=${args.offset}`);
  
  const url = `https://api.fortnox.se/3/vouchers${params.length > 0 ? '?' + params.join('&') : ''}`;
  return fortnoxGetJson(url, token);
};