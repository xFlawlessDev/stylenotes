# Design decisions

One line per decision, per R-31. If a reason cannot be written in one line, the
decision is wrong.

**Dials:** ENERGY 2 (calm, matching the product's own promise), RHYTHM 3
(sections vary visibly), MOTION 1 (hover and focus states only, no scroll
animation, no loops).

## Color

| Decision | Reason |
| --- | --- |
| Palette copied from the app (`src/routes/layout.css`) | Every screenshot on the page is a picture of that app; a different accent would make it look like a different product. |
| One accent (steel blue), used on links and the primary CTA only | The accent marks "go here"; spreading it across icons, chips and borders removes its meaning. |
| No radial glow or aurora behind the hero | The app uses a subtle aurora inside its own windows; at page scale it becomes a generic orb, which reads as a default. |
| Flat `surface-container-lowest` bands to separate sections | A 2-3% tonal step is enough hierarchy without inventing a second color. |
| Green reserved for the one "signed/verified" check mark | A status color only appears where there is a status. |
| Dark default, light available via toggle | The app is a desktop writing tool that ships dark-first; the toggle is real and persists to the same key the app reads. |

## Layout

| Decision | Reason |
| --- | --- |
| Left-aligned hero, not centered | Centered hero + two pills + screenshot is the default landing shape; left alignment reads as a document, which is what the product is. |
| Features split into 3 primary rows and 6 supporting entries | Notes, tasks and the graph are the product; the rest are conveniences, and eight equal cards would claim otherwise. |
| Gallery is a 2-column grid, the rest are 1- or 2-column asymmetric | Screenshots are the evidence; giving them a uniform card grid would flatten them into decoration. |
| MCP exposure shown as stacked rows, not a table | A two-column table at 320px either overflows or hides its second column behind a horizontal gesture. |
| Section spacing alternates 4rem and 6rem | Uniform padding makes sections read as one flat strip. |
| Borders do the separating, shadows do not | Only one surface is elevated (the hero screenshot); everything else sits flat on the page. |

## Components

| Decision | Reason |
| --- | --- |
| Glass (`backdrop-filter`) on exactly one element: the hero screenshot | Glass is an accent; using it on the header, cards and CTA as well would leave nothing as foreground. |
| Two radii only: `rounded-lg` for surfaces, `rounded-xl` for the hero frame | Pill-everything erases the difference between a button, a card and a chip. |
| No badge, pill or dot above the H1 | "Free & open source · works offline" is a fact; it belongs in the subheadline, where it reads as content instead of ornament. |
| Lucide icons, one per feature, 14-16px | The set matches the app's own icon language; icons stay secondary to the labels, which carry the meaning. |
| Native `<details>` for the FAQ | Works before hydration, is keyboard-operable, and puts the answer text in the HTML for crawlers. |
| Header is solid and 56px tall | A blurred, taller sticky header costs a phone a third of its viewport. |
| Hamburger is labeled (`Menu` / `Close menu` in a `sr-only` span) and swaps to an X | A bare hamburger assumes the user knows what it does. |
| Every link and icon control has a 44px minimum hit area | The visual can stay small; the touch target cannot. |

## Typography

| Decision | Reason |
| --- | --- |
| Inter, same as the app | The site must look like a photograph of the product, not a redesign of it. |
| Display sizes are `clamp()`, 30px to 56px | A fixed 56px headline overflows a 320px viewport and dominates a tablet. |
| No uppercase + wide tracking labels | It is a "technical" costume; the section headings already say what the section is. |
| Body copy at 13-15px, matching the app's scale | The app is dense by design; the site keeps that density rather than inflating it. |

## Motion

| Decision | Reason |
| --- | --- |
| Hover and focus transitions only | Nothing on the page needs to animate to be understood; endless loops and scroll reveals are noise. |
| `prefers-reduced-motion` disables the remaining transitions | The app respects it, and so must the site. |
