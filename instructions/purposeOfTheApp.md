Denna app har till syfte att hantera två huvudsakliga funktioner. 

1. **Skapa verifikat från txt** 
Ta en textfil och skapa ett verifikat i Fortnox via deras api med information från textfilen. 

2. **Automatisk vändning av verifikat**
En webbsocket till fortnox för create voucher ska sättas upp. Den ska lyssna på nya verifikat som skapas och om ett verifikat skapas i verifikationsserie "R" ska denna funktion automatiskt skapa ett verifikat i verifikationsserie "Q" där samma projekt, kostnadsställe och konto används men med omvänt belopp i debet/kredit. Datumet ska, om inställningen är "Första dag i nästa månad" vara verifikatets "Transaction Date" + en månad men första dagen i danne. Om inställningen istället är "Datum angivet i kommentar" ska datumet parsas ut från "Comments"-fältet med regex enligt formatet YYYY-MM-DD. 

3. **Inställningar**
Ska finnas för att man ska kunna slå på "Automatisk vändning av verifikat" som nämns i steg 2, man ska då kunna välja huruvida man alltid vill vända mot "Första dag i nästa månad" eller "Datum angivet i kommentar". 


**Autentisering**
Applikationen använder Fortnox OAuth2 med `account_type: "service"` för att möjliggöra Client Credentials-flödet:

1. **Första autentiseringen**: Användaren loggar in via Fortnox OAuth2. Vid callback sparas `access_token` och företagets `DatabaseNumber` (tenant_id) från CompanyInformation.

2. **Token refresh**: Istället för refresh tokens används Client Credentials. När access token är nära att gå ut (< 10 minuter kvar) begärs en ny token via:
   ```
   POST https://apps.fortnox.se/oauth-v1/token
   grant_type=client_credentials
   Header: TenantId: {database_number}
   ```

3. **Företagsbaserad säkerhet**: Eftersom `account_type: "service"` används, delar alla användare samma service-konto. Säkerheten baseras därför på företag (company_id) istället för individuella användare.

Access token har en livslängd på 60 minuter. 

**Databas**
Subabase används för databasnahtering.