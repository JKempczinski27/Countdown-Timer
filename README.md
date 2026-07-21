# Email Countdown Timer

A server-generated animated GIF countdown timer for email campaigns.
Email clients strip JavaScript, so the standard technique for a "live"
countdown is an `<img>` tag pointing at an endpoint that renders a fresh
countdown GIF at request time based on the server clock. This repo is
that endpoint, plus a preview harness and copy-paste Adobe (AJO /
Campaign) embed snippets.

## How it works (for non-technical stakeholders)

```
recipient opens email
        │
        ▼
  <img src="https://…/api/timer?end=2026-08-01T04:00:00Z&uid=…">
        │
        ▼
  CDN edge (Vercel) ── cached within the last second? ──► serve cached GIF
        │ no
        ▼
  serverless function renders a 60-frame GIF:
  the countdown as of *right now*, ticking down
  one frame per second for the next minute
        │
        ▼
  recipient sees a live countdown animating in their inbox
```

The email itself contains no code — just an image tag. Every time someone
opens the email, their mail client fetches the image, and the server draws
the countdown fresh. The GIF animates for 60 seconds (one frame per
second) and then freezes; if the deadline passes, it shows the configured
expired message ("OFFER ENDED") instead — never negative numbers.

## Endpoint

`GET /api/timer`

| Param | Required | Description |
| --- | --- | --- |
| `end` | yes | ISO 8601 **UTC** deadline, e.g. `2026-08-01T04:00:00Z`. Invalid/missing → plain-text 400. |
| `uid` | no | Opaque recipient identifier for cache-busting uniqueness in email image proxies. Never logged, never rendered. |
| `theme` | no | Theme key from `brand.config.ts` (default `default`). Unknown values fall back to the default theme. |

Responses:

- `200` — `image/gif`, 60 frames at 1 fps (or a single frozen expired
  frame if the deadline already passed), rendered at 2× pixel density
  (640×180 physical, 320×90 logical).
- `400` — plain-text error for bad `end` input. The endpoint never 500s
  on user-controllable input; an unexpected internal failure returns a
  single-frame static GIF of the Golf Galaxy header
  (`creative/golfgalaxy-header.png`, the same asset used for the intro)
  rather than a broken-image icon. If even that asset can't load, it
  degrades to a flat "Loading offer…" frame.

## Quick start

```bash
npm install
npm run dev
# preview page:
open http://localhost:3000
# endpoint directly:
curl -o timer.gif "http://localhost:3000/api/timer?end=2026-08-01T04:00:00Z"
```

The preview page at `/` shows the timer at several states (days out,
hours out, seconds from expiry, expired), displays each generated URL for
copy-paste, and includes a datetime picker to demo arbitrary deadlines.

## Deploy to Vercel

```bash
npm i -g vercel
vercel        # first deploy, follow prompts
vercel --prod # production
```

Notes:

- The timer route pins `runtime = 'nodejs'` because `@napi-rs/canvas` is
  a native binding — it cannot run on the Edge runtime. No config needed;
  it's declared in the route file.
- `@napi-rs/canvas` ships prebuilt binaries that work on Vercel's
  serverless runtime out of the box (this is why the project uses it
  instead of `node-canvas`, whose native deps break there).
- `next.config.mjs` marks `@napi-rs/canvas` as a server external package
  so the bundler leaves the native binary alone.

## CDN caching strategy — why `max-age=1` and not `no-store`

The endpoint returns:

```
Cache-Control: public, max-age=1, s-maxage=1, stale-while-revalidate=5
```

A countdown for a given deadline is **identical for every recipient
within the same second** — the GIF depends only on `end`, `theme`, and
the server clock. So instead of disabling caching (`no-store`), we let
Vercel's edge cache hold each rendered GIF for one second
(`s-maxage=1`). When a campaign send triggers thousands of opens per
second, the CDN collapses them to **~1 origin render per second per
deadline+theme** — the cache key is effectively `end + theme`. The
1-second TTL means nobody ever sees a countdown more than a second
stale, and `stale-while-revalidate=5` smooths over origin latency spikes
by serving the just-expired copy while a fresh one renders.

