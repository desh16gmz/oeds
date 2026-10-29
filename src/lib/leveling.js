// XP curve: XP needed to go from level L to L+1.
const xpNeeded = (level) => 5 * level * level + 50 * level + 100;

// Returns { level, current, needed } for a total XP amount.
function progress(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpNeeded(level)) {
    remaining -= xpNeeded(level);
    level++;
  }
  return { level, current: remaining, needed: xpNeeded(level) };
}

const levelFromXp = (xp) => progress(xp).level;

module.exports = { xpNeeded, progress, levelFromXp };
