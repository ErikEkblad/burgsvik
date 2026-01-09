# Burgsvik - Supportmanual

**Version 1.0 | Januari 2026**

---

## Snabböversikt

**URL:** https://burgsvik.fyrtech.se

**Syfte:** Skapa verifikat i Fortnox från text + automatiska vändningsverifikat

**Två funktioner:**
1. **TXT till Verifikat** - Klistra in text → skapa verifikat
2. **Automatisk Vändning** - Övervakar serie X → skapar vändning i serie Y

---

## Vanliga supportärenden

### 1. "Jag kan inte logga in"

**Fråga användaren:**
- Har du ett aktivt Fortnox-konto?
- Kan du logga in i Fortnox direkt?

**Möjliga orsaker:**

| Problem | Lösning |
|---------|---------|
| Fel Fortnox-uppgifter | Be användaren testa inloggning på fortnox.se först |
| Företaget ej registrerat | Kontakta admin för att lägga till företaget i vitlistan |
| Cookies blockerade | Be användaren tillåta cookies från burgsvik.fyrtech.se |
| Sessionen har gått ut | Stäng webbläsaren och försök igen |

---

### 2. "Verifikatet går inte att bokföra"

**Kontrollera:**

| Symptom | Orsak | Lösning |
|---------|-------|---------|
| Knappen "Bokför" är grå | Verifikatet är inte i balans | Debet och kredit måste vara lika |
| "Invalid account" | Kontot finns inte | Kontrollera kontonumret i Fortnox |
| "Voucher series not found" | Serien finns inte | Skapa serien i Fortnox först |
| "Financial year is locked" | Låst räkenskapsår | Välj datum i öppet räkenskapsår |

**Tips:** Användaren ser alltid saldostatus längst ned i förhandsgranskningen:
- ✓ Grön = OK att bokföra
- ✕ Röd = Ej i balans

---

### 3. "Automatisk vändning fungerar inte"

**Checklista att gå igenom med användaren:**

1. **Är funktionen aktiverad?**
   - Gå till "Automatisk vändning"
   - Kontrollera att reglaget "Aktiv" är grönt/påslaget

2. **Är inställningarna sparade?**
   - Klicka på "Spara" efter ändringar

3. **Är anslutningen aktiv?**
   - På sidan visas "Ansluten till Fortnox" eller "Ej ansluten"
   - Om ej ansluten: vänta några sekunder, systemet återansluter automatiskt

4. **Matchar serien exakt?**
   - Utlösarserien måste matcha exakt (versaler/gemener spelar roll)
   - Om trigger är "R" måste verifikatet skapas i serie "R", inte "r"

5. **Skapades verifikatet i rätt serie?**
   - Vändning triggas endast av nya verifikat i utlösarserien

---

### 4. "Jag ser inte mina vändningar"

**Förklaring:** Vändningar visas under "Senaste vändningar" på sidan Automatisk vändning.

**Statusar:**
- ✅ Grön = Lyckad vändning
- ❌ Röd = Misslyckad (visa felmeddelandet för användaren)

**Om listan är tom:** Inga vändningar har skett ännu. Verifiera att inställningarna är korrekta.

---

### 5. "Hur ska jag formatera texten?"

**Grundformat (varje rad = en konteringsrad):**
```
Kostnadsställe, Konto, Belopp, Datum, Beskrivning
```

**Exempel:**
```
100, 1910, 5000, 20260115, Inbetalning
100, 3010, -5000, 20260115, Försäljning
```

**Regler:**
- Positivt belopp = Debet
- Negativt belopp = Kredit
- Datum: `YYYYMMDD` eller `YYYY-MM-DD`
- Separator: komma, semikolon eller tabb

---

### 6. "Felmeddelande: Unauthorized"

**Orsak:** Sessionen har gått ut.

**Lösning:** Be användaren logga ut och logga in igen.

---

### 7. "Vändningen fick fel datum"

**Förklaring av datumlägen:**

| Läge | Resultat |
|------|----------|
| Första dagen nästa månad | 15 jan → 1 feb |
| Datum från kommentar | Läser YYYY-MM-DD från verifikatets kommentar |

**Om fel läge är valt:** Gå till Automatisk vändning → ändra datumläge → Spara

---

## Snabbguide: Lägga till nytt företag

*För supportpersonal med backoffice-åtkomst*

1. Logga in på https://burgsvik.fyrtech.se/backoffice
2. Scrolla ned till "Tillåtna företag"
3. Klicka "Lägg till"
4. Ange:
   - **Databasnummer:** Fortnox DatabaseNumber (fås från kund eller Fortnox)
   - **Beskrivning:** Företagsnamn
5. Klicka "Spara"
6. Be kunden logga in igen

---

## Kontaktvägar vid eskalering

**Eskalera till utveckling om:**
- WebSocket visar "Ej ansluten" längre än 5 minuter
- Användare får felmeddelanden som inte finns i denna manual
- Verifikat skapas men syns inte i Fortnox
- Databasfel eller serverfel (500-fel)

---

## FAQ för support

**F: Kan användaren ångra ett bokfört verifikat?**
S: Nej, korrigeringar måste göras direkt i Fortnox.

**F: Kan man ha flera utlösarserier?**
S: Nej, endast en utlösarserie per företag stöds.

**F: Sparas textdata användaren skriver in?**
S: Nej, texten skickas endast till Fortnox och sparas inte i Burgsvik.

**F: Hur länge är sessionen aktiv?**
S: 7 dagar, men vid inaktivitet kan användaren behöva logga in igen.

**F: Vad händer om internet bryts under vändning?**
S: Systemet återansluter automatiskt. Verifikat som skapades under avbrottet kan missas.

---

*© 2026 Fyrtech AB*
