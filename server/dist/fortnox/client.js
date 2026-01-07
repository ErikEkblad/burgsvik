"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listVouchers = exports.getFinancialYearsByDate = exports.getVoucher = exports.getCompanyInformation = exports.getMe = exports.fortnoxPostJson = exports.fortnoxGetTextWithAccept = exports.fortnoxGetText = exports.fortnoxGetJson = void 0;
const undici_1 = require("undici");
const fortnoxGetJson = async (url, token) => {
    const res = await (0, undici_1.request)(url, {
        method: "GET",
        headers: { Authorization: token, Accept: "application/json" }
    });
    if (res.statusCode >= 400) {
        const bodyText = await res.body.text();
        throw new Error(`Fortnox GET failed ${res.statusCode} url=${url} body=${bodyText}`);
    }
    return res.body.json();
};
exports.fortnoxGetJson = fortnoxGetJson;
const fortnoxGetText = async (url, token) => {
    const res = await (0, undici_1.request)(url, {
        method: "GET",
        headers: { Authorization: token, Accept: "text/plain" }
    });
    if (res.statusCode >= 400) {
        const bodyText = await res.body.text();
        const err = new Error(`Fortnox GET failed ${res.statusCode}`);
        err.fortnox = { statusCode: res.statusCode, body: bodyText };
        throw err;
    }
    return res.body.text();
};
exports.fortnoxGetText = fortnoxGetText;
const fortnoxGetTextWithAccept = async (url, token, accept) => {
    const res = await (0, undici_1.request)(url, {
        method: "GET",
        headers: { Authorization: token, Accept: accept }
    });
    if (res.statusCode >= 400) {
        const bodyText = await res.body.text();
        const err = new Error(`Fortnox GET failed ${res.statusCode}`);
        err.fortnox = { statusCode: res.statusCode, body: bodyText };
        throw err;
    }
    return res.body.text();
};
exports.fortnoxGetTextWithAccept = fortnoxGetTextWithAccept;
const fortnoxPostJson = async (url, token, body) => {
    const res = await (0, undici_1.request)(url, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
    });
    if (res.statusCode >= 400) {
        const bodyText = await res.body.text();
        let parsed = null;
        try {
            parsed = JSON.parse(bodyText);
        }
        catch { }
        const friendlyMessage = parsed?.ErrorInformation?.message || parsed?.message || bodyText;
        const err = new Error(`Fortnox POST failed ${res.statusCode}: ${friendlyMessage}`);
        err.fortnox = { statusCode: res.statusCode, body: parsed ?? bodyText };
        throw err;
    }
    return res.body.json();
};
exports.fortnoxPostJson = fortnoxPostJson;
const getMe = async (token) => {
    const url = `https://api.fortnox.se/3/me`;
    return (0, exports.fortnoxGetJson)(url, token);
};
exports.getMe = getMe;
const getCompanyInformation = async (token) => {
    const url = `https://api.fortnox.se/3/companyinformation`;
    return (0, exports.fortnoxGetJson)(url, token);
};
exports.getCompanyInformation = getCompanyInformation;
/**
 * Hämta en specifik verifikation
 * Enligt Fortnox API: GET /3/vouchers/{VoucherSeries}/{VoucherNumber}?financialyear={financialyear}
 */
const getVoucher = async (token, args) => {
    const url = `https://api.fortnox.se/3/vouchers/${encodeURIComponent(args.series)}/${encodeURIComponent(String(args.number))}?financialyear=${encodeURIComponent(String(args.financialYear))}`;
    return (0, exports.fortnoxGetJson)(url, token);
};
exports.getVoucher = getVoucher;
const getFinancialYearsByDate = async (token, date) => {
    const url = `https://api.fortnox.se/3/financialyears?date=${encodeURIComponent(date)}`;
    return (0, exports.fortnoxGetJson)(url, token);
};
exports.getFinancialYearsByDate = getFinancialYearsByDate;
/**
 * Lista verifikationer för ett räkenskapsår
 */
const listVouchers = async (token, args) => {
    const params = [];
    if (args.financialYear)
        params.push(`financialyear=${encodeURIComponent(String(args.financialYear))}`);
    if (args.financialYearDate)
        params.push(`financialyeardate=${encodeURIComponent(args.financialYearDate)}`);
    if (args.limit)
        params.push(`limit=${args.limit}`);
    if (args.offset)
        params.push(`offset=${args.offset}`);
    const url = `https://api.fortnox.se/3/vouchers${params.length > 0 ? '?' + params.join('&') : ''}`;
    return (0, exports.fortnoxGetJson)(url, token);
};
exports.listVouchers = listVouchers;
