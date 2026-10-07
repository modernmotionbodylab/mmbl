# Modern Motion Body Lab

Angular 22 website for busy professionals, nurses, executives, and frequent travelers. Navy, ivory, coral, and teal styling, full-color gym photography, and original-color social logos.

## Local testing — macOS / zsh

Install Python 3.9+ and Node.js 24 LTS (24.15+), then run from this folder:

```sh
./local-start.sh
./local-stop.sh
```

Start creates/reuses `.venv`, checks Python requirements, installs Angular packages from the lockfile, builds the app, starts a background local server, and opens **http://localhost:4200**. Use `./local-start.sh --no-browser` to skip the browser. Python uses standard-library modules only. Node is required to compile Angular. The launcher uses pnpm if available or obtains pinned pnpm through npm.

## Windows / PowerShell

```powershell
.\local-start.ps1
.\local-stop.ps1
```

PowerShell scripts require PowerShell; use `.sh` files in macOS zsh. `-NoBrowser` skips opening the browser. Both launchers load `.env`, creating it from `.env.example` when missing. Defaults are `HOST=localhost` and `PORT=4200`. Configuration and runtime files are not published.

The scripts serve the compiled Angular app. After editing source, rerun start to rebuild. For automatic refresh during development, first stop the background preview, then use:

```sh
npx --yes pnpm@11.19.0 install --frozen-lockfile
npm start
```

Stop this foreground dev server with Ctrl+C. Do not run both servers on port 4200 simultaneously.

## Source structure

- `src/app/app.component.html`: page, phone/address placeholders, and enquiry form.
- `src/app/app.component.ts`: Angular form validation and submission behavior.
- `src/app/contact.config.ts`: public recipient and FormSubmit endpoint.
- `src/styles.css`: responsive design.
- `public/assets/`: photos and locally stored brand logos.
- `scripts/`: local environment setup and preview server.
- `build/modern-motion/browser/`: generated production output (ignored by Git).

Phone: (281) 703-9810. Instagram, YouTube, Threads, TikTok, and Facebook link to the supplied profiles. Studio address and Snapchat remain placeholders.

## Enquiry emails

The form submits to **https://formsubmit.co/ajax/modernmotionbodylab@gmail.com**. Valid submissions include name, email, optional phone, training interest, and message. The form validates required fields, blocks repeated clicks while sending, preserves input after failures, and includes a honeypot.

**Required activation:** Submit an enquiry from the deployed site, then open the activation email from FormSubmit in `modernmotionbodylab@gmail.com` and confirm it. Check Spam too. Until activation is complete, email delivery is not verified. After activation, submit a fresh enquiry and confirm receipt and reply-to behavior. FormSubmit owns email delivery; GitHub Pages cannot run an email server.

Browser tests use mocked service responses; they do not send real enquiries or claim that email was delivered. No Gmail password or private API key belongs in Angular source or `.env`. Visitors’ form details are sent to FormSubmit to forward the enquiry; the form discloses this.

Service documentation: https://formsubmit.co/ajax-documentation and https://formsubmit.co/help.

## GitHub Pages

Repository: https://github.com/modernmotionbodylab/mmbl

The workflow in `.github/workflows/deploy.yml` installs locked dependencies, builds Angular with the repository base path, and deploys only `build/modern-motion/browser` through GitHub Pages. Changes pushed to `main` trigger deployment.

In GitHub **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. The workflow needs Pages enabled and permission to deploy. The expected project URL is https://modernmotionbodylab.github.io/mmbl/; check the Actions deployment result to confirm it is live.

To reproduce the hosted build:

```sh
npx --yes pnpm@11.19.0 exec ng build --base-href /mmbl/
```

`npm run build` builds for a root URL such as the local preview. `npm run check` checks TypeScript. The application is one page with section anchors, so it needs no server-side route rewrites.

## Brand assets

