
## TLDR

Notions are **oversized, stylised and legible before they are realistic**. Favour 2.5D — a flat
illustration facing the camera is cheaper than a model and is the only way the ink-outline look is
affordable. Some attributes (hook size) cannot be shown by shape at all and need another channel.
Every notion also needs a **held** design, and knitting needs **two hands**.

> Rendering decisions and the rig constraints behind them live in `DESIGN-DECISIONS.md` in this
> folder. Three things from there that change what is worth designing:
> - the **ink outline is free** on a billboard and expensive on a model, so 2.5D is the cheaper *and*
>   better-looking option
> - poses are **species-agnostic**, so a "sitting at a wheel" pose authors once and works on every
>   animal — per-notion poses are cheap
> - the rig currently fills **one hand**, and its arm-clearance rule actively pushes arms apart, so
>   two-handed knitting needs a fix before it will look right

## Visual Design for Notions Guide: 

- Notions render at deliberately **non-realistic (oversized)** scale — at real scale they are invisible.
- use some kind of cheap effect for making notions easy to see visually- animated sparkles, halo, dark black outline as if they are an ink drawing, making them all gold, let's try a few options to aim for visual distinction rather than realism. 
- While Notions will get carried around by 3D NPCs, they don't... really need to be 3d.  Consider cheap design options that are "2.5D" or even SVGs constantly facing the user if that's cheaper 
- Some notions attributes may need to be communicated without the realistic shape: it's not realistic to have different size crochet hooks rendered in a way that looks right but we need some way of communicating a 1mm vs a 30mm crochet hook (a number maybe? an attribute window on top of our mostly diegetic UI?)

- A rigging note here is that all notions should look "right" when held by the NPCs: knitting in particular is a 2 handed operation. It would be ok to have a specific visual design per notion of what it looks like being *held*, which could even come with a pose (sitting at a spinning wheel, holding up a drop spindle, sitting or standing knitting with 2 hands, crochet with 1 hand, etc.)


## Packaging

Packaging belongs to the kind (footprints in slots, one picked per box):

| Notion | Packages |
| --- | --- |
| crochet hook | 1×1 single, or 2×1 set in a long case |
| knitting needles | 1×1 pair, or 1×2 long circular set |
| darning needle | 1×1 packet, or 1×2 sleeve of assorted sizes |
| stitch markers | 1×1 bag, or 2×2 tin |
| cable needle | 1×1 on a card |
| buttons | 1×1 card, or 2×1 long card |

Yarn's footprint comes from its weight; a pattern is always 2×2 (`catalog.js`). Only hooks and
needles carry a mm size.

TODO: pattern art is still placeholder (a book outline with a per-type cover icon,
characters/store/goods/art.js). Yarn is 3D with ball bands; gradients, sparkle and fuzz are YARN.md's
TODO.
