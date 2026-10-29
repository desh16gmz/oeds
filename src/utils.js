const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const store = require('./store');

const BOT_NAME = 'Outlast Head Bot';
const EPHEMERAL = MessageFlags.Ephemeral;

// An error whose message is safe and helpful to show directly to the user.
class UserError extends Error {}

const COLORS = {
  blurple: '#5865F2', fuchsia: '#EB459E', red: '#ED4245', gold: '#FEE75C', yellow: '#F1C40F',
  green: '#57F287', blue: '#3498DB', orange: '#E67E22', purple: '#9B59B6', teal: '#1ABC9C',
  pink: '#FF69B4', white: '#FFFFFF', black: '#000000', dark: '#23272A', grey: '#95A5A6',
};

const hexToInt = (hex) => parseInt(hex.replace('#', ''), 16);

// Accepts a color name or hex; returns an int Discord likes; throws a friendly UserError on garbage.
function resolveColor(input, fallback = '#5865F2') {
  if (input == null || String(input).trim() === '') return hexToInt(fallback);
  const key = String(input).toLowerCase().trim();
  if (COLORS[key]) return hexToInt(COLORS[key]);
  if (/^#?[0-9a-f]{6}$/i.test(key)) return hexToInt(key);
  throw new UserError(`Invalid color "${input}". Use a name (${Object.keys(COLORS).join(', ')}) or a hex like #5865F2.`);
}

function safeColor(input, fallback = '#5865F2') {
  try { return resolveColor(input, fallback); } catch { return hexToInt(fallback); }
}

function validateUrl(input, label) {
  if (input == null || input === '') return undefined;
  if (!/^https?:\/\/\S+$/i.test(input)) {
    throw new UserError(`"${label}" must be a full link starting with http:// or https://`);
  }
  return input;
}

// Option helper: reads a string option and validates it as a URL.
function urlOption(interaction, name) {
  return validateUrl(interaction.options.getString(name, false) ?? undefined, name);
}

// "-" clears a value; empty/undefined means "not provided".
function dash(value) {
  if (value == null) return undefined;
  return value.trim() === '-' ? null : value;
}

function truncate(text, max) {
  if (text == null) return text;
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// Replaces {placeholders} and turns a typed "\n" into a real line break.
function formatText(template, vars) {
  if (template == null) return template;
  return String(template)
    .replace(/\\n/g, '\n')
    .replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
}

// "1h30m", "2d", "45s", "1w" -> milliseconds (null when invalid)
function parseDuration(input) {
  if (!input) return null;
  const clean = String(input).replace(/\s+/g, '').toLowerCase();
  if (!/^(\d+(?:\.\d+)?[smhdw])+$/.test(clean)) return null;
  const units = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  let total = 0;
  for (const [, n, u] of clean.matchAll(/(\d+(?:\.\d+)?)([smhdw])/g)) total += parseFloat(n) * units[u];
  return Math.round(total);
}

function formatDuration(ms) {
  const parts = [];
  let s = Math.floor(ms / 1000);
  for (const [label, size] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    const n = Math.floor(s / size);
    if (n) { parts.push(`${n}${label}`); s -= n * size; }
  }
  return parts.join(' ') || '0s';
}

function progressBar(current, total, length = 12) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  const filled = Math.round(ratio * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

const unix = (dateOrMs) => Math.floor(new Date(dateOrMs).getTime() / 1000);

// ---------- embeds ----------

// Embed pre-styled with the server's brand color and footer (set via /config).
function baseEmbed(guildId) {
  const s = guildId ? store.guild(guildId).settings : { color: '#5865F2', footer: BOT_NAME };
  const e = new EmbedBuilder().setColor(safeColor(s.color));
  if (s.footer) e.setFooter({ text: s.footer });
  return e;
}

const okEmbed = (text, guildId) => baseEmbed(guildId).setColor(0x57f287).setDescription(`✅ ${text}`);
const failEmbed = (text) => new EmbedBuilder().setColor(0xed4245).setDescription(`⚠️ ${text}`);

// ---------- pings (anti-spam) ----------

function resolvePing(interaction) {
  const mode = interaction.options.getString('alert_mode', false);
  const role = interaction.options.getRole('alert_role', false);
  const mentions = [];
  if (mode === 'here') mentions.push('@here');
  else if (mode === 'everyone') mentions.push('@everyone');
  if (role) mentions.push(`<@&${role.id}>`);
  return mentions;
}

function allowedMentionsFor(mentions) {
  const everyone = mentions.some((m) => m === '@everyone' || m === '@here');
  return {
    parse: everyone ? ['everyone'] : [],
    roles: mentions.filter((m) => m.startsWith('<@&')).map((m) => m.slice(3, -1)),
  };
}

const PING_COOLDOWN_MS = 60 * 60 * 1000;

// A channel can only get an @everyone/@here from the bot once per hour. Role pings are never limited.
async function gatePings(interaction, mentions) {
  if (!mentions.some((m) => m === '@everyone' || m === '@here')) return mentions;
  const g = store.guild(interaction.guildId);
  const last = g.lastPing[interaction.channelId] ?? 0;
  if (Date.now() - last < PING_COOLDOWN_MS) {
    await interaction
      .followUp({
        content: '⚠️ `@everyone`/`@here` was already used by the bot in this channel less than an hour ago — posting **without that ping**. Use `alert_role` for instant alerts.',
        flags: EPHEMERAL,
      })
      .catch(() => {});
    return mentions.filter((m) => m !== '@everyone' && m !== '@here');
  }
  g.lastPing[interaction.channelId] = Date.now();
  store.save();
  return mentions;
}

// ---------- permissions ----------

const PERM_LABELS = {
  ViewChannel: 'View Channel', SendMessages: 'Send Messages', EmbedLinks: 'Embed Links',
  AttachFiles: 'Attach Files', ReadMessageHistory: 'Read Message History', AddReactions: 'Add Reactions',
  ManageChannels: 'Manage Channels', ManageRoles: 'Manage Roles',
};

// Throws a friendly error if the bot can't post in `channel`.
function assertCanSend(channel, me, extra = []) {
  const needed = ['ViewChannel', 'SendMessages', 'EmbedLinks', ...extra];
  const missing = channel.permissionsFor(me)?.missing(needed.map((n) => PermissionFlagsBits[n])) ?? [];
  if (missing.length) {
    const names = needed.filter((n) => missing.includes(PermissionFlagsBits[n])).map((n) => PERM_LABELS[n] ?? n);
    throw new UserError(`I'm missing **${names.join(', ')}** in <#${channel.id}>. Give me those permissions there and try again.`);
  }
}

// Sends an embed to the server's log channel (set with /config logchannel). Never throws.
async function sendLog(guild, embed, files) {
  try {
    const id = store.guild(guild.id).settings.logChannelId;
    const ch = id && guild.channels.cache.get(id);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
  } catch { /* log channel unavailable — ignore */ }
}

// Turns any error into something a human can act on.
function friendlyError(err) {
  if (err instanceof UserError) return err.message;
  switch (err?.code) {
    case 50013: return "I don't have permission to do that. Check my role position and permissions (a role above mine can't be managed).";
    case 50001: return "I can't see that channel or message. Give me **View Channel** access.";
    case 10008: return "I couldn't find that message — make sure the ID is right and you're in the same channel.";
    case 50007: return "That user has direct messages closed.";
    case 30013: return "Discord's limit was reached for that (too many channels/roles/reactions).";
    default: return null;
  }
}

module.exports = {
  BOT_NAME, EPHEMERAL, UserError, COLORS, resolveColor, safeColor, validateUrl, urlOption, dash, truncate,
  ordinal, formatText, parseDuration, formatDuration, progressBar, unix, baseEmbed, okEmbed, failEmbed,
  resolvePing, allowedMentionsFor, gatePings, assertCanSend, sendLog, friendlyError,
};
