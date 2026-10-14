/* Regions that break the usual routine (challengers, a device, then the leader):
   a challenger who stops the player on the trail, and leader arenas with a rule of
   their own, explained before the fight and when it starts. */

// --- Field rules for a leader's arena.
// Arena Pasang floods at high tide: every creature on the field stays Basah.
// Kampung Bengkel's arena runs on whatever the workshop contract left it: the factory's
// current when the contract was signed, a rolling blackout when the town waited.
function leaderFieldRule(id) {
  if (id === 29) return 'tide';
  if (id === 38) {
    const choice = civicState().choices.contract;
    return choice === 0 ? 'surge' : choice === 1 ? 'blackout' : null;
  }
  return null;
}
const FIELD_POWER = Object.freeze({
  surge: { Listrik: 1.25, Logam: 1.15 },
  blackout: { Listrik: 0.6 },
});
// The arena's multiplier for a move's damage, for both sides alike.
const fieldPower = mv => FIELD_POWER[battle?.field]?.[mv.type] ?? 1;
// The tide keeps a creature Basah: topped up before its turn's conditions count down.
function soakField(m) {
  if (battle?.field !== 'tide' || !m.hp) return;
  m.conditions ??= {};
  m.conditions.soaked = Math.max(m.conditions.soaked || 0, 2);
}
// Called as a battle opens: records the arena's rule and says it in the log.
function beginFieldRule(id) {
  const rule = id === null || !battle ? null : leaderFieldRule(id);
  if (!rule) return;
  battle.field = rule;
  [...state.team, ...battle.enemies].forEach(soakField);
  battle.log += ' ' + I18N.t(`field.${rule}.log`);
}
// The tide stays in the arena: nobody leaves it still Basah.
function endFieldRule(b) {
  if (b?.field !== 'tide') return;
  for (const m of [...state.team, ...(state.storage || [])]) if (m.conditions) delete m.conditions.soaked;
}
// The leader's warning, shown with their challenge.
function fieldRuleNote(id) {
  const rule = leaderFieldRule(id);
  return rule ? `<p class="story-hint">${I18N.t(`field.${rule}.note`)}</p>` : '';
}

// --- Road ambushes. On Puncak Sinyal the trail volunteer does not wait at his post: the
// first time the player walks near it, he steps out and challenges them on the spot.
const ROAD_AMBUSHES = Object.freeze([{ region: REGION.PUNCAK, trainer: 31, radius: 130 }]);
function roadAmbush() {
  if (state.room || busy() || !state.team.length) return false;
  const a = ROAD_AMBUSHES.find(a => a.region === state.region);
  if (
    !a ||
    state.defeated.includes(a.trainer) ||
    (state.ambushes ??= []).includes(a.trainer) ||
    !canChallenge(a.trainer)
  )
    return false;
  const post = place().points.find(p => p.key === 'trainer' && p.id === a.trainer);
  if (!post || Math.hypot(state.x - post.x, state.y - post.y) > a.radius) return false;
  state.ambushes.push(a.trainer);
  held = null;
  navigation++;
  save();
  trainerIntro(a.trainer, I18N.t(`ambush.${a.trainer}`));
  return true;
}
