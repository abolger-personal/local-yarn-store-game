export const SHOTS_HAND_TUNED = {
  hat: { owl: { headYaw: -0.2, headPitch: 0.2, fov: 40, up: 0.7, k: 0.6, drop: 0.15, off: 0.2 } },
  scarf: {
    all: { headYaw: -0.85, headPitch: -0.9, fov: 60, up: 1.13, k: 0.86, drop: 0.67, off: 0 },
    llama: { headYaw: 0.3, headPitch: -0.45, fov: 40, up: 0.25, k: 1.51, drop: 0.55, off: 0.5 },
    lion: null,   // the shared shot bent its head down over the scarf: 14% of its eyes
  },
  shawl: {
    all: { headYaw: 2.6, headPitch: -0.1, fov: 40, up: 0.3, k: 2.2, drop: 0.35, off: 0, behind: true },
    owl: { headYaw: 2.6, headPitch: -0.1, fov: 40, up: 0.3, k: 1.51, drop: 0.35, off: 0, behind: true },
  },
  sweater: { llama: { headYaw: 0.2, headPitch: 0.43, fov: 40, up: -0.05, k: 1.6, drop: 0.81, off: 0.35 } },
  bag: {
    all: { headYaw: 0.25, headPitch: 0.16, fov: 42, up: 0.93, k: 1, drop: 0.8, off: 0.5 },
    llama: { headYaw: 0.25, headPitch: 0.16, fov: 42, up: 0.93, k: 1.32, drop: 0.81, off: 0.5 },
  },
  socks: {
    all: { headYaw: -0.3, headPitch: 0.1, fov: 50, up: 0.4, k: 1, drop: 0.95, off: 0.3 },
    llama: null,     // searched until a llama shot is tuned
  },
};
