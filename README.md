# Jack Haunts Us

A tribute to our friend Jack, who wants to haunt **for** you after he passes.
Tell him who to haunt — he'll handle the rest.

🌐 **Live at [jackhaunts.us](https://jackhaunts.us)**

---

## What Is This?

Jack is dying — but he's not done working. This site lets friends submit **Haunt Requests**: tell Jack who or what to haunt on your behalf, and he'll get right to it once he's crossed over. While he can still review them, every request gets his personal attention.

Once Jack passes, the site flips to **Haunting mode**: the form closes, and the Wall of Haunts becomes a record of his active work.

Built by friends who love Jack, with accessibility-first design in his honor. He's the expert.

---

## Local Development

```bash
npm install
npm start          # starts dev server at http://localhost:8080
npm run build      # builds to dist/
```

---

## Reviewing & Approving Haunt Requests

Submissions come in as GitHub Pull Requests. To publish a haunt:

1. Open the PR in GitHub
2. Review the request (see checklist in the PR template)
3. Change `status: pending` → `status: approved` in the `.md` file frontmatter
4. Merge the PR — Cloudflare Pages auto-deploys on merge to `main`

To reject a request, close the PR without merging.

---

## Flipping the Site Mode

### Via GitHub Actions (recommended)

1. Go to **Actions** → **Toggle Site Mode**
2. Click **Run workflow**
3. Choose `requesting` or `haunting` from the dropdown
4. Click **Run workflow**

This commits a change to `src/_data/siteConfig.json` and triggers a redeploy.

### Manually

Edit `src/_data/siteConfig.json`:

```json
{
  "mode": "haunting",
  "haunterIsGone": true
}
```

Commit and push to `main`.

---

## Secrets & Environment Variables

### GitHub Actions (add under repo Settings → Secrets and variables → Actions)

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages deploy permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### Cloudflare Worker (set with `wrangler secret put`)

| Secret | How to set |
|---|---|
| `GITHUB_TOKEN` | `npx wrangler secret put GITHUB_TOKEN` — a GitHub PAT with `repo` scope on this repo |
| `TURNSTILE_SECRET_KEY` | `npx wrangler secret put TURNSTILE_SECRET_KEY` — from the Turnstile dashboard (see below) |

---

## Setting Up Cloudflare Turnstile

Turnstile is the spam-protection widget on the submission form. It requires two keys:
a **Site Key** (public, goes in the site config) and a **Secret Key** (private, goes in the Worker).

### Step 1 — Create a Turnstile widget

1. Go to [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Click **Add widget**
3. Name it anything (e.g. `jackhaunts.us`)
4. Add your hostname: `jackhaunts.us`
5. Click **Create**

### Step 2 — Add the Site Key to `siteConfig.json`

Copy the **Site Key** from the Turnstile dashboard and paste it into `src/_data/siteConfig.json`:

```json
{
  "turnstileSiteKey": "0x4AAAAAAA...your-site-key-here..."
}
```

Commit and push — this value is public and safe to store in the repo.

### Step 3 — Add the Secret Key to the Worker

Copy the **Secret Key** from the Turnstile dashboard. **Never commit this to the repo.**
Instead, set it as a Worker secret:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
# Paste your secret key when prompted
```

---

## Set up the Cloudflare Pages project

Create a Cloudflare Pages project. The projectName should match the one set in `.github/workflows/deploy.yml`.

```bash
npx wrangler pages project create projectName
```

## Deploying the Worker

The GitHub Actions deploy workflow now deploys both the Pages site and the submission worker on pushes to `main`.

For first-time setup or manual redeploys:

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TURNSTILE_SECRET_KEY
```

---

## Forking This for Someone Else

This app is generic by design and released to the public domain ([The Unlicense](LICENSE)).
All Jack-specific content lives in one file:

**`src/_data/siteConfig.json`**

Update these fields:

```json
{
  "haunterName": "Your person's name",
  "haunterPronounSubject": "they",
  "haunterPronounObject": "them",
  "haunterPronounPossessive": "their",
  "siteTitle": "Whoever Haunts Us",
  "siteUrl": "https://yourdomain.com",
  "tagline": "Your tagline here.",
  "description": "Your site description here.",
  "turnstileSiteKey": "REPLACE_WITH_YOUR_TURNSTILE_SITE_KEY"
}
```

Then update `wrangler.toml` with your Worker name and follow the secrets setup above.
The haunt markdown files in `src/haunts/` are your content — replace or remove them.

---

## Tech Stack

- **Static site**: [Eleventy (11ty)](https://www.11ty.dev/) v3, Nunjucks templates
- **Hosting**: Cloudflare Pages (auto-deploy on push to `main`)
- **Form pipeline**: Cloudflare Worker → GitHub API → Pull Request
- **Spam protection**: Cloudflare Turnstile + honeypot field
- **Accessibility CI**: pa11y-ci at WCAG2AAA on every PR
- **Mode toggle**: GitHub Actions `workflow_dispatch`
- **License**: [The Unlicense](LICENSE) (public domain)
