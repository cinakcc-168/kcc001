# Tiny POS Step 3 — React + Vite

This package replaces only the temporary files in the NEW Tiny POS GitHub repository and Netlify test site. Do not touch the old POS.

## Install into the new project

1. Download and extract the ZIP.
2. Open the NEW GitHub repository connected to the NEW Netlify site.
3. Delete the temporary Step 2 project files from that new repository.
4. Upload every file and folder from this package to the repository root.
5. The repository root must show `package.json`, `netlify.toml`, `src`, `public`, and `netlify`.
6. Keep the existing Netlify variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
7. Netlify will build automatically.

## Netlify settings

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

These are already defined in `netlify.toml`.

## Test

1. Open the new Netlify site.
2. Log in with the owner account.
3. Confirm `/dashboard` opens.
4. Open Settings, change theme/accent color, save, and refresh.
5. Test mobile navigation by narrowing the browser.

Next: complete categories and product management.
