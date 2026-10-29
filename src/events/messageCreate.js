const { Events } = require('discord.js');
const store = require('../store');
const { levelFromXp } = require('../lib/leveling');
const { formatText } = require('../utils');

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot || message.webhookId) return;
    const g = store.guild(message.guild.id);
    const L = g.leveling;
    if (!L.enabled) return;

    g.users[message.author.id] ??= { xp: 0, level: 0, last: 0 };
    const u = g.users[message.author.id];
    const now = Date.now();
    if (now - u.last < L.cooldown * 1000) return;

    u.last = now;
    u.xp += rand(Math.min(L.xpMin, L.xpMax), Math.max(L.xpMin, L.xpMax));
    const newLevel = levelFromXp(u.xp);
    store.save();
    if (newLevel <= u.level) return;
    u.level = newLevel;

    // Role rewards
    for (const [lvl, roleId] of Object.entries(L.rewards)) {
      if (Number(lvl) <= newLevel && !message.member?.roles.cache.has(roleId)) {
        await message.member?.roles.add(roleId, 'Outlast Head Bot level reward').catch(() => {});
      }
    }

    if (L.announce) {
      const channel = (L.channelId && message.guild.channels.cache.get(L.channelId)) || message.channel;
      const text = formatText(L.message, { user: `<@${message.author.id}>`, username: message.author.username, level: newLevel, server: message.guild.name });
      await channel.send({ content: text, allowedMentions: { users: [message.author.id] } }).catch(() => {});
    }
  },
};
