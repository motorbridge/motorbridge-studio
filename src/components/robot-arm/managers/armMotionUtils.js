export function jointLimit(joint, limits) {
  return limits[Number(joint)] || { min: -3.14, max: 3.14 };
}

export function clampByLimit(value, lim) {
  return Math.max(lim.min, Math.min(lim.max, value));
}

export function armPreferredMode(vendor, availableModes = []) {
  if (String(vendor).toLowerCase() === 'robstride' && availableModes.includes('pos_vel_pp')) {
    return 'pos_vel_pp';
  }
  return 'pos_vel';
}
