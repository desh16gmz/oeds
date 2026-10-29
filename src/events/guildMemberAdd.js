const { Events } = require('discord.js');
const store = require('../store');
const { buildMemberEmbed, memberVars } = require('../lib/memberMessages');
const { formatText, truncate } = require('../utils');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (member.user.bot) return;
    const g = store.guild(member.guild.id);
    const w = g.welcome;

    // Auto-roles work even if the welcome message is switched off.
    for (const roleId of w.autoRoles) {
      const role = member.guild.roles.cache.get(roleId);
      if (role?.editable) await member.roles.add(role, 'Outlast Head Bot auto-role').catch((e) => console.warn(`Auto-role failed: ${e.message}`));
    }

    if (!w.enabled) return;

    const channel = w.channelId && member.guild.channels.cache.get(w.channelId);
    if (channel?.isTextBased()) {
      await channel
        .send({
          content: w.ping ? `<@${member.id}>` : undefined,
          embeds: [buildMemberEmbed(member, w, g.settings.color)],
          allowedMentions: { users: w.ping ? [member.id] : [] },
        })
        .catch((e) => console.warn(`Welcome message failed in ${member.guild.name}: ${e.message}`));
    }

    if (w.dm && w.dmMessage) {
      await member.send(truncate(formatText(w.dmMessage, memberVars(member)), 2000)).catch(() => {}); // DMs may be closed
    }
  },
};
