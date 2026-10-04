// The playground (store.html): the shared shop boot (boot.js) plus every debug panel — lil-gui,
// the timer, the NPC state, the performance overlay. The real game view is game.js, which shares
// the same boot with none of these.

import { BUILD } from '../npc.js';
import { bootShop } from './boot.js';
import { drawDebug, drawTimer, installHud, autoBar, updatePerf } from './ui/hud.js';
import { buildGui } from './ui/gui.js';

/**
 * Remember which windows are folded. The collapse itself is native <details>; this only persists
 * the choice, because a POC is reloaded constantly and re-folding four panels every time is
 * exactly the tedium the folding was meant to remove.
 *
 * Every read and write is guarded: localStorage throws outright in some contexts (a browser set
 * to block site data, a screenshot/preview harness), and a dev overlay must not be able to take
 * the whole shop down with it.
 */
function restoreFolds() {
  const folds = /** @type {NodeListOf<HTMLDetailsElement>} */
    (document.querySelectorAll('.fold'));
  for (const el of folds) {
    try {
      const saved = localStorage.getItem(`lys.fold.${el.id}`);
      if (saved !== null) el.open = saved === '1';
    } catch { /* no stored state: the markup's own default stands */ }
    el.addEventListener('toggle', () => {
      try { localStorage.setItem(`lys.fold.${el.id}`, el.open ? '1' : '0'); } catch { /* ignore */ }
    });
  }
}

restoreFolds();
// On the HUD as well as in the console: when a fix "does not work", the first thing worth ruling
// out is that the page is running an older module than the one on disk.
document.getElementById('build').textContent = BUILD;

bootShop({
  steps: [['hud', installHud], ['gui', buildGui]],
  onHud: () => { drawDebug(); drawTimer(); },
  onFrame: (dt, progress) => {
    autoBar.style.width = `${progress * 100}%`;
    updatePerf(dt);
  },
  onFail: (html) => { document.getElementById('hud').innerHTML = html; },
});
