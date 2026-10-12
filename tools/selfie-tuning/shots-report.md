# Selfie shot tuning

Generated 2026-10-11 by `tools/selfie-tuning/tune-shots.mjs` (raw results: `tools/selfie-tuning/shots-tuned.json`), written into
`characters/selfie.js` SHOTS. 120 combinations (3 species x every silhouette of hat, scarf,
sweater, bag and socks, plus the pot holder and the armful), 56 reached 0.4,
64 flagged. Wall time 274 min on 7 worker threads (stretched by the laptop sleeping mid-run; 31 worker wall-hours, sleep included). A first run without the test floors took 55 min; its shots failed
the selfie tests on the default body for 18 combinations, so the floors went into the search and everything was rerun.

**Score**: the mean of selfie.js's scored-search score over 6 random bodies of the species, each in a
random item of that silhouette at close-up detail, a body where the shot breaks a rule counting 0.
For a worn garment, a shot must also hold garments.test.mjs's floors for an authored shot on every
body: over 25% of the eyes seen and every pupil in view within 0.25 rad of the lens. (The test's third
floor, the horizon off level, was added to the tool after this run; here it was checked on the default
body only, when picking what to write.) **max** is the
best mean over all seeds; **min** that shot's worst body. Score distribution of max: lowest 0.270,
quartiles 0.366 / 0.393 / 0.419, highest 0.478.

**written**: `best` is the max shot. `#n, score` means the higher-scoring kept shots failed
garments.test.mjs on the default body, and the nth (its mean score given) was written instead. 15
were swapped; every combination has a shot that passes. Note a swap can drop a combination that
reached 0.4 back under it. Six did: llama scarf:trailing (0.419 to 0.350), llama sweater:cropped
(0.401 to 0.351), llama sweater:turtleneck (0.424 to 0.398), llama sweater:tunic (0.402 to 0.372),
lion hat:fisherman (0.400 to 0.392) and lion hat:headband (0.407 to 0.393).

## What stood out

- **The score tops out near 0.48**, against a 0.58 ceiling (fill 0.21 + made 0.37). Every owl
  hat and every owl and lion sweater reach 0.4, and so does the armful on every species. Socks, bags,
  the pot holder and the owl's scarves (2 of 8) do worst.
  0.4 is a high bar for a *mean over 6 random bodies*: per body the same shots often score 0.42+, but
  the smallest or oddest body drags the mean down.
- **Socks** are flagged on every silhouette of every species (0.30-0.38): the face must be big and the eyes in view,
  and the socks are a body-length away, so face size and how much sock shows pull against each other.
- **Bags** (held up; 2 of 21 reach 0.4) and the **pot holder** (0.37-0.38) sit just under the
  bar: what is held is small in a frame sized for the face. The owl's crossbody pouch is the
  outlier, at 0.270, far below every other combination.
- **The llama** reaches 0.4 least often of the three species (13 of 40): its long neck puts the head
  far from everything else.
- **Rules that killed most candidates**: on random draws, facing (0.7) and the body cover/centre
  rule throw out about 98% before the visibility buffer runs. Among near-winners, the test floors bite:
  the pupils can only turn ~0.25 rad, so lion head-turns and ~0.25 eye coverage on llama sweaters
  killed many. And the horizon tilt: a lens high and looking steeply down (which the score likes)
  flattens the -0.15 roll below the test's 0.1, behind most of the 15 swaps.
- **Slowest**: llama socks and the llama pot holder, 35-85 min each: tall body, far lens, many
  near-passing candidates that each need a full visibility pass on every body.
- **Shawl, a behind-shot score**: easy and sound to build, by flipping the facing rule (the back,
  not the face, toward the lens), dropping the phone-hand and eye rules, and scoring the shawl's
  visible share and fill. Not built.

## Flagged: under 0.4 after 10 seeds (64)

