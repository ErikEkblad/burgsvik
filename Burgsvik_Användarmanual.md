# Användarmanual - Burgsvik

**Version 1.0**
**Datum: Januari 2026**

---

## Innehållsförteckning

1. [Introduktion](#1-introduktion)
2. [Komma igång](#2-komma-igång)
   - 2.1 Logga in
   - 2.2 Navigering i systemet
   - 2.3 Logga ut
3. [TXT till Verifikat](#3-txt-till-verifikat)
   - 3.1 Översikt
   - 3.2 Textformat
   - 3.3 Skapa ett verifikat steg för steg
   - 3.4 Förhandsgranska och validera
   - 3.5 Bokföra verifikatet
4. [Automatisk Vändning](#4-automatisk-vändning)
   - 4.1 Vad är automatisk vändning?
   - 4.2 Aktivera funktionen
   - 4.3 Konfigurera inställningar
   - 4.4 Datumberäkning
   - 4.5 Övervaka vändningar
   - 4.6 Historik
5. [Felsökning](#5-felsökning)
6. [Vanliga frågor (FAQ)](#6-vanliga-frågor-faq)

---

## 1. Introduktion

Burgsvik är ett integrationsverktyg som kopplar ihop textbaserad bokföringsdata med Fortnox. Systemet erbjuder två huvudfunktioner:

- **TXT till Verifikat** - Konvertera textfiler till verifikat i Fortnox
- **Automatisk Vändning** - Skapa automatiska vändningsverifikat baserat på regler du konfigurerar

Systemet är tillgängligt via webbläsaren på **burgsvik.fyrtech.se**.

---

## 2. Komma igång

### 2.1 Logga in

1. Öppna din webbläsare och gå till **burgsvik.fyrtech.se**
2. Du möts av en inloggningssida
3. Klicka på **"Logga in med Fortnox"**
4. Du omdirigeras till Fortnox inloggningssida
5. Logga in med dina Fortnox-uppgifter
6. Godkänn att Burgsvik får åtkomst till ditt Fortnox-konto
7. Du omdirigeras tillbaka till Burgsvik och är nu inloggad

**Tips:** Du behöver ha ett aktivt Fortnox-konto och behörighet att skapa verifikat för att kunna använda systemet.

### 2.2 Navigering i systemet

När du är inloggad ser du ett sidofält (meny) till vänster med följande alternativ:

| Menyval | Beskrivning |
|---------|-------------|
| **TXT till Verifikat** | Skapa verifikat från textdata |
| **Automatisk vändning** | Konfigurera automatiska vändningsverifikat |

I sidofältet visas även information om ditt företag och ditt användarnamn.

### 2.3 Logga ut

För att logga ut:

1. Klicka på **"Logga ut"**-knappen i sidofältet
2. Du loggas ut och omdirigeras till inloggningssidan

---

## 3. TXT till Verifikat

### 3.1 Översikt

Funktionen "TXT till Verifikat" låter dig snabbt skapa verifikat i Fortnox genom att klistra in textdata. Systemet tolkar automatiskt din text och skapar ett korrekt formaterat verifikat.

### 3.2 Textformat

Systemet förstår text som är separerad med komma, semikolon eller tabb. Varje rad representerar en verifikatsrad med följande struktur:

```
[Kostnadsställe] [Kontonummer] [Belopp] [Datum] [Beskrivning]
```

**Regler för belopp:**
- **Positivt belopp** = Debet
- **Negativt belopp** = Kredit

**Datumformat som stöds:**
- `YYYYMMDD` (t.ex. 20260115)
- `YYYY-MM-DD` (t.ex. 2026-01-15)

**Exempel på textinput:**

```
100, 1910, 5000, 20260115, Inbetalning från kund
100, 3010, -5000, 20260115, Försäljning tjänster
```

Detta skapar ett verifikat med:
- Rad 1: Kostnadsställe 100, konto 1910, 5000 kr i debet
- Rad 2: Kostnadsställe 100, konto 3010, 5000 kr i kredit

### 3.3 Skapa ett verifikat steg för steg

1. **Navigera till funktionen**
   - Klicka på **"TXT till Verifikat"** i menyn

2. **Klistra in eller skriv din text**
   - I det stora textfältet skriver eller klistrar du in din bokföringsdata
   - Systemet börjar automatiskt tolka texten

3. **Ange verifikatserie**
   - I fältet **"Verifikatserie"** anger du vilken serie verifikatet ska bokföras på
   - Exempel: "A", "B", "C" etc.

4. **Ange transaktionsdatum**
   - I fältet **"Transaktionsdatum"** väljer du datum för verifikatet
   - Om datum finns i texten föreslås detta automatiskt
   - Annars används dagens datum som förval

5. **Lägg till beskrivning**
   - I fältet **"Beskrivning"** skriver du en valfri beskrivning av verifikatet
   - Denna text visas i Fortnox som verifikatets beskrivning

### 3.4 Förhandsgranska och validera

Till höger på skärmen visas en **förhandsgranskning** av ditt verifikat i realtid. Tabellen visar:

| Kolumn | Beskrivning |
|--------|-------------|
| Kostnadsställe | Eventuellt kostnadsställe |
| Konto | Kontonummer |
| Debet | Debetbelopp (kr) |
| Kredit | Kreditbelopp (kr) |
| Beskrivning | Radbeskrivning |

**Saldokontroll:**

Längst ned i förhandsgranskningen visas:
- **Total debet** - Summan av alla debetposter
- **Total kredit** - Summan av alla kreditposter
- **Saldostatus:**
  - ✓ **Saldo OK** (grön) - Verifikatet är i balans och kan bokföras
  - ✕ **Ej i balans** (röd) - Verifikatet går inte att bokföra

### 3.5 Bokföra verifikatet

1. Kontrollera att förhandsgranskningen ser korrekt ut
2. Kontrollera att saldo visas som **"Saldo OK"**
3. Klicka på knappen **"Bokför verifikat"**

**Efter bokföring:**

- En dialogruta visas med resultatet
- Vid **lyckat resultat**: Du ser verifikatserie och verifikatnummer (t.ex. "A-123")
- Vid **fel**: Du ser ett felmeddelande som förklarar vad som gick fel
- Klicka på **"Stäng"** för att stänga dialogrutan

---

## 4. Automatisk Vändning

### 4.1 Vad är automatisk vändning?

Automatisk vändning är en funktion som övervakar när nya verifikat skapas i Fortnox. När ett verifikat skapas i en specifik serie (utlösarserie), skapar systemet automatiskt ett vändningsverifikat i en annan serie (målserie).

**Vändningsverifikatet:**
- Har samma konteringar som originalverifikatet
- Men med **omvända belopp** (debet blir kredit och vice versa)
- Bokförs på ett datum du konfigurerar

**Användningsområde:** Detta är användbart för periodiseringar där du vill att en transaktion automatiskt ska vändas vid nästa period.

### 4.2 Aktivera funktionen

1. Klicka på **"Automatisk vändning"** i menyn
2. Leta upp reglaget/brytaren **"Aktiv"**
3. Klicka på reglaget för att aktivera funktionen
4. Reglaget blir grönt när funktionen är aktiv

**Obs!** Funktionen börjar inte övervaka förrän du har sparat dina inställningar.

### 4.3 Konfigurera inställningar

Följande inställningar behöver konfigureras:

| Inställning | Beskrivning | Exempel |
|-------------|-------------|---------|
| **Utlösarserie** | Vilken verifikatserie som ska utlösa en automatisk vändning | "R" |
| **Målserie** | Vilken verifikatserie vändningsverifikatet ska bokföras på | "Q" |
| **Datumläge** | Hur datum för vändningsverifikatet ska beräknas | Se avsnitt 4.4 |

**Steg för att konfigurera:**

1. Ange önskad **utlösarserie** (t.ex. "R")
2. Ange önskad **målserie** (t.ex. "Q")
3. Välj **datumläge** (se nedan)
4. Klicka på **"Spara"**

### 4.4 Datumberäkning

Du kan välja mellan två sätt att beräkna datum för vändningsverifikatet:

**Alternativ 1: Första dagen nästa månad**
- Vändningsverifikatet får datum = transaktionsdatum + 1 månad, men på den 1:a
- Exempel: Original daterat 2026-01-15 → Vändning daterad 2026-02-01

**Alternativ 2: Datum från kommentar**
- Systemet läser av datum från originalverifikatets kommentarfält
- Datumet måste vara i formatet YYYY-MM-DD
- Exempel: Om kommentaren innehåller "Vändningsdatum: 2026-03-01" används det datumet

### 4.5 Övervaka vändningar

På sidan för automatisk vändning kan du se:

**Anslutningsstatus:**
- Visar om systemet är anslutet till Fortnox
- **"Ansluten till Fortnox"** = Systemet övervakar aktivt
- **"Ej ansluten"** = Övervakning är inaktiv

**Senaste händelse:**
- Visar tidpunkt för senast mottagna händelse från Fortnox

### 4.6 Historik

Under **"Senaste vändningar"** visas en historik över utförda vändningar:

| Information | Beskrivning |
|-------------|-------------|
| Källa | Originalverifikatets serie och nummer |
| Mål | Vändningsverifikatets serie och nummer |
| Räkenskapsår | Vilket räkenskapsår vändningen gäller |
| Status | Lyckat (✓) eller Misslyckat (✕) |

**Statusar:**
- ✅ **Lyckad** - Vändningsverifikatet skapades korrekt
- ❌ **Misslyckad** - Något gick fel (felmeddelande visas)

---

## 5. Felsökning

### Problem: Kan inte logga in

**Möjliga orsaker:**
- Felaktiga Fortnox-inloggningsuppgifter
- Ditt företag är inte registrerat i Burgsvik
- Cookies är blockerade i webbläsaren

**Lösning:**
1. Kontrollera att du använder rätt Fortnox-uppgifter
2. Kontakta din administratör för att verifiera att ditt företag är registrerat
3. Tillåt cookies från burgsvik.fyrtech.se

### Problem: Verifikatet går inte att bokföra

**Möjliga orsaker:**
- Verifikatet är inte i balans (debet ≠ kredit)
- Ogiltigt kontonummer
- Verifikatserien finns inte i Fortnox
- Datumet ligger utanför öppet räkenskapsår

**Lösning:**
1. Kontrollera att saldo visas som "Saldo OK"
2. Verifiera att alla kontonummer finns i din kontoplan
3. Kontrollera att verifikatserien är korrekt
4. Se till att datumet ligger inom ett öppet räkenskapsår i Fortnox

### Problem: Automatisk vändning fungerar inte

**Möjliga orsaker:**
- Funktionen är inte aktiverad
- Inställningarna är inte sparade
- Anslutningen till Fortnox är bruten
- Utlösarserien matchar inte det nya verifikatet

**Lösning:**
1. Kontrollera att reglaget "Aktiv" är påslaget
2. Klicka på "Spara" för att säkerställa att inställningarna är sparade
3. Kontrollera anslutningsstatus på sidan
4. Verifiera att utlösarserien matchar exakt (versaler/gemener spelar roll)

### Problem: Felmeddelande vid bokföring

**Vanliga felmeddelanden:**

| Felmeddelande | Betydelse | Lösning |
|---------------|-----------|---------|
| "Invalid account" | Kontot finns inte | Kontrollera kontonumret i Fortnox |
| "Voucher series not found" | Serien finns inte | Skapa serien i Fortnox först |
| "Financial year is locked" | Räkenskapsåret är låst | Välj ett datum i ett öppet år |
| "Unauthorized" | Sessionen har gått ut | Logga ut och in igen |

---

## 6. Vanliga frågor (FAQ)

**F: Kan jag ångra ett bokfört verifikat?**
S: Nej, när ett verifikat är bokfört i Fortnox måste du hantera eventuella korrigeringar direkt i Fortnox.

**F: Fungerar systemet med alla Fortnox-versioner?**
S: Systemet kräver att du har en Fortnox-licens som inkluderar API-åtkomst och möjlighet att skapa verifikat.

**F: Kan jag ha flera utlösarserier för automatisk vändning?**
S: För närvarande stöds endast en utlösarserie per företag.

**F: Vad händer om Fortnox-anslutningen bryts?**
S: Systemet försöker automatiskt återansluta. Eventuella verifikat som skapas under avbrottet kan missas av den automatiska vändningen.

**F: Sparas min textdata någonstans?**
S: Nej, texten du skriver in sparas inte. Den används endast för att skapa verifikatet och skickas sedan till Fortnox.

**F: Hur länge är jag inloggad?**
S: Din session är aktiv så länge du använder systemet. Vid längre inaktivitet kan du behöva logga in igen.

---

*Denna manual gäller för Burgsvik version som är i produktion januari 2026.*

*Vid frågor eller problem, kontakta din systemadministratör.*
