// DESIGN-DECISIONS.md §7: three 0.160's room, which every page's brightness was tuned under.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function roomEnvironment() {
  const room = new RoomEnvironment();
  room.position.y = 0;
  room.traverse((o) => { if (o.isPointLight) o.intensity = 5; });
  return room;
}
