/* One portrait path per stable species ID. Missing art stays empty. */
function creaturePortraitPath(id) {
  return CREATURE_PORTRAITS[id] || null;
}
