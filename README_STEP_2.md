# Tiny POS — Step 2: Netlify + Supabase Login

This is a complete connection-test application. It verifies:

- Supabase email/password authentication
- The owner profile created in Step 1
- Organization and branch access
- Row Level Security
- Shared shop settings
- Per-user language, light/dark theme, and accent color

It does not replace the old POS yet.

## Folder structure

```text
Tiny_POS_Step_2_Netlify_Supabase_Login/
├── public/
│   ├── index.html
│   └── assets/
│       ├── app.js
│       └── styles.css
├── netlify/
│   └── functions/
│       └── public-config.mjs
├── .env.example
├── .gitignore
├── netlify.toml
└── README_STEP_2.md
```

## 1. Find the Supabase connection values

In Supabase, open the project **Connect** panel or **Project Settings → API**.
Copy:

- Project URL
- Publishable key

The publishable key may be called the anon key in an older Supabase project.
Do not copy the service-role key into the frontend.

## 2. Add Netlify environment variables

In Netlify, open:

```text
Project configuration
→ Environment variables
→ Add a variable
```

Add exactly:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Set the value of `SUPABASE_URL` to the Supabase project URL.
Set the value of `SUPABASE_PUBLISHABLE_KEY` to the publishable key.

The `public-config` Netlify Function intentionally returns these two public
connection values to the browser. Never add `SUPABASE_SERVICE_ROLE_KEY` to
browser JavaScript.

## 3. Deploy safely

Recommended test method:

1. Create a new Netlify test site or a new Git branch.
2. Put all files from this package in the repository root.
3. Commit and push.
4. Netlify reads `netlify.toml` automatically.
5. The publish directory is `public`.
6. The Functions directory is `netlify/functions`.

Do not use basic static drag-and-drop for this stage because the
`public-config` Netlify Function must also be deployed. Use Git-based deploy or
Netlify CLI.

### Netlify CLI alternative

From this folder:

```bash
npx netlify login
npx netlify init
npx netlify deploy --prod
```

## 4. Test

Open the deployed Netlify URL.

Expected login screen:

```text
Welcome to Tiny POS
Secure staff login
```

Log in using the owner email and password created after Step 1.

Expected result after login:

- Green connection status
- Your owner name and email
- Role `owner`
- Organization `Tiny POS`
- Branch `Main Branch`
- Base currency and exchange rate
- Personal language, theme, and accent-color controls

Change the theme, language, or color and select **Save preferences**.
Refresh the page. The saved preferences should remain.

## 5. Common errors

### Missing SUPABASE_URL or key

Netlify environment variables were not added, were misspelled, or were not
available to Functions. Add them and trigger a new deploy.

### Invalid login credentials

Use the exact owner email and password created in Supabase Authentication.

### Profile could not be loaded

Run this query in Supabase SQL Editor:

```sql
select id, email, full_name, role, organization_id, branch_id
from public.profiles;
```

There should be one row for the owner. If Authentication contains a user but
`profiles` is empty, the user was probably created before the Step 1 trigger.
Do not create more users yet; repair the owner profile before continuing.

### Function returns 404

Confirm `netlify.toml` and `netlify/functions/public-config.mjs` are in the
repository root and redeploy through Git or Netlify CLI.

## Security notes

- No public sign-up interface is included.
- The browser uses only the Supabase publishable key.
- The database policies from Step 1 control what each user can read or change.
- Users may edit only their own `user_preferences` row.
- Users cannot change their role from this page.
- Direct browser stock changes remain blocked.
