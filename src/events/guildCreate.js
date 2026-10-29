const { Events, PermissionFlagsBits } = require('discord.js');
const { baseEmbed } = require('../utils');

// Friendly intro when the bot is added to a new server.
module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    const me = guild.members.me;
    const channel =
      guild.systemChannel ??
      guild.channels.cache.find((c) => c.isTextBased() && !c.isThread() && c.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages));
    if (!channel?.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return;
    const embed = baseEmbed(guild.id)
      .setTitle('👋 Thanks for adding Outlast Head Bot!')
      .setDescription(
        [
          'I handle **welcome & goodbye messages, moderation, tickets, giveaways, levels, role panels** and **eSports announcements**.',
          '',
          '**Get started in 30 seconds:**',
          '• `/setup` — pick your welcome, goodbye and log channels',
          '• `/welcome message` — customise the welcome embed',
          '• `/help` — see everything I can do',
        ].join('\n')
      );
    await channel.send({ embeds: [embed] }).catch(() => {});
  },
};
