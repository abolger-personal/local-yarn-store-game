
## TLDR

Yarn is a centerpiece of this game. Visually it should to come in an overwhelming variety of colors, ball bands, gradients, sizes, shapes (at least balls, cones, and skeins), sparkle level, fuzziness, and textures. Non visually, thickness, yardage, and material are also important. 

Yarn is 3D (low-poly, matcap, ink outline; DESIGN-DECISIONS.md 'Yarn asset spike'). Notions stay 2.5D.
Every yarn also needs a **held** design with a flat ball band, and knitting needs **two hands with the yarn on the lap**, **crochet needs 1 hand with the yarn on the lap**.

> Rendering decisions and the rig constraints behind them live in `DESIGN-DECISIONS.md` in this
> folder.

## Visual Design for Notions Guide: 

- Yarns go on the same items as grids at roughly the same scale but have more vertical 2.5D variation: they can be anywhere from 1x1x1 (thread, lace weight yarn) to 3x3x3 (super bulky housewares yarn, used in rug patterns)

- as with notions, aim for visual distinction rather than realism. 

- clicking on a yarn will highlight it and make it glow for placement the same as for a notion, but (like a notion) it will also pop up an info box about that item with more detail in it. 

- A rigging note here is that all yarn should look "right" when held by the NPCs: knitting in particular is a 2 handed operation. It would be ok to have a specific visual design per notion of what it looks like being *held*, which could even come with a pose (sitting at a spinning wheel, holding up a drop spindle, sitting or standing knitting with 2 hands, crochet with 1 hand, etc.)

## Colour count

48 distinct colours (`YARN_COLOR_COUNT`): enough for a rainbow wall, the "overwhelming variety"
above. The catalog holds only the count; the palette lives in the renderer.

## TODO

- **TODO(spec):** gradients, sparkle and fuzziness are not modelled; each yarn is one flat hue
  (`colorIndex`). Tracked in YARN-ASSET-SPIKE.md §6.
- **TODO(spec):** pattern atlas cells are placeholder silhouettes (characters/store/goods/art.js); real illustrations to come.
