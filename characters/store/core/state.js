export const items = [];

export const displays = [];
export const seats = [];

export const props = [];

export const cast = [];

export const aim = { active: null, hovered: null };

export const drag = {
  index: -1, target: null, displayId: null,
  downX: 0, downY: 0, moved: false, pickedThisPress: false,
};

export const mover = { m: null, sel: null, ox: 0, oz: 0, from: null, ok: true, fresh: false };

export const clocks = {
  elapsed: 0,
  auto: 0,
  day: 0,
};

export const shop = { world: null, day: 0, dayT: 0, hudDirty: true, viewDirty: true, pastBooks: [],
  press: null, watched: new Set() };

export const touchView = () => { shop.viewDirty = true; };
export const touchHud = () => { shop.hudDirty = true; shop.viewDirty = true; };

const take = (k) => () => {
  if (!shop[k]) return false;
  shop[k] = false;
  return true;
};
export const takeViewDirty = take('viewDirty');
export const takeHudDirty = take('hudDirty');
