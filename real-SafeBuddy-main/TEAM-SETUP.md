# SafeBuddy - Setup Instructies voor Team

## Voor nieuwe teamleden

### 1. Clone het project
```bash
git clone <jouw-github-repo-url>
cd real-SafeBuddy-main
```

### 2. Installeer dependencies
```bash
npm install
```

### 3. Setup environment variabelen
Maak een `.env` bestand in de root van het project:

```bash
# Maak een nieuw .env bestand
echo VITE_SUPABASE_URL=https://irrinahkpkuaqcrlovph.supabase.co > .env
echo VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_d2T0MP9vEoQHZWPZq2Vv4A_HQ5XP5Yp >> .env
echo VITE_MAPBOX_TOKEN=pk.eyJ1IjoibWFyY2VsbG8xMjciLCJhIjoiY21qMDNsZGpnMDRobTNlc2I4ZWk0amI1ZSJ9.E08Oysm7mEJZTko5xHDcyQ >> .env
```

Of kopieer handmatig deze waardes naar `.env`:
```env
VITE_SUPABASE_URL=https://irrinahkpkuaqcrlovph.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_d2T0MP9vEoQHZWPZq2Vv4A_HQ5XP5Yp
VITE_MAPBOX_TOKEN=pk.eyJ1IjoibWFyY2VsbG8xMjciLCJhIjoiY21qMDNsZGpnMDRobTNlc2I4ZWk0amI1ZSJ9.E08Oysm7mEJZTko5xHDcyQ
```

**Let op:** Alle teamleden gebruiken dezelfde Supabase database. Voor meer info, zie [SUPABASE-SETUP.md](SUPABASE-SETUP.md)

### 4. Run de development server
```bash
npm run dev
```

De app draait nu op `http://localhost:8080`

### 5. Maak een account aan
- Open de app in je browser
- Klik op "Sign up"
- Maak je eigen account aan

## Live URL
De app is automatisch live op: [wordt ingevuld na Netlify deployment]

Elke push naar `main` branch wordt automatisch gedeployed! 🚀