| species | combination | max | min | bodies passed | seeds | written |
| --- | --- | --- | --- | --- | --- | --- |
| llama | hat:beanie | 0.383 | 0.371 | 6/6 | 10 | #3, 0.379 |
| lion | hat:beanie | 0.393 | 0.371 | 6/6 | 10 | best |
| llama | hat:fisherman | 0.346 | 0.278 | 6/6 | 10 | best |
| llama | hat:earflap | 0.373 | 0.310 | 6/6 | 10 | best |
| llama | hat:hood | 0.340 | 0.296 | 6/6 | 10 | best |
| lion | hat:hood | 0.382 | 0.280 | 6/6 | 10 | best |
| llama | hat:headband | 0.361 | 0.323 | 6/6 | 10 | best |
| llama | hat:bucket | 0.395 | 0.363 | 6/6 | 10 | #2, 0.394 |
| llama | hat:cloche | 0.362 | 0.235 | 6/6 | 10 | #2, 0.362 |
| owl | scarf:cowl | 0.317 | 0.280 | 6/6 | 10 | best |
| lion | scarf:cowl | 0.392 | 0.325 | 6/6 | 10 | best |
| owl | scarf:infinity | 0.373 | 0.309 | 6/6 | 10 | best |
| llama | scarf:infinity | 0.395 | 0.375 | 6/6 | 10 | best |
| owl | scarf:ascot | 0.377 | 0.302 | 6/6 | 10 | best |
| owl | scarf:trailing | 0.357 | 0.309 | 6/6 | 10 | #3, 0.345 |
| lion | scarf:trailing | 0.370 | 0.330 | 6/6 | 10 | best |
| owl | scarf:skinny | 0.384 | 0.317 | 6/6 | 10 | #2, 0.379 |
| llama | scarf:skinny | 0.353 | 0.308 | 6/6 | 10 | best |
| owl | scarf:kerchief | 0.396 | 0.358 | 6/6 | 10 | best |
| llama | scarf:kerchief | 0.385 | 0.360 | 6/6 | 10 | best |
| llama | sweater:pullover | 0.356 | 0.331 | 6/6 | 10 | best |
| llama | sweater:cardigan | 0.380 | 0.309 | 6/6 | 10 | best |
| llama | sweater:vest | 0.383 | 0.333 | 6/6 | 10 | #5, 0.374 |
| llama | sweater:raglan | 0.364 | 0.295 | 6/6 | 10 | #2, 0.361 |
| owl | bag:shoulder bag | 0.358 | 0.319 | 6/6 | 10 | best |
| llama | bag:shoulder bag | 0.376 | 0.369 | 6/6 | 10 | best |
| lion | bag:shoulder bag | 0.390 | 0.383 | 6/6 | 10 | best |
| owl | bag:market bag | 0.355 | 0.333 | 6/6 | 10 | best |
| llama | bag:market bag | 0.375 | 0.369 | 6/6 | 10 | best |
| lion | bag:market bag | 0.392 | 0.387 | 6/6 | 10 | best |
| owl | bag:backpack | 0.391 | 0.379 | 6/6 | 10 | best |
| owl | bag:tote | 0.350 | 0.331 | 6/6 | 10 | best |
| llama | bag:tote | 0.373 | 0.369 | 6/6 | 10 | best |
| lion | bag:tote | 0.391 | 0.385 | 6/6 | 10 | best |
| owl | bag:bucket bag | 0.372 | 0.370 | 6/6 | 10 | best |
| llama | bag:bucket bag | 0.376 | 0.374 | 6/6 | 10 | best |
| lion | bag:bucket bag | 0.381 | 0.374 | 6/6 | 10 | best |
| owl | bag:crossbody pouch | 0.270 | 0.172 | 6/6 | 10 | best |
| llama | bag:crossbody pouch | 0.364 | 0.358 | 6/6 | 10 | best |
| lion | bag:crossbody pouch | 0.363 | 0.357 | 6/6 | 10 | best |
| owl | bag:drawstring bag | 0.368 | 0.365 | 6/6 | 10 | best |
| llama | bag:drawstring bag | 0.382 | 0.380 | 6/6 | 10 | best |
| lion | bag:drawstring bag | 0.388 | 0.381 | 6/6 | 10 | best |
| owl | socks:crew | 0.352 | 0.316 | 6/6 | 10 | best |
| llama | socks:crew | 0.312 | 0.267 | 6/6 | 10 | best |
| lion | socks:crew | 0.360 | 0.338 | 6/6 | 10 | best |
| owl | socks:knee-high | 0.365 | 0.342 | 6/6 | 10 | best |
| llama | socks:knee-high | 0.341 | 0.329 | 6/6 | 10 | best |
| lion | socks:knee-high | 0.370 | 0.348 | 6/6 | 10 | best |
| owl | socks:over-knee | 0.366 | 0.339 | 6/6 | 10 | best |
| llama | socks:over-knee | 0.304 | 0.249 | 6/6 | 10 | best |
| lion | socks:over-knee | 0.382 | 0.365 | 6/6 | 10 | best |
| owl | socks:slouch | 0.357 | 0.337 | 6/6 | 10 | best |
| llama | socks:slouch | 0.334 | 0.299 | 6/6 | 10 | best |
| lion | socks:slouch | 0.363 | 0.343 | 6/6 | 10 | best |
| owl | socks:leg warmers | 0.333 | 0.317 | 6/6 | 10 | best |
| llama | socks:leg warmers | 0.298 | 0.271 | 6/6 | 10 | best |
| lion | socks:leg warmers | 0.341 | 0.312 | 6/6 | 10 | best |
| owl | socks:slipper socks | 0.359 | 0.328 | 6/6 | 10 | best |
| llama | socks:slipper socks | 0.315 | 0.297 | 6/6 | 10 | best |
| lion | socks:slipper socks | 0.360 | 0.350 | 6/6 | 10 | best |
| owl | potholder | 0.380 | 0.360 | 6/6 | 10 | best |
| llama | potholder | 0.371 | 0.366 | 6/6 | 10 | best |
| lion | potholder | 0.373 | 0.372 | 6/6 | 10 | best |

