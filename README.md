# Jack Haunts Us

A tribute to our friend Jack, who wants to haunt people after he passes. Submit your Haunt Request — he reviews everything personally.

🌐 **Live at [jackhaunts.us](https://jackhaunts.us)**

---

## What Is This?

Jack is dying and he wants to haunt you. This site lets friends submit Haunt Requests while he can still review them. Once Jack passes, the site flips to "Haunting" mode — the form closes, and the Wall of Haunts shows who he's visiting.

Built by developers who love Jack. Accessibility-first, in his honor (he's the expert).

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
2. Review the request for content (see checklist in the PR template)
3. Change `status: pending` → `status: approved` in the `.md` file frontmatter
4. Merge the PR — Cloudflare Pages auto-deploys on merge to `main`

To reject a request, simply close the PR without merging.

---

## Flipping the Site Mode

### Via GitHub Actions (recommended for non-devs)

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
  "jackIsGone": true
}
```

Commit and push to `main`.

---

## Secrets & Environment Variables

### GitHub Actions (repository secrets)

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages deploy permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### Cloudflare Worker (Worker secrets — set via `wrangler secret put`)

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope on `froboy/jackhaunts.us` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key (from Turnstile dashboard) |

---

## Setting Up Cloudflare Turnstile

1. Go to [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Click **Add widget**
3. Name it `jackhaunts.us`, set hostname to `jackhaunts.us`
4. Copy the **Site Key** → add to `src/_data/siteConfig.json` as `"turnstileSiteKey"`
5. Copy the **Secret Key** → add to the Worker as `TURNSTILE_SECRET_KEY`

---

## Deploying the Worker

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TURNSTILE_SECRET_KEY
```

---

## Tech Stack

- **Static site**: [Eleventy (11ty)](https://www.11ty.dev/) v3, Nunjucks templates
- **Hosting**: Cloudflare Pages (auto-deploy on push to `main`)
- **Form pipeline**: Cloudflare Worker → GitHub API → Pull Request
- **Spam protection**: Cloudflare Turnstile + honeypot field
- **Accessibility CI**: pa11y-ci at WCAG2AAA on every PR
- **Mode toggle**: GitHub Actions `workflow_dispatch`
