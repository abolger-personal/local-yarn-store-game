import { paintWornWood } from '../scene/worn-wood.js';
import { svgLettering } from './lettering.js';

const ENTRY = `
  <!-- The surround, after the Concord Museum's entry: a LOW pediment over a plain frieze, wide
       flat pilasters, and a recessed inner casing stepping in to the door. What keeps it charming
       rather than civic is restraint: shallow pitch (~15deg), no flutes, no dentils, plain boards.
       Never moves. -->
  <svg class="frame" viewBox="0 70 600 1110" aria-hidden="true">
    <defs>
      <!-- The worn wood (see the door's #worn) for the trim, one pattern per board direction: grain
           runs ALONG a board. Upright for pilasters and side casings, level for the cornice,
           frieze, architrave, head casing and tympanum, and along each raking board of the
           pediment (atan(82/294) = 15.6deg off level). The texture's grain is painted vertical. -->
      <pattern id="grainV" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
        <image class="worn-tex" width="220" height="220" />
      </pattern>
      <pattern id="grainH" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
        <image class="worn-tex" width="220" height="220" />
      </pattern>
      <pattern id="grainRakeL" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(74.4)">
        <image class="worn-tex" width="220" height="220" />
      </pattern>
      <pattern id="grainRakeR" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(105.6)">
        <image class="worn-tex" width="220" height="220" />
      </pattern>
      <linearGradient id="brassH" gradientUnits="userSpaceOnUse" x1="0" y1="192" x2="0" y2="224">
        <stop offset="0" stop-color="#fbe9a3" /><stop offset=".35" stop-color="#e0b64d" />
        <stop offset=".65" stop-color="#b8862b" /><stop offset="1" stop-color="#7d5517" />
      </linearGradient>
      <filter id="granite" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" />
        <feColorMatrix values="0 0 0 0 .2  0 0 0 0 .2  0 0 0 0 .22  0 0 0 -2 1.2" />
      </filter>
    </defs>
    <!-- Pediment: raking cornice, then a slightly shaded tympanum inside it -->
    <polygon points="6,162 300,80 594,162" fill="var(--trim)" />
    <polygon points="54,152 300,94 546,152" fill="#ebe7dd" />
    <polyline points="54,152 300,94 546,152" fill="none" stroke="#d6d1c4" stroke-width="2" />
    <!-- Cornice band, overhanging, with its shadow; plain frieze; thin architrave -->
    <rect x="10" y="156" width="580" height="18" fill="var(--trim)" />
    <rect x="20" y="174" width="560" height="5" fill="#cfc9bb" />
    <rect x="24" y="179" width="552" height="58" fill="var(--trim)" />
    <rect x="24" y="237" width="552" height="4" fill="#dcd7cb" />
    <rect x="20" y="241" width="560" height="12" fill="var(--trim)" />
    <rect x="24" y="253" width="552" height="3" fill="#cfc9bb" />
    <!-- The name on the frieze, as on the Concord Museum's: LOCAL YARN STORE in the house
         lettering (characters/store/ui/lettering.js), gilded. dressExterior() letters it here, from the
         same glyph table the bulletin board uses. The shop's name appears only here. The keyline
         is the door's #keyline; #brassH spans the line so the gilding does not restart per
         letter. -->
    <g id="frieze" filter="url(#keyline)"></g>
    <!-- Wide flat pilasters, with a soft shade toward their inner edge, and base blocks -->
    <rect x="30" y="256" width="72" height="874" fill="var(--trim)" />
    <rect x="498" y="256" width="72" height="874" fill="var(--trim)" />
    <rect x="94" y="256" width="8" height="874" fill="#e6e2d8" />
    <rect x="498" y="256" width="8" height="874" fill="#e6e2d8" />
    <rect x="24" y="1092" width="84" height="38" fill="var(--trim)" />
    <rect x="492" y="1092" width="84" height="38" fill="var(--trim)" />
    <rect x="24" y="1092" width="84" height="3" fill="#dcd7cb" />
    <rect x="492" y="1092" width="84" height="3" fill="#dcd7cb" />
    <!-- Recessed inner casing: one step in, in shadow, framing the door -->
    <rect x="102" y="256" width="396" height="874" fill="#e4e0d5" />
    <rect x="102" y="256" width="396" height="6" fill="#cfc9bb" />
    <rect x="102" y="256" width="5" height="874" fill="#d3cdbf" />
    <!-- Weathered paint: the worn wood showing faintly through every white board, its grain
         following each board -->
    <clipPath id="trimV">
      <rect x="24" y="256" width="84" height="874" />
      <rect x="492" y="256" width="84" height="874" />
      <rect x="102" y="296" width="16" height="834" />
      <rect x="482" y="296" width="16" height="834" />
    </clipPath>
    <clipPath id="trimH">
      <polygon points="54,152 300,94 546,152" />
      <rect x="10" y="156" width="580" height="100" />
      <rect x="102" y="256" width="396" height="40" />
    </clipPath>
    <clipPath id="rakeL"><polygon points="6,162 300,80 300,94 54,152 10,156" /></clipPath>
    <clipPath id="rakeR"><polygon points="594,162 300,80 300,94 546,152 590,156" /></clipPath>
    <g class="worn" opacity=".45">
      <rect x="0" y="70" width="600" height="1060" fill="url(#grainV)" clip-path="url(#trimV)" />
      <rect x="0" y="70" width="600" height="1060" fill="url(#grainH)" clip-path="url(#trimH)" />
      <rect x="0" y="70" width="600" height="200" fill="url(#grainRakeL)" clip-path="url(#rakeL)" />
      <rect x="0" y="70" width="600" height="200" fill="url(#grainRakeR)" clip-path="url(#rakeR)" />
    </g>
    <!-- Jamb inside the casing, seen when the door swings -->
    <rect x="118" y="296" width="364" height="834" fill="var(--reveal)" />
    <!-- Granite step -->
    <rect x="10" y="1130" width="580" height="50" rx="3" fill="#9c9e9d" />
    <rect x="10" y="1130" width="580" height="50" filter="url(#granite)" opacity=".5" />
    <rect x="10" y="1130" width="580" height="4" fill="#c4c6c4" />
  </svg>
  <div class="inside" aria-hidden="true"></div>

  <a id="door" href="%HREF%" aria-label="%LABEL%">
    <svg viewBox="0 0 360 830" aria-hidden="true">
      <defs>
        <!-- Brass: pale gold highlight down to a deep bronze, lit from above. -->
        <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fbe9a3" />
          <stop offset=".35" stop-color="#e0b64d" />
          <stop offset=".65" stop-color="#b8862b" />
          <stop offset="1" stop-color="#7d5517" />
        </linearGradient>
        <radialGradient id="brassBall" cx=".35" cy=".3" r=".75">
          <stop offset="0" stop-color="#fff3c4" />
          <stop offset=".35" stop-color="#e2b650" />
          <stop offset=".8" stop-color="#a06d1e" />
          <stop offset="1" stop-color="#6a450f" />
        </radialGradient>
        <!-- The emblem's flat brass plate: one gentle sheen across the whole emblem, in the
             drawing's own units (its bounds, x 113-302, y 551-718), so it does not restart per
             shape and nothing reads as a lit ball. -->
        <linearGradient id="plate" gradientUnits="userSpaceOnUse" x1="113" y1="551" x2="302" y2="718">
          <stop offset="0" stop-color="#ecc764" />
          <stop offset=".5" stop-color="#e0b64d" />
          <stop offset="1" stop-color="#cc9d3a" />
        </linearGradient>
        <!-- Lamplight through the glass: the shop is open and warm inside. -->
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f6dcae" />
          <stop offset="1" stop-color="#e2a85f" />
        </linearGradient>
        <!-- The shop's worn wood (characters/store/scene/worn-wood.js), painted by dressExterior() and
             multiplied over the base colour, as room.js tints it per stain. One tile stretched
             over each wooden surface (stretching runs along the grain), so no seams. Empty
             without script, which leaves plain, unworn wood. -->
        <pattern id="worn" width="1" height="1" patternContentUnits="objectBoundingBox">
          <image class="worn-tex" width="1" height="1" preserveAspectRatio="none" />
        </pattern>

        <filter id="soft"><feGaussianBlur stdDeviation="9" /></filter>
        <!-- Raised brass: a dark lip below, a bright one above, so it reads as metal ON the wood. -->
        <filter id="emboss" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="1.2" flood-color="#3b2408" flood-opacity=".55" />
          <feDropShadow dx="0" dy="-1" stdDeviation=".4" flood-color="#fff6d6" flood-opacity=".6" />
        </filter>
        <!-- Gold leaf on glass has no depth to cast, so it gets an outline instead of a shadow. -->
        <filter id="keyline" x="-10%" y="-10%" width="120%" height="120%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="grown" />
          <feFlood flood-color="#4a2f0c" />
          <feComposite in2="grown" operator="in" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="note" x="-10%" y="-10%" width="125%" height="130%">
          <feDropShadow dx="1" dy="4" stdDeviation="3" flood-color="#3b2408" flood-opacity=".35" />
        </filter>
        <linearGradient id="postit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fbe98a" />
          <stop offset="1" stop-color="#f1d462" />
        </linearGradient>
        <clipPath id="window"><rect x="50" y="50" width="260" height="330" rx="3" /></clipPath>
        <clipPath id="ball"><circle cx="180" cy="660" r="58" /></clipPath>
      </defs>

      <!-- The leaf -->
      <rect width="360" height="830" fill="#ddb987" />
      <rect class="worn" width="360" height="830" fill="url(#worn)" />

      <!-- Window: the lit shop, a few blurred skeins on a low shelf, a glint across the glass -->
      <g clip-path="url(#window)">
        <rect x="50" y="50" width="260" height="330" fill="url(#glass)" />
        <g filter="url(#soft)" opacity=".75">
          <rect x="40" y="360" width="290" height="14" fill="#9a6a3a" />
          <circle cx="85" cy="345" r="18" fill="#c4544a" />
          <circle cx="125" cy="348" r="15" fill="#e3b04b" />
          <circle cx="165" cy="344" r="19" fill="#6e9a8a" />
          <circle cx="210" cy="347" r="16" fill="#b77fa6" />
          <circle cx="250" cy="345" r="18" fill="#5b7bb0" />
          <circle cx="290" cy="348" r="15" fill="#e9dcc4" />
        </g>
        <polygon points="230,50 270,50 120,380 80,380" fill="#fff" opacity=".18" />
      </g>
      <!-- Window moulding -->
      <rect x="46" y="46" width="268" height="338" rx="4" fill="none" stroke="#a87c4c" stroke-width="8" />
      <rect x="40" y="40" width="280" height="350" rx="6" fill="none" stroke="#f0d3a6" stroke-width="2" opacity=".7" />

      <!-- Gold-leaf emblem, alone on the glass: two needles stuck in a ball of yarn, with a loose
           tail. The name is on the frieze above the door, once, so the door stays quiet. Drawn
           at full size and scaled down. An engraved flat brass plate (not a shaded ball): flat
           #plate, engraved wraps, keylined because a plate on glass casts no shadow. -->
      <g filter="url(#keyline)">
        <g transform="translate(180 205) scale(.8) translate(-180 -660)">
          <g stroke="url(#plate)" stroke-linecap="round" stroke-width="7">
            <line x1="205" y1="670" x2="122" y2="560" />
            <line x1="155" y1="670" x2="238" y2="560" />
          </g>
          <circle cx="122" cy="560" r="9" fill="url(#plate)" />
          <circle cx="238" cy="560" r="9" fill="url(#plate)" />
          <path d="M222 700 C 250 730, 275 712, 262 692 S 285 676, 300 700" fill="none"
                stroke="url(#plate)" stroke-width="4" stroke-linecap="round" />
          <circle cx="180" cy="660" r="58" fill="url(#plate)" />
          <!-- Engraved: each cut is a dark line with its lower wall catching the light, a pale copy
               of the same line showing just below it. The rim is cut too, so the ball still parts
               from the needles on a flat plate. -->
          <g clip-path="url(#ball)" fill="none" stroke-width="2.5" stroke-linecap="round">
            <use href="#wraps" stroke="#fbe9a3" transform="translate(0 0.6)" />
            <g id="wraps" stroke="#6a450f">
              <circle cx="180" cy="660" r="57" />
              <path d="M128 618 Q180 578 232 618" />
              <path d="M118 640 Q180 595 242 640" />
              <path d="M116 668 Q180 622 246 674" />
              <path d="M124 700 Q180 655 238 708" />
              <path d="M130 728 Q180 690 232 736" />
              <path d="M128 616 Q190 668 168 720" />
              <path d="M150 606 Q222 650 200 722" />
              <path d="M176 602 Q246 646 232 712" />
              <path d="M202 604 Q262 640 254 696" />
            </g>
          </g>
        </g>
      </g>

      <!-- Lock rail: a shadow line where the window section meets the lower panel -->
      <rect x="0" y="418" width="360" height="3" fill="#a87c4c" opacity=".6" />

      <!-- Raised lower panel: kept bare for the note -->
      <rect x="50" y="470" width="260" height="310" rx="3" fill="#c9a26f" />
      <rect x="64" y="484" width="232" height="282" rx="2" fill="#dfbd8c" />
      <rect class="worn" x="64" y="484" width="232" height="282" fill="url(#worn)" />
      <path d="M64 766 V484 H296" fill="none" stroke="#f3d7ab" stroke-width="2" />
      <path d="M64 766 H296 V484" fill="none" stroke="#9e7442" stroke-width="2" />

      <!-- The tip of the day: a sticky note on the panel, pinned by a pair of knitting needles.
           Needle tips, twice over. #tip is the slot a rotating tip will fill. -->
      <g transform="rotate(-4 180 628)">
        <g filter="url(#note)">
          <path d="M100 548 H260 V688 L240 708 H100 Z" fill="url(#postit)" />
          <path d="M260 688 L240 708 L244 692 Z" fill="#fbeea8" />
        </g>
        <g fill="#2f4a7a" text-anchor="middle"
           font-family="'Bradley Hand', 'Segoe Print', 'Marker Felt', 'Comic Sans MS', cursive">
          <text x="180" y="618" font-size="22" font-weight="700">Needle Tips</text>
          <line x1="128" y1="625" x2="232" y2="625" stroke="#2f4a7a" stroke-width="1.5" stroke-linecap="round" />
          <!-- The tip: on the front door the welcome ("Come in, we're open!"), at night "Closed". -->
          <text id="tip" x="180" y="658" font-size="19">
            <tspan x="180">%TIP1%</tspan>
            <tspan x="180" dy="26">%TIP2%</tspan>
          </text>
        </g>
        <g filter="url(#emboss)">
          <g stroke="url(#brass)" stroke-linecap="round" stroke-width="6">
            <line x1="120" y1="520" x2="190" y2="581" />
            <line x1="240" y1="520" x2="170" y2="581" />
          </g>
          <polygon points="200,590 188,583.3 192,578.7" fill="#b8862b" />
          <polygon points="160,590 172,583.3 168,578.7" fill="#b8862b" />
          <circle cx="120" cy="520" r="8" fill="url(#brassBall)" />
          <circle cx="240" cy="520" r="8" fill="url(#brassBall)" />
        </g>
      </g>

      <!-- Knob on its backplate, keyhole below -->
      <g filter="url(#emboss)">
        <rect x="322" y="380" width="22" height="96" rx="11" fill="url(#brass)" />
        <circle cx="333" cy="410" r="17" fill="url(#brassBall)" />
        <path d="M333 446 a4 4 0 1 1 0.1 0 l3 12 h-6 z" fill="#3b2408" />
      </g>
    </svg>
  </a>`;

/** `tip` is inserted unescaped: callers pass their own words, never a player's. */
export function exteriorMarkup({ href, label, tip }) {
  const holes = { HREF: href, LABEL: label, TIP1: tip[0], TIP2: tip[1] };
  return ENTRY.replace(/%(HREF|LABEL|TIP1|TIP2)%/g, (_, k) => holes[k]);
}

let woodUrl = '';
function wornWood() {
  if (woodUrl) return woodUrl;
  const tex = document.createElement('canvas');
  tex.width = tex.height = 512;
  paintWornWood(tex.getContext('2d'), 512, 512);
  return (woodUrl = tex.toDataURL());
}

export function dressExterior(root) {
  root.querySelector('#frieze').innerHTML =
    svgLettering('LOCAL YARN STORE', 300, 222, { paint: 'url(#brassH)' });
  const url = wornWood();
  for (const img of root.querySelectorAll('.worn-tex')) img.setAttribute('href', url);
}

export function swingOpen(door, then) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { then(); return; }
  door.classList.add('open');
  door.addEventListener('transitionend', function opened(e) {
    if (e.target !== door) return;
    door.removeEventListener('transitionend', opened);
    then();
  });
}
