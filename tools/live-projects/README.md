# live-projects

Keeps the **Live on the web** gallery on the portfolio in step with the systems running on
`inbitfirm.org` and its subdomains. Put a new system live and it appears on the portfolio
automatically, with a screenshot, title, description and link.

## How it works

A GitHub Action ([.github/workflows/live-projects.yml](../../.github/workflows/live-projects.yml))
runs every 6 hours:

1. **Find hosts.** Reads public certificate logs (crt.sh and Cert Spotter). cPanel's AutoSSL
   issues a certificate for every new subdomain, so new systems show up within hours.
2. **Check each host,** one at a time with a pause so the shared hosting isn't overloaded.
   A host counts as live when its homepage loads with real content. These are skipped:
   - empty folders ("Index of /")
   - hosting placeholder, suspended and "resource limit" pages
   - "coming soon" and maintenance pages
   - **setup and installer pages**, so an unfinished install is never advertised
3. **Screenshot new systems** with a headless browser (1200×750) into `assets/img/work/auto/`.
   Screenshots refresh every 60 days.
4. **Rewrite the gallery** in `index.html` between the `live-projects:start` and
   `live-projects:end` markers. Then it commits and pushes, and GitHub Pages republishes the site.

New systems get a **New · Live** badge for 30 days. A system that fails 3 checks in a row
(about 18 hours) is taken off the gallery, so a brief outage doesn't remove it.

## Making changes

Edit [projects.config.json](projects.config.json), not the gallery HTML (the next run overwrites it).

- **Better wording for a system:** add or edit its entry under `projects`, keyed by hostname.
  Any of `title`, `kicker`, `category` (`software`, `ecommerce` or `web`), `description`,
  `image`, `alt` and `order` override what the tool reads from the live page.
- **Hide a system:** `"somehost.inbitfirm.org": { "hidden": true }`
- **Older work without a live site:** add it to `archive`.
- **Ignore service subdomains** like `mail` or `cpanel`: list the first label in `ignore`.

`state.json` is the tool's memory (when each host was first seen live, failure counts).
Don't edit it by hand.

## Run it yourself

From the Actions tab: **Update live projects → Run workflow**.

Or locally (Node 20.11+):

```bash
cd tools/live-projects
npm install
npm run check                         # report only, changes nothing
PLAYWRIGHT_CHANNEL=msedge npm run update   # use installed Edge for screenshots
```
