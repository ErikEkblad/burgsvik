"use strict";
// Minimal SIE3 parser för att summera belopp per konto
// Antag att rader innehåller kontosträngar typ #TRANS 3010 {kostnadsställe?} {belopp}
// Detta är en förenklad parser; kan bytas mot robust variant senare.
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeByAccount = void 0;
const parseAmount = (s) => {
    // SIE kan ha komma som decimal; ersätt med punkt
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};
const summarizeByAccount = (sieText) => {
    const lines = sieText.split(/\r?\n/);
    const map = new Map();
    for (const line of lines) {
        // mycket förenklad matchning: hitta mönster ' #TRANS <konto> ... <belopp>'
        if (line.includes("#TRANS")) {
            const tokens = line.trim().split(/\s+/);
            const idx = tokens.indexOf("#TRANS");
            if (idx >= 0 && tokens.length > idx + 2) {
                const account = Number(tokens[idx + 1]);
                const maybeAmount = tokens[tokens.length - 1];
                if (Number.isFinite(account)) {
                    const amount = parseAmount(maybeAmount);
                    const prev = map.get(account) ?? 0;
                    map.set(account, prev + amount);
                }
            }
        }
    }
    return Array.from(map.entries()).map(([account, amount]) => ({ account, amount }));
};
exports.summarizeByAccount = summarizeByAccount;