`no-store` would force an origin render for *every single open* — at
campaign volume that's thousands of concurrent canvas renders for
byte-identical output.

### The `uid` parameter and cache hit rate

`uid` varies per recipient, which makes each recipient's URL unique.
That uniqueness is useful on the *client* side — some email image
proxies key their caches on the full URL, and a unique URL prevents one
recipient's cached copy from being served to another fetch path — but it
also fragments the CDN cache: every distinct `uid` is a separate cache
entry, so the edge cache no longer collapses opens across recipients.

**At high volume, you may drop `uid` from the URL entirely to maximize
CDN hit rate.** The tradeoff: all recipients share one URL, so an
intermediary proxy that caches aggressively (beyond your `max-age`)
could serve a slightly staler copy to more people. Since every frame of
a countdown for the same deadline is identical for everyone anyway, the
blast radius is "some recipients see a timer a few seconds staler" —
usually the right trade against origin load. Keep `uid` if your ESP or
deliverability team wants per-recipient URLs for other reasons.

## Brand configuration

All visual styling lives in **`brand.config.ts`** as typed design
tokens — colors, typography, layout, and the expired-state message.
Nothing is hardcoded in the drawing code. The checked-in values are
placeholders; replace them with Golf Galaxy email brand guideline
values (the default theme's navy is sampled from the official Golf
Galaxy logo asset; the green accent is approximate). Add new named themes as additional keys of `themes`
and select them with `?theme=<name>`.

### Swapping in the brand font

1. Drop the licensed `.ttf`/`.otf` into `fonts/` as `brand.ttf` or
   `brand.otf`.
2. Restart / redeploy. That's it — `lib/fonts.ts` prefers
   `fonts/brand.*` and falls back to the bundled open-license Inter Bold
   if absent. The endpoint never crashes over a missing font.

Details in `fonts/README.md`.

### Creative wraps (background art behind the timer)

A theme can point at a full-bleed background PNG
(`background.imagePath`) and reserve a rectangle for the digits
(`layout.timerBox`), so the creative team designs around a known timer
zone — see the `goodgood` theme for a working example (placeholder art)
and **`creative/SPECS.md`** for the exact deliverable spec to hand to
design. A missing or unreadable PNG falls back to the flat background
color; it never breaks the endpoint.

A theme can also open with an **intro animation** (`intro` tokens): the
GIF holds on a "from" header image, crossfades into the countdown, then
ticks down — plays once and freezes, never looping back to the intro.
The `goodgood` theme demos a Golf Galaxy → Good Good Open opener. A
missing header image simply skips the intro. See `creative/SPECS.md`
for the header deliverable spec.

## Adobe integration

See `adobe-embed/` for copy-paste AJO and Campaign snippets and an
integration guide covering the custom-HTML-component workflow, the
live-text fallback pattern, UTC deadline conversion, and known
limitations (Gmail proxy caching, Apple MPP pre-fetch).

## Performance

The renderer reuses a single canvas across all 60 frames, computes the
color palette once and reuses it for every countdown frame, and stops
encoding early once the animation reaches the expired state (the GIF
plays once and freezes, so one expired frame suffices). Typical render
time for a full 60-frame GIF is roughly **200–400 ms** on a warm
serverless function (measure with `time curl …` against your
deployment); already-expired requests render a single frame in a few
milliseconds. With the CDN strategy above, origin renders are ~1/second
per active deadline regardless of open volume.

## Project structure

```
app/
  api/timer/route.ts   # the endpoint (Node runtime, validation, headers)
  page.tsx             # preview/test harness
  preview-controls.tsx # datetime picker (client component)
brand.config.ts        # ALL visual styling — typed design tokens
lib/
  gif.ts               # canvas drawing + gifenc encoding
  fonts.ts             # font registration with graceful fallback
fonts/                 # bundled fallback font + where brand font goes
adobe-embed/           # AJO + Campaign snippets, integration guide
```
