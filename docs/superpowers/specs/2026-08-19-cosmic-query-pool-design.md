# Cosmic query pool expansion — design

2026-08-19 · status: approved by user (full quip list reviewed in conversation)

## Context

The `✦ i'm feeling cosmic` button on the Astra search page draws a random query from
`COPY.placeholders` in `search/astra.js` — a pool of only **6** quips, which is also
the search box's rotating placeholder text. It repeats constantly. The user asked for
"more results" for the button, clarified as: expand the placeholder/cosmic query pool.
(Results-page behavior — pagination, caps — stays exactly as-is.)

## Design

Expand `COPY.placeholders` from 6 → **48** quips, keeping the site's dry/cosmic voice.
The single shared pool continues to serve both the placeholder rotation
(`rotatePlaceholders`) and the cosmic button (`cosmicQuery`) — no split, no
architecture change. `cosmicQuery`'s exclude-current-input behavior is unchanged.

Longer quips truncate gracefully as CSS placeholders and fill the input fine on
cosmic click, so no length cap beyond taste (all ≤ 48 chars).

### The pool (approved verbatim)

Existing 6, plus 42 new:

```
why is the sky blue, fr?
prove I'm not a robot…
best tacos near mars
how do black holes even
is water wet. settle it.
teach a goldfish calculus
do astronauts do their own laundry
the moon landing but make it fashion
why do we park on driveways
explain wifi to a medieval peasant
are aliens ghosting us
what's the deal with dark matter, actually
can you cry in space
ranking the planets by vibes
how many pizzas fit in the observable universe
did the chicken cross the event horizon
why is pluto not a planet. fight me.
do black holes dream
what if the moon is just very shy
speedrun guide to the heat death of the universe
is mercury okay. genuinely asking.
how to apologize to a satellite
the sun's skincare routine
can fish get thirsty
what does the ISS smell like
astrology but peer-reviewed
why is it called a building when it's already built
are there wifi dead zones in the bermuda triangle
do parallel universes have parallel parking
how loud is the sun
what's jupiter's great red spot so angry about
can you hear meowing in space
the oxford comma: a space opera
why is time. like, in general.
do satellites get bored
what if gravity is just social pressure
how to file taxes in zero-g
is the ocean space but wet
why does the moon follow my car
can a telescope see itself
what do pigeons think of airplanes
how many humans could outrun a comet
the andromeda galaxy is coming. should i worry
what sound does a supernova actually make
do worms have opinions about soil
why are manhole covers round (real answers only)
could the moon win a fight against the sun
what's the point of neptune
```

## Out of scope

- Results-page pagination/scroll caps (unchanged)
- `loadingQuips`, `aiHeaders`, other COPY lists (unchanged)

## Testing

- `node --check search/astra.js` (syntax)
- Headless Chromium: load `/search/`, sample the hero placeholder rotation + fire the
  cosmic button repeatedly; assert every query drawn comes from the pool and repeats
  are non-adjacent across a handful of clicks.
