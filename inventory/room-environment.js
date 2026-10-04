// The image-based light every page lights its scene with: three's RoomEnvironment, put back to the
// room it was in three 0.160, which is the room every brightness on these pages was tuned under.
//
// Newer three changed it twice. r183 lowered the room 3.5 units (scene.position.y = -3.5), so the
// probe now sits nearer the ceiling lights. And its overhead point light is now always 900 cd: in
// 0.160 that was only when a renderer was passed in, and we never passed one, so we got 5.
// Undoing both keeps the look; drop this and use `new RoomEnvironment()` to take the new room.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function roomEnvironment() {
  const room = new RoomEnvironment();
  room.position.y = 0;
  room.traverse((o) => { if (o.isPointLight) o.intensity = 5; });
  return room;
}
