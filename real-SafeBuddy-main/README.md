# SafeBuddy

A route planner that weighs reported unsafe locations, so you can pick a route
that avoids them. Built with React, TypeScript, Vite, Tailwind and Supabase.

## Getting started

You need Node.js 18 or newer.

```sh
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app runs on http://localhost:8080.

Ask a team member for the shared Supabase and Mapbox credentials. Without a
Mapbox token the map still loads using OpenStreetMap tiles, but address search
and route planning will not work.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over the whole project |

## How the code is organised

The rule of thumb: **pages wire things together, `src/lib` does the thinking.**
Anything with real logic lives in `src/lib` so it can be read, changed and
tested without rendering a component.

```
src/
  pages/           One file per screen (Route, Community, Profile, Auth)
  components/
    map/           Everything Leaflet touches
    route/         Pieces of the route screen
    ui/            shadcn/ui primitives, kept close to upstream
  hooks/           Reusable stateful logic (reports, navigation, auth)
  lib/
    env.ts         The only place environment variables are read
    geo.ts         Distances, coordinate parsing, the spatial grid
    geocoding.ts   Address search and reverse geocoding
    reports/       Loading, filtering and mutating safety reports
    routing/       Route planning and safety scoring
    safety/        The objective signals: density, lighting, time, explanation
  data/            Generated reference data (CBS population density)
  i18n/            Translations (nl / en / fr)
  integrations/    Generated Supabase client and database types
scripts/
  update-density-data.mjs   Regenerates src/data/ from CBS open data
supabase/
  migrations/      Schema changes, in order. The source of truth.
  functions/       Edge functions (Deno). Not called by the app right now.
  SETUP-DATABASE.sql  Full schema, for bootstrapping a fresh project
```

### Where the data comes from

Two sources feed the map and the community feed, combined by
`src/lib/reports/fetchReports.ts`:

- **`safety_reports`** — reports submitted by users. Editable, likeable,
  deletable by their author. The position is stored in a PostGIS `location`
  column, which the client decodes with `decodeWkbPoint`.
- **`KRO_Reports_15K`** — an imported historic dataset of about 15.000 rows.
  Read-only: it has no upvotes column and no per-row ownership, so the UI does
  not offer like or delete on these. Its `latitude`/`longitude` are text with a
  comma as the decimal separator, which `parseCoordinate` handles.

### How a route gets scored

Community reports alone have a cold-start problem: a street with no reports is
not safe, it is unmeasured. So the score blends what people reported with
objective properties of the place.

**1. Reports near the route.** Every report within 200 m counts, weighted by
severity, age, distance from the route, what kind of evidence it is, and
whether it applies at this time of day.

**2. Population density.** Raw report counts mostly measure footfall. Measured
on this project's own data across 330 municipalities:

| Relationship | Slope | R² |
| --- | --- | --- |
| log(reports) vs log(population) | 1.42 | 0.70 |
| log(reports per km²) vs log(density) | 1.34 | 0.78 |

Population explains roughly three quarters of how many reports a place has.
Each report is therefore divided by an exposure factor from the local density
(CBS data, bundled in `src/data/`), so one report in a village counts for more
than one on Amsterdam Centraal. Without it, Amsterdam scored 28 and an empty
village 100; with it, 60 and 100.

**3. Street lighting.** Lamp positions from OpenStreetMap, as a share of the
route that is lit. Only counts after dark. Fetched in the background and never
blocking: Overpass is a shared free service and can take tens of seconds, so
the route appears first and the score is refined if the data arrives. Missing
lighting data means *unknown*, never *unlit*.

**4. Time of day.** The imported dataset records when each place feels unsafe,
and 71% of its reports say "vooral als het donker is". A spot that is only
frightening at midnight barely counts at noon.

The four are summed into a risk figure, then mapped onto 0-100 by
`riskToScore`. The curve keeps falling instead of bottoming out, so two busy
city routes can still be told apart.

Route selection itself: `planRoutes` asks Mapbox for alternatives; on short
trips `computeAvoidanceWaypoint` adds a detour around a recent serious report
to create a real second option; the safest route no more than 15 minutes
slower than the quickest wins.

Scoring uses a `SpatialGrid` so each route vertex only compares against nearby
reports instead of all 15.000. A full route scores in about 50 ms.

### Explaining the score

`RouteSafety` keeps every contribution separately, so the interface can say
*why* a route scored what it did rather than just showing a number.
`lib/safety/explain.ts` turns that breakdown into two to four sentences.

This is deliberately plain code, not a language model: no API key, no network
call, no per-request cost, and the wording can never contradict the number it
is explaining. `SafetyBreakdown` shows the sentences with the individual
factors listed underneath.

## Database

Migrations in `supabase/migrations/` are the source of truth and run in
filename order. After changing the schema, regenerate the TypeScript types:

```sh
npx supabase gen types typescript --project-id <project-id> > src/integrations/supabase/types.ts
```

`supabase/SETUP-DATABASE.sql` builds the whole schema at once and is only
useful when starting a fresh Supabase project.

## Deployment

Netlify builds and deploys every push to `main`, using the settings in
`netlify.toml`. Set the same three `VITE_` variables in the Netlify dashboard
under Site settings → Environment variables.

## Security notes

**Rotate the Supabase credentials.** Several one-off scripts in the repository
root contained a `service_role` key and the database password in plain text.
They have been deleted, but they are still in git history, so treat both as
compromised and rotate them in the Supabase dashboard.

Other things worth knowing:

- `.gitignore` now excludes every `.env*` file except `.env.example`. The
  existing `.env` is still tracked from before that change. Untracking it with
  `git rm --cached .env` is the right end state, but it will delete the file
  from teammates' working copies when they pull, so agree on it as a team
  first and make sure everyone has `.env.example` filled in.
- The Supabase **anonymous** key and the Mapbox `pk.` token are designed to be
  public; row-level security decides what the anonymous key may read.
- A **service_role** key must never appear in this repository or in any
  `VITE_` variable. Vite inlines those into the JavaScript that ships to every
  visitor's browser.
