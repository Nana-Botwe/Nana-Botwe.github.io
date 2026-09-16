# contact-api

The contact form on [nana-botwe.github.io](https://nana-botwe.github.io/) posts here.
GitHub Pages only hosts static files, so this small TypeScript (Node.js) service runs on
your own hosting:

- **Saves every message** to `data/messages.txt`, a plain text file you can open any time
- **Emails you a digest every evening** with everything received since the last digest
- Accepts posts only from the portfolio site, rejects bad input, rate-limits each visitor
  (5 accepted messages per hour) and silently drops bots caught by a hidden form field

No PHP and no database. The only runtime dependency is `nodemailer`.

## How it works

| Piece | File | What it does |
| --- | --- | --- |
| Web endpoint | `src/server.ts` | `POST /api/contact` validates the message and appends it to `messages.txt`. `GET /api/health` returns `{ ok: true }`. |
| Evening digest | `src/digest.ts` | Emails everything added since the last run, then remembers where it stopped (`digest-state.json`). Sends nothing on quiet days. If sending fails, the same messages go out on the next run. |
| Storage | `src/store.ts` | Text-file writes, the digest bookmark, and a lock so two runs never send twice. |

## Run it locally

```bash
cd contact-api
npm install
npm run build
MAIL_DRY_RUN=true npm start          # server on http://localhost:3000
MAIL_DRY_RUN=true npm run digest     # prints the digest instead of emailing it
```

## Deploy on cPanel (inbitfirm.org hosting)

1. **Create a subdomain** `contact.inbitfirm.org` (cPanel → Domains).
2. **Create a mailbox** to send from, e.g. `no-reply@inbitfirm.org` (cPanel → Email Accounts).
3. **Build locally:** `npm install && npm run build`.
4. **Upload** `package.json`, `package-lock.json` and the `dist/` folder to a folder
   **outside** `public_html`, e.g. `/home/USER/contact-api`.
5. **cPanel → Setup Node.js App → Create Application**
   - Node.js version: 20 or newer
   - Application root: `contact-api`
   - Application URL: `contact.inbitfirm.org`
   - Application startup file: `dist/server.js`
   - Add the environment variables from `.env.example` (at least `SMTP_HOST`, `SMTP_PORT`,
     `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`, `DATA_DIR=/home/USER/contact-api/data`)
   - Click **Run NPM Install**, then **Restart**
6. **Check it:** open `https://contact.inbitfirm.org/api/health`. It should show `{"ok":true,...}`.
7. **Schedule the evening email:** cPanel → Cron Jobs → add a job for **18:00** every day.
   Server clocks often run on UTC; Ghana is UTC+0 all year, so 18:00 UTC is 6 PM in Accra.

   ```
   0 18 * * * cd /home/USER/contact-api && /home/USER/nodevenv/contact-api/20/bin/node dist/digest.js >> data/digest.log 2>&1
   ```

   The exact `node` path is shown at the top of the Node.js App page ("Enter to the virtual
   environment" command). Pass the same environment variables, or put them in a `.env` file
   in the app folder (Node 20.12+ loads it automatically).

The form in `index.html` already posts to `https://contact.inbitfirm.org/api/contact`
(the `data-endpoint` attribute on `#contact-form`). If you use another address, change it
there. Until the service is reachable, the form opens the visitor's email app with the
message filled in, so no enquiry is lost.

## Other hosts

Any always-on Node.js 18+ host works (a VPS, Render, Railway, Fly.io). Set `PORT`,
the SMTP variables and `DATA_DIR` to a persistent disk. If the host has no cron, set
`DIGEST_AT=18:00` and the server sends the digest itself.

## Settings

See [.env.example](.env.example) for every setting and its default.