Social brand SVGs: [SVGL](https://github.com/pheralb/svgl), MIT license (copy in `public/assets/social/LICENSE.txt`). Brand marks remain trademarks of their respective owners.

The earlier static implementation in `dist/`, `scripts/serve.mjs`, and the former hosting metadata are retained for reference. They are not Angular source and are not used by the GitHub Pages workflow. Edit `src/` and `public/` for the current website.

Threads SVG: Simple Icons 13.21.0, CC0 collection (https://github.com/simple-icons/simple-icons/tree/13.21.0). Threads uses its native black brand mark.

Online and in-person subscription destinations are configured in `src/app/subscription.config.ts`. Empty URLs display “coming soon”; set them to the actual checkout URLs when available.

## GitHub Pages publishing

This repository's Pages settings currently also run a branch-based Jekyll build
from the repository root. That build can overwrite the Angular Actions
deployment. The root `index.html`, hashed JS/CSS files, `.nojekyll`, and `assets/`
are generated copies of the production Angular build, so both Pages sources
publish the same website. After changing the website, run:

```sh
pnpm exec ng build --base-href /mmbl/
.venv/bin/python scripts/sync_pages_root.py
```

Commit the generated root files with the source changes. If GitHub Pages is
later switched to **GitHub Actions** as its sole source, these root copies can
be retired.

## Google Calendar booking (no database)

The website’s Schedule section shows a connection status, with no times or
booking counts, until a Google Apps Script web app is connected. The request
form remains available while setup is unfinished.

The production design uses the Google Calendar for `modernmotionbodylab@gmail.com`
as the only persistent booking store. Create a 45-minute event whose title begins
`[MMBL] In person` or `[MMBL] Online`; it appears on the website. Leave 15
minutes between the end of one training event and the start of the next. The
Apps Script reads the marked events and stores up to three verified customer
emails as private tags on each event. A script lock serializes bookings, so a
fourth person cannot reserve the same session. The event description shows the
booked count. Deleting an event from Google Calendar removes it from the
website on the next refresh (the embedded calendar refreshes every 30 seconds).
Unmarked personal events do not appear on the website.

The booking script emails a six-digit sign-in code to the customer and checks
Stripe for a paid subscription or package purchased through the matching
payment link. It counts booked sessions in the current paid period against the
configured session allowance. Customer names and email addresses are never
shown in public availability. The Stripe secret stays in Apps Script's private
settings, not in the Angular app or GitHub Pages.

### Activate live booking

1. Sign in to [Google Apps Script](https://script.google.com/) as
   `modernmotionbodylab@gmail.com` and create a new project. Copy
   `google-calendar-booking/Code.gs` into the script file and add
   `google-calendar-booking/Index.html` as an HTML file named `Index`.
2. In **Project Settings → Script properties**, set `CALENDAR_ID` to the chosen
   Google Calendar ID (the primary calendar is normally the account email).
   Set `STRIPE_SECRET_KEY`, `ONLINE_PAYMENT_LINK_ID`,
   `IN_PERSON_PAYMENT_LINK_ID`, `ONLINE_SESSIONS_PER_PERIOD`,
   `IN_PERSON_SESSIONS_PER_PERIOD`, and `ONE_TIME_VALID_DAYS`.
   Payment-link IDs start with `plink_` and are found in Stripe Dashboard; the
   public `buy.stripe.com` URLs are not those IDs. The session allowances and
   one-time validity must match the actual offers. Keep these values private.
3. Deploy the project as a **Web app**, executing as the calendar owner, with
   access for visitors. Authorize Calendar, email, and Stripe network access.
   Test with Stripe **test-mode** settings and a test payment before using live
   settings. The script intentionally refuses a booking if payment settings
   are missing or the customer has no matching paid purchase.
4. Copy the deployment URL ending in `/exec` into `appsScriptUrl` in
   `src/app/workout-scheduler/booking-calendar.config.ts`. Rebuild and deploy
   the Angular website. The live embedded calendar then replaces the preview
   and request form. Test three bookings at one time, a rejected fourth
   booking, cancellation, and deletion of a Google Calendar event.

Google Calendar stores the booking seats; no Supabase project or database is
needed. Google Apps Script's temporary cache holds short-lived sign-in codes
and browser sessions. Deleting a booked workout removes it from the website,
but this version does **not** email affected customers or issue Stripe refunds
automatically. Contact them and handle a refund or rescheduling if needed.

Until the script is deployed and connected, the public site remains a preview
and cannot accept confirmed calendar bookings.
