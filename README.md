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

## Shared workout calendar

The Schedule section now shows how a **shared** online/in-person calendar works.
The displayed 6 PM / 7 PM / 8 PM slots are explicitly labeled as examples until
a Supabase project is connected. They are **not real availability or bookings**.
The existing request form remains available below the preview during setup.
Once connected, that request form is hidden and the live calendar reads current
seat counts from the database. Visitors can see open/full times, sign in with an
email code, book one of three spots, and cancel their own future booking. The
calendar refreshes visible availability every 30 seconds and checks it again in
the database at booking time.

A published training block lasts **45 minutes**. The next **15 minutes** are
reserved for the trainer. One trainer cannot publish overlapping blocks, even
if one is online and one is in person. The database locks a block when a
booking is made so a fourth person cannot register, even if several people
click at once. Other members' names and online meeting details are not shown
in public availability.

### Activate live booking

1. Create a Supabase project and apply
   `supabase/migrations/20261007010000_shared_booking_calendar.sql`. Configure
   email OTP to include `{{ .Token }}` in the email template and allow
   `https://modernmotionbodylab.github.io/mmbl/` as an auth redirect URL.
2. Enter the real trainer hours, dates, online/in-person format, and studio
   timezone in Supabase's `workout_sessions` table. Each row needs
   `starts_at`, `ends_at = starts_at + 45 minutes`, and
   `trainer_reserved_until = starts_at + 60 minutes`. Set `published = true`
   only for confirmed classes. No real classes are preloaded by this repo.
3. Configure the Supabase Edge Function secrets from `supabase/.env.example`.
   The two `plink_...` identifiers come from the Stripe Dashboard for the
   existing online and in-person payment links. Confirm how many sessions each
   purchase includes and how long they remain valid. Deploy
   `stripe-booking-webhook`, then register its URL in Stripe for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   and `invoice.paid`. It verifies Stripe signatures and grants credits only
   for those two configured links. Members must use the checkout email for
   booking. Never put Stripe or service-role keys in the Angular app.
4. Set `supabaseUrl` and `publishableKey` in
   `src/app/workout-scheduler/booking-calendar.config.ts`. They are public
   project values. Keep `requirePayment` in this file consistent with the
   database's `booking_settings` row; the database is authoritative. Rebuild,
   sync the Pages root, and deploy. Test the complete flow with Stripe test
   mode, including concurrent attempts at the last spot.

Until these external settings and the real schedule are supplied, the live
calendar remains off. The preview and existing email request form are not a
confirmed booking system.
