# Adobe Email Platform Integration Guide

This folder contains copy-paste-ready snippets for embedding the countdown
timer in Adobe email surfaces:

| File | Surface |
| --- | --- |
| `ajo-snippet.html` | Adobe Journey Optimizer (AJO) |
| `campaign-snippet.html` | Adobe Campaign (Classic / Standard) |

Both snippets are structurally identical — a table-cell-wrapped `<img>`
pointing at `/api/timer` plus a live-text fallback line — and differ only
in personalization syntax for the `uid` cache-busting parameter.

## Adding the block in AJO's email designer

AJO's visual designer can rewrite or strip dynamic URLs placed in standard
image components. To keep the URL intact:

1. In the email designer, open the **Content components** palette and drag
   an **HTML** component (custom HTML block) into the layout where the
   timer should appear.
2. Click the component, open its source editor, and paste the entire
   contents of `ajo-snippet.html`.
3. Replace the placeholder origin, deadline, and personalization
   expression (see the comments at the top of the snippet).
4. Preview with a test profile: the personalization expression should
   resolve to a real value in the rendered URL, and the image should load.

Because the URL lives inside a raw HTML component, the designer treats it
as opaque and won't rewrite the query string. Adobe's link tracking may
still wrap `<a>` tags around it if you add one — that's fine and doesn't
affect the image request.

For Adobe Campaign, paste `campaign-snippet.html` directly into the
delivery's HTML source view.

## The live-text fallback pattern (always do this)

A meaningful share of recipients has images blocked (corporate Outlook
defaults, user settings, some privacy tools). The timer must never be the
only place the deadline is stated.

Both snippets therefore pair the image with a plain-HTML text line
directly beneath it:

```
Ends Friday, August 1 at midnight ET
```

Keep that line (and the image's `alt` text) in sync with the `end` param
whenever you set up a new campaign. With images blocked, the recipient
still sees the deadline; with images on, they get the animated urgency on
top of it.

## Accessibility & compliance (alt text)

Alt text is an HTML attribute on the `<img>` tag — it lives in the email
snippet, **not** in the GIF the endpoint serves (there's no field in an
image file a screen reader can read). So alt text is authored per
campaign in the snippet, and both snippets ship with it filled in.

For a countdown timer this is a genuine compliance requirement, not a
formality (WCAG 2.1 SC 1.1.1 Non-text Content; relevant to ADA and
Section 508 programs):

- **The animation conveys nothing to assistive tech.** A screen-reader
  user, and anyone with images off, gets only the alt text and the
  live-text line — so those must carry the actual deadline.
- **State the deadline in words: date, time, and timezone.** Good:
  `alt="Sale ends Friday, August 1 at midnight ET"`. Non-compliant:
  `alt="countdown timer"`, `alt="timer.gif"`, or an empty/missing alt.
- **Don't describe the ticking.** Alt should convey the *information*
  (when the offer ends), not narrate the visual ("numbers counting
  down"). Screen-reader users need the fact, not the effect.
- **Two layers, both required.** The `alt` attribute covers assistive
  tech reading the image; the live-text line beneath the timer covers
  images-blocked rendering and is itself read by screen readers. Ship
  both, and keep both in sync with the `end` param.

Because the deadline is identical for every recipient, the alt text is a
single static string per send — no personalization needed. The one
discipline is updating it (and the live-text line) whenever the `end`
value changes, so they never contradict the timer.

## Timezone guidance: the `end` param is UTC

The endpoint interprets `end` strictly as ISO 8601 UTC (`...Z` suffix).
Convert your marketing deadline to UTC before building the URL:

- **ET is UTC-4 during daylight saving time (roughly mid-March to early
  November) and UTC-5 otherwise.**
- "Midnight ET on August 1" (i.e. the end of July 31) during EDT is
  `2026-08-01T04:00:00Z`.
- "Midnight ET on December 15" during EST would be `2026-12-15T05:00:00Z`.

Double-check the offset for deadlines near DST transitions. A quick
sanity check: paste the URL into a browser and confirm the countdown
matches your expectation.

## Known limitations (inherent to email image proxies — all vendors)

These behaviors are properties of how mailbox providers proxy images.
They affect every countdown-GIF vendor identically; no service avoids
them.

- **Gmail image-proxy caching on reopens.** Gmail fetches images through
  its proxy and may serve a cached copy when a recipient reopens a
  message. The countdown they see can be the one generated at their
  *first* open, not the current moment. The 60-frame animation keeps the
  timer accurate for a minute after that fetch, and the short CDN TTL
  keeps the origin copy fresh, but a reopened email may show a stale
  timer.
- **Apple Mail Privacy Protection (MPP) pre-fetching.** MPP fetches
  images at (or near) *delivery* time from Apple's relays, regardless of
  when — or whether — the user opens the email. For MPP users, the timer
  reflects delivery time, not open time.

**Why the expired-state design mitigates both:** the worst failure mode
for a countdown is showing time remaining after the offer has ended —
that's a broken promise. This service can't fully prevent *stale-but-
still-valid* countdowns (nothing can, given proxy caching), but the
server renders the expired state the moment the deadline passes, the
animation itself ticks into the expired state if the deadline falls
within its 60-second window, and the GIF plays once and freezes rather
than looping back to a stale time. Combined with the live-text fallback
stating the deadline in plain words, a cached or pre-fetched image never
tells a recipient an offer is still open when the copy around it says
otherwise.
