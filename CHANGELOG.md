# Changelog

What changed in L.Y.S. — Local Yarn Store, release by release. `main` is what's live on
[GitHub Pages](https://abolger-personal.github.io/local-yarn-store-game/); each release is built on its
own branch (`0.0.1`, …) and its entry here is finished before it merges into `main`.

## [0.0.1] — unreleased

### Changed
- Code comments trimmed to the minimum: game rules and design reasoning moved into the design docs
  under `ai_planning_sessions/`; comments that restated the code or told the history of a fix are gone
  (that history is in git).

### Added
- This changelog.

## [0.0.0] — 2026-10-12

The first public build: a three-day tutorial in a small yarn shop.

### The shop
- Owl, llama and lion customers browse, buy, sit and knit, wear what they made, and come back as
  regulars.
- Arrange stock on shelves, tables and the floor; customers notice only what's on top, and grouped
  stock sells.
- The Guestbook records each customer's visit — what they bought, what they made, and a selfie with it.
- A ball-band label shows what a hovered item or customer is: what they bought and what they're making.

### The tutorial
- Day 1: the Former Owner signs the Guestbook and hands over the shop; a friend comes in for a pot
  holder kit.
- Night: tomorrow's order on the supplier's packing slip, with the Guestbook open beside it.
- Day 3: the friend comes back and finishes the pot holder in the shop.

### Fixes in this build
- The game loads on GitHub Pages (the item atlas was fetched from outside the site).
- The tutorial friend no longer goes home sad with what they need on the table, or waits forever
  for a kit on the floor.
- Hovering an item lower in a stack shows that item.
