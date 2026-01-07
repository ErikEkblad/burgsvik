# Web (React + Vite + TS)

Kör: npm run dev

## Inloggning

- Startsidan visar "Burgsvik" och en knapp "Logga in".
- Knappen startar Fortnox-aktiveringen direkt via GET `/api/auth/fortnox/start?state=...`.
- Ingen separat `/connect`‑sida används längre.

### Layout (utloggat läge)

- Delad vy 50/50 över hela höjden:
  - Vänster: mörkblå gradient (135°) `#0b1f33` → `#1e3a8a`, centrerad rubrik “Burgsvik”.
  - Höger: vit bakgrund, centrerad knapp “Logga in”.

## Automatisk vändning – WebSocket

- Sidan `settings/AutoReverse.tsx`:
  - Hämtar inställningar via GET `/api/settings` och sätter `active`.
  - Kör POST `/api/ws/add-current` endast när `active === true` för att initiera WS.
  - Hämtar status via GET `/api/ws/status` oavsett, för att visa aktuell status.
  - När `active` ändras till `false` och sparas, kommer servern att stoppa WS och status visar frånkopplad när anslutningen stängts.
  - UI: Moderna kort, badges (status), toggle‑switch för Aktiv, segmenterad kontroll för datumläge, dirty‑detektion (Spara avstängd tills ändring), sparindikator och Återställ‑knapp.