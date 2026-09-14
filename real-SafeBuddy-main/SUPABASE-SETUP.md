# Supabase setup

The whole team shares one Supabase project, so there is usually nothing to set
up beyond filling in `.env.local`. See the README for that.

## Working against a local database

Useful when you want to try a migration without touching shared data.

```sh
npm install -g supabase
supabase start        # Postgres + API + Studio on http://localhost:54323
supabase db reset     # applies everything in supabase/migrations/
```

Then point `.env.local` at the local instance. `supabase start` prints the URL
and anon key to use:

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key from the supabase start output>
```

Stop it again with `supabase stop`.

## Migrations

Everything in `supabase/migrations/` runs in filename order, and that order is
the schema's history. Add a new one with:

```sh
supabase migration new <name>
```

After the schema changes, regenerate the TypeScript types so the client knows
about it:

```sh
npx supabase gen types typescript --project-id <project-id> > src/integrations/supabase/types.ts
```

Skipping that step is why `report_likes` and the `profiles.languages` column
were invisible to TypeScript for a while, which forced casts in application code.

## Tables the app reads

| Table | Written by | Notes |
| --- | --- | --- |
| `profiles` | users | Username changes are rate-limited to once per 30 days by a trigger |
| `safety_reports` | users | Position lives in the PostGIS `location` column |
| `report_likes` | users | One row per user per report; the total is mirrored onto `safety_reports.upvotes` |
| `KRO_Reports_15K` | import | Read-only historic dataset, roughly 15.000 rows |

Two quirks of `KRO_Reports_15K` are worth knowing, because the client works
around both:

- `latitude` and `longitude` are **text** using a comma decimal separator
  ("52,388404"). Passing those to `parseFloat` silently yields `52`.
- `severity` is capitalised ("High", "Medium") where `safety_reports` uses
  lowercase.

Normalising this in the database instead would let the client drop
`parseCoordinate` and `normaliseSeverity`.

## Edge functions

`supabase/functions/` holds three Deno functions: `geocode-location`,
`safe-route` and `verify-face-match`. **None of them is called by the app** —
geocoding and routing happen client-side against Mapbox. Keep them only if you
plan to move that work server-side; otherwise they can be deleted.
