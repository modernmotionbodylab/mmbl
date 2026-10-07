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

## Semi-private member hub

The site now includes an interactive booking preview at `#member-hub`. It shows
how a member can browse a weekly calendar, see available spots, book/cancel
sessions, and track remaining credits. The public preview uses sample times,
capacity, and credits and is clearly marked as a demo. It does not charge or
reserve a real workout.

The live implementation is in `src/app/member-hub/live-hub.component.ts` and
`supabase/`. It uses email-code sign-in, a published session calendar, paid
credits, and database-side checks for capacity and membership. Booking and
cancellation run in database transactions. The Stripe webhook verifies its
signature, grants credits only for the configured Payment Link, and deduplicates
retries. Subscription renewals with `invoice.paid` can grant a new block of
credits. The live view is shown only after the public Supabase URL and
publishable key are set in `src/app/member-hub/live.config.ts`.

To activate real bookings:

1. Create a Supabase project and apply
   `supabase/migrations/20261007000000_member_bookings.sql` using the SQL editor
   or CLI. Enable email OTP and configure its email template to include the
   six-digit `{{ .Token }}` value. Allow your GitHub Pages URL as an auth URL.
2. Confirm which Stripe Payment Link sells semi-private sessions. The current
   live-view purchase button points to the existing in-person link. Find that
   link's `plink_...` ID in Stripe, then set the Supabase Edge Function secrets
   from `supabase/.env.example`. Choose the real credits per payment and credit
   validity before enabling payment grants. Keep all `sk_`, `whsec_`, and
   service-role values out of GitHub and the Angular app.
3. Deploy `stripe-webhook` as a Supabase Edge Function. Register its HTTPS URL
   in Stripe for `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, and `invoice.paid` events. Use
   the endpoint signing secret in the Edge Function secrets. The function has
   JWT verification disabled because Stripe authenticates with its signature.
4. Enter actual class times, location, and capacity in Supabase's
   `training_sessions` table; publish only confirmed sessions. An unpublished
   or past class cannot be booked. The site displays dates in the member's
   local timezone.
5. Set `supabaseUrl` and `supabasePublishableKey` in `live.config.ts`, rebuild,
   and redeploy. Test one Stripe test-mode purchase and booking before using
   live keys. Members must sign in with the email on their Stripe receipt.

No Supabase project, payment-link ID, session schedule, or credit policy has
been supplied yet. The live booking view remains off until these are set.
