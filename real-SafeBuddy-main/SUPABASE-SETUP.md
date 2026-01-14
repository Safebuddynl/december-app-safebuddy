# Supabase Setup Guide

## Voor het hele team - Gebruik de gedeelde Supabase database

### Optie 1: Gebruik de bestaande gedeelde database (Aanbevolen)

Alle teamleden kunnen dezelfde Supabase database gebruiken. Je hebt alleen de environment variabelen nodig:

1. **Vraag aan het team om het `.env` bestand** (of kopieer de waardes hieronder):
```env
VITE_SUPABASE_URL=https://irrinahkpkuaqcrlovph.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_d2T0MP9vEoQHZWPZq2Vv4A_HQ5XP5Yp
VITE_MAPBOX_TOKEN=pk.eyJ1IjoibWFyY2VsbG8xMjciLCJhIjoiY21qMDNsZGpnMDRobTNlc2I4ZWk0amI1ZSJ9.E08Oysm7mEJZTko5xHDcyQ
```

2. **Dat is het!** Je kunt nu ontwikkelen met de gedeelde database.

**Voordelen:**
- ✅ Iedereen ziet dezelfde data
- ✅ Geen lokale database setup nodig
- ✅ Real-time samenwerking mogelijk
- ✅ Werkt meteen

---

## Optie 2: Lokale Supabase database (Voor gevorderde gebruikers)

Als je een lokale database wilt voor development:

### Installeer Supabase CLI
```bash
npm install -g supabase
```

### Start lokale Supabase
```bash
cd real-SafeBuddy-main
supabase start
```

Dit start:
- Lokale PostgreSQL database
- Lokale API server
- Lokale Studio UI op http://localhost:54323

### Run migrations
```bash
supabase db reset
```

Dit importeert alle migrations uit `supabase/migrations/` naar je lokale database.

### Update .env voor lokale development
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<key uit supabase start output>
VITE_MAPBOX_TOKEN=pk.eyJ1IjoibWFyY2VsbG8xMjciLCJhIjoiY21qMDNsZGpnMDRobTNlc2I4ZWk0amI1ZSJ9.E08Oysm7mEJZTko5xHDcyQ
```

### Stop lokale Supabase
```bash
supabase stop
```

---

## Supabase Studio (Database beheer)

- **Production database**: https://supabase.com/dashboard/project/irrinahkpkuaqcrlovph
- **Lokale database**: http://localhost:54323 (als je Optie 2 gebruikt)

Vraag aan de project eigenaar voor toegang tot het Supabase dashboard.

---

## Database Migrations

Alle database migrations staan in `supabase/migrations/`. Als je de gedeelde database gebruikt (Optie 1), zijn deze al uitgevoerd.

Bij lokale development (Optie 2) worden ze automatisch toegepast met `supabase db reset`.

### Nieuwe migration toevoegen
```bash
supabase migration new <naam_van_migration>
```

---

## Edge Functions

De volgende Supabase Edge Functions zijn beschikbaar:
- `geocode-location` - Geocoding van adressen
- `safe-route` - Veilige route berekening
- `verify-face-match` - Gezichtsherkenning verificatie

Deze draaien automatisch op de production Supabase instance.
