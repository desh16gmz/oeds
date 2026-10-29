const { Events } = require('discord.js');
const store = require('../store');
const { buildMemberEmbed } = require('../lib/memberMessages');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (member.user?.bot) return;
    const g = store.guild(member.guild.id);
    const cfg = g.goodbye;
    if (!cfg.enabled) return;
    const channel = cfg.channelId && member.guild.channels.cache.get(cfg.channelId);
    if (!channel?.isTextBased()) return;
    await channel
      .send({ embeds: [buildMemberEmbed(member, cfg, g.settings.color)], allowedMentions: { parse: [] } })
      .catch((e) => console.warn(`Goodbye message failed in ${member.guild.name}: ${e.message}`));
  },
};
