# Sit and knit: the craft animation

Draft: `characters/craft-anim.js`, test page `characters/sit-and-knit.html`. What the WIP looks
like is VISUAL-DESIGN-FINISHED-OBJ.md §4b; what it tells the player is PROJECTS-AND-AUTHORSHIP.md
§1. This file holds the animation's rules and tuning.

## 1. Layering

- The hand motion is an **additive layer** on `POSES.sit`, passed to `stepMotion` as `add` (the
  same hook the walk uses) and summed after the springs. A 1.5 Hz stitch rhythm pushed through a
  0.35 s spring comes out as mush.
- Per frame: `stepCraft` → `stepMotion` → whoever owns the root places it (the chair) →
  `poseCraft`. Nothing allocates per frame.

## 2. The hold pose

- `HOLD`, added to `sit`: upper arms forward and in, paws reaching down toward the lap, head down
  to look at the work. Searched, not eyeballed: the pose that brings the paws nearest the working
  edge over every species and individual (mean 0.26 m).
- The rig's arms are short (upper arm + forearm 0.17) against shoulders 0.17–0.24 off the midline
  and a belly 0.22 deep, so **the paws cannot meet in front of the body** at any pose. A full
  elbow bend makes it worse: with the shoulder above the lap, folding the forearm lifts the paw
  away from a lap-height edge (0.35 m mean at +1.5 bend). The lion's and llama's `clampArmOut`
  also stops the upper arms coming in past the mane or fleece.

## 3. The stitch

- **Seconds per stitch** for a skill-3 crafter: knit 0.7, crochet 0.9. A `speed` of 1.5 looks right.
- **Skill 1–5** sets pace and steadiness: stitch rate 0.55× at skill 1 to 1.35× at skill 5; a
  hesitation before each stitch of up to 0.6 stitch-lengths at skill 1 and none at skill 5,
  different every stitch but reproducible; a novice's hand motions are big and effortful, an
  expert's small.
- One stitch is four curves (reach, wrap, pull, push), all zero at both ends so a loop of stitches
  has no seam. **Knit:** the left tip rests on the working edge, the right goes in from the front,
  through to behind it, wraps, and comes back: the tips cross every stitch. **Crochet:** the hook
  goes through the edge, circles for the yarn-over behind it (the hook spins with it), comes back
  and draws the loop up and out. Nothing leaves the edge's height while crossing it.

## 4. The piece

- The working edge sits 0.03 above the top of the thighs, clear in front of the belly, measured
  once per body in the hold pose (leg length, belly and arms vary across every individual).
- Size from how much yarn the pattern takes: a hat is 2×, a sweater 5.5× the base piece (0.10
  wide). Its length grows with `progress` (the sim's to set).
- Drape: straight down onto the lap, forward to the knees, over them and down to the floor, then
  along the floor. An edge already past the knees (a big belly over short thighs) goes straight down.

## 5. Tools and yarn

- Comic-chunky, **held at the middle**: as much sticks out behind the paw as reaches the tip.
  Needles taper to a point and end in a knob; the hook is a straight rod with a barb.
- The tool tips are put exactly on the working edge; the tools are sized to reach. The tips cross the
  edge on every stitch, for every body, piece size and craft; the grip sits 40–60% from butt to tip.
- Tools stay clear of the torso (0.94 of its coat-bulged radii), the wings and the arms; nothing goes
  through the torso, chair or floor.
- Where a wing encloses the paw (the owl), the tool is gripped against the wing's surface, where
  the line from the tip is tangent to it, so neither half goes through the wing. The wing is
  inflated 1.2× for this (its feathers measure up to 1.13×).
- A ball of yarn on the floor beside the chair, a sagging strand from it to the working tip. One
  material per yarn colour across the cast, so a crowd of knitters does not multiply them.

## 6. Running out (PROJECTS-AND-AUTHORSHIP.md §1)

Knitting stops and the hand rhythm fades. The head comes up off the work to the tail, then glances
off at the yarn wall (`wallYaw`, a head turn) and back, on a 4 s cycle. The ball is gone; the tail
dangles from the tip.

## 7. The ready sparkle (`characters/sparkle.js`)

- PROJECTS-AND-AUTHORSHIP.md §1, "the gap, closed". Not a craft animation: it plays wherever the
  customer is the moment their wants empty. Fired by `checkReady` (cast.js) when a buy makes a WIP
  ready.
- Five four-point stars in a cluster above the head, one draw. Unlit and not tone-mapped, so the
  shop's ACES exposure cannot dull it.
- A pop to 1.35× in 0.18 s, settling to 1, a ±12% twinkle pulse while it spins, then it shrinks
  away over the last half second: 3 s in all.
- Legibility floor: at least 3 stars, the biggest at least 20px across at the shop camera.

## 8. Open

- The full piece (colourwork, shape, where it rests): VISUAL-DESIGN-FINISHED-OBJ.md §4b TODO(spec).
