# Skin AI — Your Daily Edit

Photo observations, user context and traceable product labels in one explained basic skincare routine. Built for the YouCam API Skin AI & eCommerce VTO Hackathon.

This prototype does not diagnose skin conditions, prescribe treatment or claim clinically validated product recommendations. It has no checkout, affiliate links, paid placements, analytics trackers or user accounts.

## Try it

Choose **Explore an example** for a free walkthrough. The fictional adult portrait and sample scores are explicitly labelled. The starter profile is dry skin with reported sensitivity; edit it to see label and ingredient filters change the options. The example works without a YouCam key or database.

For live analysis, answer the profile, choose a photo (or **Use the fictional demo photo**), confirm permission and provider consent, then choose **Understand my skin**. Live analysis is enabled only after deployment credentials and private state are configured. Its six standard-definition observations use about 12 provider units per submitted analysis. Availability depends on the owner's remaining demo allowance.

## What the app does

- Six YouCam observations: hydration, oil balance, visible redness, texture, pores and blemish appearance. Raw scores and available visual maps are displayed; presentation-adjusted UI scores are never substituted for missing raw values.
- Complete asynchronous upload/task/poll/result flow, decoded visual-map proxy, input limits, metadata stripping and actionable provider errors. No automatic analysis resubmission.
- A three-step morning routine and two-step evening routine, reasons, alternatives, source dates, captured ingredients and general guidance citations.
- Filters based on self-reported skin type, sensitivity and ingredient restrictions. A photo does not supply missing answers or select a treatment.
- Editing answers reuses the existing analysis without another YouCam task. Copy the routine or clear the finished session.

## Where the product data comes from

**80 extracted US manufacturer records → 51 technical candidates → 30 records in the limited release**, across CeraVe, Cetaphil, Eucerin, The Ordinary and Vanicream. The release has 9, 11, 3, 3 and 4 records respectively.

The pipeline fetches official product pages in batches, caches and hashes sources, extracts full ingredient sections and explicit label fields, and records exclusions. US sunscreen drug actives remain separate from inactive ingredients in the research data. Formula changes are tracked. Blocked sources are skipped, not bypassed.

The release requires a captured skin-type label, complete ingredient sections and supported basic category. It excludes known reformulation, missing source facts, conflicting fragrance claims, PM-only products in shared AM/PM steps, and medicated/exfoliating categories. Named sunscreens additionally need SPF 30+, broad-spectrum protection and a captured 40- or 80-minute water-resistance label. Product labels are not independent efficacy evidence.

Recognized ingredient names/families are checked against the captured US list. Unknown terms, unknown skin type or an unspecified prescribed treatment withhold named options. Absence of a token does not certify allergy safety, local formulation identity or personal tolerance. Confirm the current package.

The original extraction keeps its unapproved flags; `data-research/output/release-review.json` separately documents technical release decisions. No record has independent clinical approval. The runtime catalogue is `src/data/catalog-release.json`; it is not generated during a user request or silently refreshed in production.

Selection uses explicit label gates and disclosed preference tiers, not invented medical weights or score-to-brand thresholds. Equivalent candidates use stable IDs rather than pretending one brand is clinically better. AAD/FDA sources support basic routine principles; they do not endorse these products.

## Run locally

Use Node.js 24 LTS and npm:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. On Windows, `BASLAT.cmd` starts the local app. The example needs no credentials. For live use, copy `.env.example` to `.env.local`, set your server-only YouCam key and enable `ENABLE_LIVE_ANALYSIS` deliberately. Never commit this file or use a `NEXT_PUBLIC_` prefix for secrets.

Webpack is selected explicitly because Turbopack's Windows junction creation was restricted in the development environment.

## Hosting and privacy

Vercel runs the Next.js app with a connected **private Vercel Blob** store. A stable random `SESSION_SECRET` of at least 32 characters signs HTTP-only, SameSite cookies and derives an AES-256-GCM state-encryption key. Configure `CRON_SECRET` for the daily maintenance job. Production live analysis fails closed without durable state and a signing secret. The example remains available.

The private state contains opaque session/task IDs, scores, task status and allowance counters. It contains no photo or profile answers. Sessions become inaccessible after 30 minutes. Expired records are pruned by subsequent state mutations or the daily cleanup. Clearing a finished session removes its result; the session allowance counter remains until expiry. Provider files follow the provider's own policy; clearing this app does not delete them.

Conditional writes with ETags protect task ownership and the shared reservation cap across workers. Default cap: 20 globally and 3 per session. Reservations are retained after uncertain submissions to avoid accidentally spending twice. Restarting or redeploying does not reset the hosted cap. This is a bounded hackathon demo, not a production abuse-prevention service; public visitors can exhaust its allowance. Resetting the private state or rotating the signing secret is an owner operation, not a client feature.

Local development uses process memory unless a private backend is explicitly configured. Local sessions do not survive a process restart. Do not expose the development server publicly.

## Verification

```sh
npm test
npm run check
npm run build
node scripts/browser-check.mjs
```

The domain suite evaluates 240 combinations of skin type, sensitivity, treatment and ingredient restrictions, checks score boundaries and source invariants, and tests concurrent session/global reservations. These verify implementation behavior, not clinical effectiveness.

The browser check uses an isolated installed Chrome profile, tests desktop and 390px mobile layouts, sources, AM/PM, editing, unknown-ingredient fallback, invalid files, consent and terminal-error recovery. Its provider-error fixture cannot create a real task. Set `APP_URL` to run against a hosted app. Generated QA files and session cookies are ignored by Git.

A tightly cropped fictional portrait previously completed a real V2.1 task with six measurements and six decoded maps. A wider portrait was rejected for insufficient face coverage and its units were refunded. Synthetic-person integration tests are not skin-analysis accuracy studies. Live checks are separate and require an explicit one-analysis flag.

## Refresh the data

See `data-research/README.md`. The checked-in runtime release works without Python or manufacturer access. Rebuilding research requires the excluded raw cache or a new batch fetch and Python dependencies. Review the resulting source and release diffs before publishing a changed catalogue.

## Architecture

`page.tsx` → profile/photo consent → server-only YouCam upload and task creation → session-owned polling and maps → deterministic label filtering → explained routine. The authored example bypasses the provider and durable store.

The API key remains server-only. Requests are bounded, image metadata is removed, cross-origin mutations are rejected, provider destinations are allowlisted, and missing measurements stay missing. There are no paid model calls in the recommendation path.

## Sources and assets

- [YouCam V2.1 API](https://docs.perfectcorp.com/reference/ai_skin_analysis/v2.1)
- [Provider file policy](https://docs.perfectcorp.com/develop/file_retention_period)
- `data-research/guidance.json`: general guidance and explicit limits
- `ASSET-PROMPT.md`: fictional portrait provenance
- `THIRD_PARTY_NOTICES.md`: source and license boundaries

Code: MIT. Third-party labels and trademarks retain their owners' rights.
