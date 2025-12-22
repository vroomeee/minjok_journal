# Error Report: Signup Confirmation Failures (PKCE + Email Link Handling)

## What happened
- Signup confirmation links were failing with messages such as:
  - `No token hash or type provided`
  - `Email link is invalid or has expired`
  - `PKCE code verifier not found in storage`
- Root cause: The signup action was not returning Supabase auth cookies after `signUp`, so the PKCE `code_verifier` never reached the browser. Without that cookie, the confirmation link cannot complete the OAuth/PKCE flow.
- Compounding issue: Email links routed through click-tracking (`resend-clicks.com`) can strip or alter the URL fragment that contains tokens.

## Fix applied in code
- `app/routes/auth/signup.tsx` now propagates Supabase headers on both success and error:
  - Uses `{ supabase, headers } = createSupabaseServerClient(request)`.
  - Returns `headers` on errors and on the success redirect (`redirect("/auth/signup?success=1", { headers })`).
- `/auth/confirm` already supports multiple token params and now handles PKCE tokens via `exchangeCodeForSession` when needed.

## Remaining operational steps
- Use the same Supabase project for app `.env` and the email links.
- Whitelist redirect URLs in Supabase Auth:
  - `http://localhost:5173/auth/confirm?next=/`
  - `http://localhost:5173/auth/confirm?next=/auth/reset-password`
  - Add `127.0.0.1` variants if you use them.
- If using Resend click tracking, either:
  - Disable click tracking on your sending domain in Resend, or
  - Switch Supabase Auth to your own SMTP provider to avoid link rewriting, or
  - Manually copy the raw Supabase link from the email (not the `resend-clicks.com` wrapper) during testing.

## Redirect URL requirements (code vs Supabase)
- Code sends confirmation emails with `emailRedirectTo` set to: `http://<origin>/auth/confirm?next=/`
- Our confirm route then redirects internally to the profile (or `next` if provided). Only the `/auth/confirm?next=...` URL needs to be whitelisted in Supabase; `/profile/:id` does not.
- Whitelist these in Supabase Auth Redirect URLs for dev:
  - `http://localhost:5173/auth/confirm?next=/`
  - `http://localhost:5173/auth/confirm?next=/auth/reset-password`
  - Include `http://127.0.0.1:5173/...` variants if you use that host.
- Set Site URL in Supabase Auth to your dev origin (e.g., `http://localhost:5173`). For production, use your deployed origin with the same `/auth/confirm?next=...` paths.

## How to verify
1. Restart the dev server to load the updated signup route.
2. Sign up with a fresh email (old links are invalid).
3. Click the confirmation link directly (or paste the raw Supabase verify URL); you should be redirected to `/auth/confirm` and then to `/` without errors.
