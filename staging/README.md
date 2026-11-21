# Staging site

A private copy of the museum website for testing changes before they reach the real site.

- Address (once connected): `https://staging.museumofminiskateboards.org`
- Its own database (Supabase project `cbtzvkalhyfxhvdsdvxc`), its own empty photo storage, made-up sample data. It can never read or change real users' uploads.
- Behind a password you choose yourself (see step 3 below).
- Built from the `staging` branch of this repository by `staging/build.py`. The code is identical to the real site; the build swaps in the staging database and adds a red "STAGING" label.

## Test accounts (staging database only)
Their passwords are in `staging/test-accounts.txt` on Ryan's computer (never committed). `stagingadmin` is an admin, `stagingtester` is a regular user.

## One-time setup (about 5 minutes)

### 1. Cloudflare Pages
1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > pick this repository.
2. Production branch: `staging`
3. Build settings:
   - Framework preset: None
   - Root directory: `staging`
   - Build command: `python3 build.py`
   - Build output directory: `dist`
4. Save and Deploy.

### 2. The address
Pages project > Custom domains > Set up a custom domain > `staging.museumofminiskateboards.org` (the domain is already on Cloudflare, so it adds the record for you).

### 3. The password (you choose it; nobody else sees it)
Pages project > Settings > Variables and secrets > Add > name `STAGING_PASSWORD`, value = your password, type Secret > Save, then redeploy once. Visitors see the browser's password box; any user name works. Until a password is set the site refuses everyone.

### 4. Let sign-in work on staging
Supabase dashboard > the *staging* project > Authentication > URL Configuration: set Site URL to `https://staging.museumofminiskateboards.org` and add it under Redirect URLs.

## Day to day
- Make changes on the `staging` branch, push, and Cloudflare rebuilds in about a minute.
- When a change is tested and approved, merge it into `main` (the real site). The swap of database settings happens only in the staging build, so nothing staging-specific travels with the merge.
- The real site's robots (re-cut, preview pictures) run only on `main`, and the database trigger that starts the re-cut is not installed on staging, so staging cannot start them.

## What staging leaves out on purpose
Preview pictures (`og/`), the per-product copies (`p/`, `u/`), user cut-outs (`user-cuts/`), old museum photos (`Images/`). Product and collection links still work (the 404 page forwards them). The cut-out models are loaded from the real site because Cloudflare's free plan limits a file to 25 MB.
