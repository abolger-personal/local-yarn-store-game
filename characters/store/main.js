import { BUILD } from '../npc.js';
import { bootShop } from './boot.js';
import { drawDebug, drawTimer, installHud, autoBar, updatePerf } from './ui/hud.js';
import { buildGui } from './ui/gui.js';

function restoreFolds() {
  const folds = /** @type {NodeListOf<HTMLDetailsElement>} */
    (document.querySelectorAll('.fold'));
  for (const el of folds) {
    try {
      const saved = localStorage.getItem(`lys.fold.${el.id}`);
      if (saved !== null) el.open = saved === '1';
    } catch { /* ignore */ }
    el.addEventListener('toggle', () => {
      try { localStorage.setItem(`lys.fold.${el.id}`, el.open ? '1' : '0'); } catch { /* ignore */ }
    });
  }
}

restoreFolds();
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
