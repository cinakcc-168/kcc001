# Tiny POS

Tiny POS is a React/Vite multi-branch retail POS and operations system.

## Stack

- React 18 + Vite
- Supabase (database, authentication, RPCs, RLS)
- Netlify Functions
- Cloudinary for product/shop media
- Telegram integrations
- npm (`package-lock.json`) as the project package manager

## Local development

Prerequisites: Node.js 20+.

```bash
npm ci
npm run dev
```

## Checks

```bash
npm test
npm run lint
npm run build
```

The production Netlify build uses:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

## Environment

Use `.env.example` as the template for local configuration. Never commit real secrets.

## Database migrations

Database changes live in `database/`.

Rules:

1. Run historical migrations once in the new Supabase project.
2. Never edit an already-applied historical migration.
3. Use one new additive migration for future schema/function changes.
4. Run `VERIFY.sql` after the required migration sequence.
5. `database/NUMBERING_NOTES.md` documents the historical migration-numbering irregularities.

## Important release areas

Before a production release, regression-test:

- POS checkout and receipts/invoices
- permissions and role loading
- batch/lot stock movements
- product promotions and selling-unit rules
- online-store stock availability and customer matching
- cash-register sessions and end-of-day reporting
- responsive phone/tablet/desktop layouts
