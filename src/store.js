const fs = require('fs');
const path = require('path');

// Persistent JSON store (per-server settings, templates, warnings, levels, giveaways, tickets).
// Safe writes (temp file + rename), debounced saving, and automatic recovery from a corrupt file.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return { servers: {} };
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.servers !== 'object') return { servers: {} };
    return parsed;
  } catch (err) {
    const backup = path.join(DATA_DIR, `store.corrupt-${Date.now()}.json`);
    try { fs.renameSync(FILE, backup); } catch { /* ignore */ }
    console.warn(`⚠️  data/store.json was unreadable (${err.message}). Backed it up to ${path.basename(backup)} and started fresh.`);
    return { servers: {} };
  }
}

const data = load();

// Every server gets these defaults; missing keys are filled in automatically, so updates never break old data.
function defaults() {
  return {
    settings: { color: '#5865F2', footer: 'Outlast Head Bot', logChannelId: null },
    welcome: {
      enabled: false,
      channelId: null,
      title: '👋 Welcome to {server}!',
      description: 'Hey {user}, glad to have you here!\nYou are our **{ordinal}** member — enjoy your stay.',
      color: null,
      image: null,
      thumbnail: true,
      footer: 'Member #{membercount}',
      ping: true,
      dm: false,
      dmMessage: 'Welcome to **{server}**, {username}! Have a look around and say hi 👋',
      autoRoles: [],
    },
    goodbye: {
      enabled: false,
      channelId: null,
      title: '👋 Goodbye, {username}',
      description: '**{username}** has left **{server}**. We are now **{membercount}** members.',
      color: '#ED4245',
      image: null,
      thumbnail: true,
      footer: null,
    },
    leveling: {
      enabled: false,
      channelId: null,
      xpMin: 15,
      xpMax: 25,
      cooldown: 60,
      announce: true,
      message: '🎉 GG {user}, you reached **level {level}**!',
      rewards: {},
    },
    tickets: { categoryId: null, supportRoleId: null, counter: 0 },
    templates: {},
    lastPing: {},
    users: {},
    warnings: {},
    giveaways: {},
    openTickets: {},
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function fill(target, def) {
  for (const [k, v] of Object.entries(def)) {
    if (target[k] === undefined || target[k] === null && v !== null && isObj(v)) target[k] = structuredClone(v);
    else if (isObj(v) && isObj(target[k])) fill(target[k], v);
  }
  return target;
}

function guild(id) {
  if (!data.servers[id]) data.servers[id] = {};
  return fill(data.servers[id], defaults());
}

// Reset one section ("welcome", "goodbye", "leveling", "settings") back to defaults.
function resetSection(id, section) {
  const g = guild(id);
  g[section] = structuredClone(defaults()[section]);
  save();
}

let timer = null;
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.error('Could not save data/store.json:', err.message);
  }
}

function save() {
  if (timer) return;
  timer = setTimeout(flush, 300);
}

process.on('exit', () => { if (timer) flush(); });

module.exports = { data, guild, save, flush, resetSection, defaults };
