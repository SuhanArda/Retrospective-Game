export interface PickupState { active: boolean }
export function collectPickup(pickup: PickupState) {
  if (!pickup.active) return false;
  pickup.active = false;
  return true;
}