## Skipped

- **shawl** (18 combinations): its shot is taken from behind by someone else, arms spread, and the
  score's rules assume a front selfie (face at the lens, the phone hand cut). The hand-tuned behind
  shots (`shawl.all`, `shawl.owl`) are kept as they were.

## Every combination

| species | combination | max | min | bodies passed | seeds | written |
| --- | --- | --- | --- | --- | --- | --- |
| owl | hat:beanie | 0.410 | 0.399 | 6/6 | 4 | best |
| llama | hat:beanie | 0.383 | 0.371 | 6/6 | 10 | #3, 0.379 |
| lion | hat:beanie | 0.393 | 0.371 | 6/6 | 10 | best |
| owl | hat:slouch | 0.442 | 0.429 | 6/6 | 1 | best |
| llama | hat:slouch | 0.430 | 0.416 | 6/6 | 1 | best |
| lion | hat:slouch | 0.420 | 0.301 | 6/6 | 1 | best |
| owl | hat:fisherman | 0.425 | 0.412 | 6/6 | 2 | #4, 0.420 |
| llama | hat:fisherman | 0.346 | 0.278 | 6/6 | 10 | best |
| lion | hat:fisherman | 0.400 | 0.377 | 6/6 | 4 | #6, 0.392 |
| owl | hat:beret | 0.458 | 0.446 | 6/6 | 1 | best |
| llama | hat:beret | 0.422 | 0.410 | 6/6 | 3 | best |
| lion | hat:beret | 0.455 | 0.390 | 6/6 | 1 | best |
| owl | hat:earflap | 0.446 | 0.409 | 6/6 | 1 | best |
| llama | hat:earflap | 0.373 | 0.310 | 6/6 | 10 | best |
| lion | hat:earflap | 0.426 | 0.398 | 6/6 | 1 | best |
| owl | hat:hood | 0.403 | 0.337 | 6/6 | 10 | best |
| llama | hat:hood | 0.340 | 0.296 | 6/6 | 10 | best |
| lion | hat:hood | 0.382 | 0.280 | 6/6 | 10 | best |
| owl | hat:headband | 0.402 | 0.375 | 6/6 | 2 | best |
| llama | hat:headband | 0.361 | 0.323 | 6/6 | 10 | best |
| lion | hat:headband | 0.407 | 0.393 | 6/6 | 8 | #6, 0.393 |
| owl | hat:bucket | 0.450 | 0.446 | 6/6 | 1 | best |
| llama | hat:bucket | 0.395 | 0.363 | 6/6 | 10 | #2, 0.394 |
| lion | hat:bucket | 0.465 | 0.444 | 6/6 | 1 | #2, 0.455 |
| owl | hat:cloche | 0.431 | 0.379 | 6/6 | 1 | best |
| llama | hat:cloche | 0.362 | 0.235 | 6/6 | 10 | #2, 0.362 |
| lion | hat:cloche | 0.427 | 0.419 | 6/6 | 1 | best |
| owl | hat:pixie | 0.441 | 0.431 | 6/6 | 1 | best |
| llama | hat:pixie | 0.405 | 0.390 | 6/6 | 5 | best |
| lion | hat:pixie | 0.436 | 0.428 | 6/6 | 1 | best |
| owl | scarf:cowl | 0.317 | 0.280 | 6/6 | 10 | best |
| llama | scarf:cowl | 0.411 | 0.360 | 6/6 | 10 | best |
| lion | scarf:cowl | 0.392 | 0.325 | 6/6 | 10 | best |
| owl | scarf:infinity | 0.373 | 0.309 | 6/6 | 10 | best |
| llama | scarf:infinity | 0.395 | 0.375 | 6/6 | 10 | best |
| lion | scarf:infinity | 0.404 | 0.343 | 6/6 | 1 | best |
| owl | scarf:ascot | 0.377 | 0.302 | 6/6 | 10 | best |
| llama | scarf:ascot | 0.445 | 0.416 | 6/6 | 2 | best |
| lion | scarf:ascot | 0.408 | 0.382 | 6/6 | 3 | best |
| owl | scarf:long | 0.406 | 0.369 | 6/6 | 6 | best |
| llama | scarf:long | 0.415 | 0.318 | 6/6 | 1 | best |
| lion | scarf:long | 0.461 | 0.296 | 6/6 | 1 | best |
| owl | scarf:trailing | 0.357 | 0.309 | 6/6 | 10 | #3, 0.345 |
| llama | scarf:trailing | 0.419 | 0.284 | 6/6 | 2 | #6, 0.350 |
| lion | scarf:trailing | 0.370 | 0.330 | 6/6 | 10 | best |
| owl | scarf:skinny | 0.384 | 0.317 | 6/6 | 10 | #2, 0.379 |
| llama | scarf:skinny | 0.353 | 0.308 | 6/6 | 10 | best |
| lion | scarf:skinny | 0.411 | 0.354 | 6/6 | 7 | best |
| owl | scarf:kerchief | 0.396 | 0.358 | 6/6 | 10 | best |
| llama | scarf:kerchief | 0.385 | 0.360 | 6/6 | 10 | best |
| lion | scarf:kerchief | 0.408 | 0.361 | 6/6 | 1 | best |
| owl | scarf:chunky wrap | 0.407 | 0.344 | 6/6 | 2 | best |
| llama | scarf:chunky wrap | 0.459 | 0.340 | 6/6 | 3 | best |
| lion | scarf:chunky wrap | 0.419 | 0.362 | 6/6 | 1 | best |
| owl | sweater:pullover | 0.410 | 0.378 | 6/6 | 2 | best |
| llama | sweater:pullover | 0.356 | 0.331 | 6/6 | 10 | best |
| lion | sweater:pullover | 0.444 | 0.385 | 6/6 | 1 | best |
| owl | sweater:cardigan | 0.424 | 0.336 | 6/6 | 4 | best |
| llama | sweater:cardigan | 0.380 | 0.309 | 6/6 | 10 | best |
| lion | sweater:cardigan | 0.456 | 0.417 | 6/6 | 1 | best |
| owl | sweater:vest | 0.407 | 0.368 | 6/6 | 3 | best |
| llama | sweater:vest | 0.383 | 0.333 | 6/6 | 10 | #5, 0.374 |
| lion | sweater:vest | 0.478 | 0.404 | 6/6 | 1 | best |
| owl | sweater:turtleneck | 0.407 | 0.296 | 6/6 | 2 | best |
| llama | sweater:turtleneck | 0.424 | 0.384 | 6/6 | 6 | #3, 0.398 |
| lion | sweater:turtleneck | 0.445 | 0.370 | 6/6 | 1 | best |
| owl | sweater:cropped | 0.435 | 0.418 | 6/6 | 1 | best |
| llama | sweater:cropped | 0.401 | 0.375 | 6/6 | 3 | #4, 0.351 |
| lion | sweater:cropped | 0.419 | 0.339 | 6/6 | 1 | best |
| owl | sweater:tunic | 0.414 | 0.328 | 6/6 | 1 | best |
| llama | sweater:tunic | 0.402 | 0.353 | 6/6 | 8 | #5, 0.372 |
| lion | sweater:tunic | 0.438 | 0.374 | 6/6 | 1 | best |
| owl | sweater:raglan | 0.424 | 0.352 | 6/6 | 1 | best |
| llama | sweater:raglan | 0.364 | 0.295 | 6/6 | 10 | #2, 0.361 |
| lion | sweater:raglan | 0.422 | 0.333 | 6/6 | 1 | best |
| owl | bag:shoulder bag | 0.358 | 0.319 | 6/6 | 10 | best |
| llama | bag:shoulder bag | 0.376 | 0.369 | 6/6 | 10 | best |
| lion | bag:shoulder bag | 0.390 | 0.383 | 6/6 | 10 | best |
| owl | bag:market bag | 0.355 | 0.333 | 6/6 | 10 | best |
| llama | bag:market bag | 0.375 | 0.369 | 6/6 | 10 | best |
| lion | bag:market bag | 0.392 | 0.387 | 6/6 | 10 | best |
| owl | bag:backpack | 0.391 | 0.379 | 6/6 | 10 | best |
| llama | bag:backpack | 0.403 | 0.389 | 6/6 | 8 | best |
| lion | bag:backpack | 0.409 | 0.394 | 6/6 | 2 | best |
| owl | bag:tote | 0.350 | 0.331 | 6/6 | 10 | best |
| llama | bag:tote | 0.373 | 0.369 | 6/6 | 10 | best |
| lion | bag:tote | 0.391 | 0.385 | 6/6 | 10 | best |
| owl | bag:bucket bag | 0.372 | 0.370 | 6/6 | 10 | best |
| llama | bag:bucket bag | 0.376 | 0.374 | 6/6 | 10 | best |
| lion | bag:bucket bag | 0.381 | 0.374 | 6/6 | 10 | best |
| owl | bag:crossbody pouch | 0.270 | 0.172 | 6/6 | 10 | best |
| llama | bag:crossbody pouch | 0.364 | 0.358 | 6/6 | 10 | best |
| lion | bag:crossbody pouch | 0.363 | 0.357 | 6/6 | 10 | best |
| owl | bag:drawstring bag | 0.368 | 0.365 | 6/6 | 10 | best |
| llama | bag:drawstring bag | 0.382 | 0.380 | 6/6 | 10 | best |
| lion | bag:drawstring bag | 0.388 | 0.381 | 6/6 | 10 | best |
| owl | socks:crew | 0.352 | 0.316 | 6/6 | 10 | best |
| llama | socks:crew | 0.312 | 0.267 | 6/6 | 10 | best |
| lion | socks:crew | 0.360 | 0.338 | 6/6 | 10 | best |
| owl | socks:knee-high | 0.365 | 0.342 | 6/6 | 10 | best |
| llama | socks:knee-high | 0.341 | 0.329 | 6/6 | 10 | best |
| lion | socks:knee-high | 0.370 | 0.348 | 6/6 | 10 | best |
| owl | socks:over-knee | 0.366 | 0.339 | 6/6 | 10 | best |
| llama | socks:over-knee | 0.304 | 0.249 | 6/6 | 10 | best |
| lion | socks:over-knee | 0.382 | 0.365 | 6/6 | 10 | best |
| owl | socks:slouch | 0.357 | 0.337 | 6/6 | 10 | best |
| llama | socks:slouch | 0.334 | 0.299 | 6/6 | 10 | best |
| lion | socks:slouch | 0.363 | 0.343 | 6/6 | 10 | best |
| owl | socks:leg warmers | 0.333 | 0.317 | 6/6 | 10 | best |
| llama | socks:leg warmers | 0.298 | 0.271 | 6/6 | 10 | best |
| lion | socks:leg warmers | 0.341 | 0.312 | 6/6 | 10 | best |
| owl | socks:slipper socks | 0.359 | 0.328 | 6/6 | 10 | best |
| llama | socks:slipper socks | 0.315 | 0.297 | 6/6 | 10 | best |
| lion | socks:slipper socks | 0.360 | 0.350 | 6/6 | 10 | best |
| owl | potholder | 0.380 | 0.360 | 6/6 | 10 | best |
| llama | potholder | 0.371 | 0.366 | 6/6 | 10 | best |
| lion | potholder | 0.373 | 0.372 | 6/6 | 10 | best |
| owl | pile | 0.417 | 0.395 | 6/6 | 1 | best |
| llama | pile | 0.436 | 0.419 | 6/6 | 1 | best |
| lion | pile | 0.421 | 0.388 | 6/6 | 1 | best |
