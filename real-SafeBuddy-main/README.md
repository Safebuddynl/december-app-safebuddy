# SafeBuddy - Travel Safer Together

## About

SafeBuddy is an AI-powered safety companion app designed to help users plan safe routes, find travel buddies, and share community safety insights. Built with modern web technologies to provide a seamless and secure experience.

## How to run this project

This project requires Node.js & npm - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## Technologies

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

### Deploy via Netlify

The project is configured for automatic deployment via Netlify.

**Setup:**
1. Push your code to GitHub
2. Go to [Netlify](https://app.netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect your GitHub repository
5. Add environment variables (see `.env` file or `TEAM-SETUP.md`)
6. Click "Deploy site"

Every push to `main` will now automatically deploy! 🚀

**For team members:** See [TEAM-SETUP.md](TEAM-SETUP.md) for local development setup.
**For Supabase setup:** See [SUPABASE-SETUP.md](SUPABASE-SETUP.md) for database configuration.
