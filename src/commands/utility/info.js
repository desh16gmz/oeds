const { SlashCommandBuilder, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { baseEmbed, unix, formatDuration, EPHEMERAL } = require('../../utils');

const ping = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check if the bot is alive and how fast it is').setDMPermission(false),
  async execute(interaction, client) {
    const sent = await interaction.reply({ content: '🏓 Pinging…', fetchReply: true, flags: EPHEMERAL });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Round-trip **${roundtrip}ms** • Gateway **${Math.round(client.ws.ping)}ms**`);
  },
};

const botinfo = {
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Stats about Outlast Head Bot').setDMPermission(false),
  async execute(interaction, client) {
    const members = client.guilds.cache.reduce((n, g) => n + g.memberCount, 0);
    const embed = baseEmbed(interaction.guildId)
      .setTitle('🤖 Outlast Head Bot')
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Servers', value: String(client.guilds.cache.size), inline: true },
        { name: 'Members', value: members.toLocaleString('en-US'), inline: true },
        { name: 'Commands', value: String(client.commands.size), inline: true },
        { name: 'Uptime', value: formatDuration(client.uptime ?? 0), inline: true },
        { name: 'Memory', value: `${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`, inline: true },
        { name: 'Node.js', value: process.version, inline: true }
      );
    await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
  },
};

const serverinfo = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Show details about this server').setDMPermission(false),
  async execute(interaction) {
    const g = interaction.guild;
    const ch = g.channels.cache;
    const embed = baseEmbed(interaction.guildId)
      .setTitle(g.name)
      .setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Created', value: `<t:${unix(g.createdAt)}:D>`, inline: true },
        { name: 'Members', value: g.memberCount.toLocaleString('en-US'), inline: true },
        { name: 'Channels', value: `💬 ${ch.filter((c) => c.isTextBased() && !c.isThread()).size} text • 🔊 ${ch.filter((c) => c.isVoiceBased()).size} voice`, inline: true },
        { name: 'Roles', value: String(g.roles.cache.size - 1), inline: true },
        { name: 'Boosts', value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount ?? 0})`, inline: true }
      )
      .setFooter({ text: `ID: ${g.id}` });
    if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 1024 }));
    await interaction.reply({ embeds: [embed] });
  },
};

const userinfo = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show details about a member')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who? (default: you)').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user', false) ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const embed = baseEmbed(interaction.guildId)
      .setAuthor({ name: user.tag ?? user.username, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Mention', value: `<@${user.id}>`, inline: true },
        { name: 'Bot?', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Account created', value: `<t:${unix(user.createdAt)}:R>`, inline: true }
      )
      .setFooter({ text: `ID: ${user.id}` });
    if (member) {
      const roles = member.roles.cache.filter((r) => r.id !== interaction.guildId).sort((a, b) => b.position - a.position);
      embed.addFields(
        { name: 'Joined server', value: member.joinedAt ? `<t:${unix(member.joinedAt)}:R>` : 'unknown', inline: true },
        { name: `Roles (${roles.size})`, value: roles.size ? roles.first(10).map((r) => `<@&${r.id}>`).join(' ') + (roles.size > 10 ? ' …' : '') : 'None' }
      );
      if (member.displayColor) embed.setColor(member.displayColor);
    }
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

const avatar = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show someone's avatar in full size")
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who? (default: you)').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user', false) ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    await interaction.reply({ embeds: [baseEmbed(interaction.guildId).setTitle(`${user.username}'s avatar`).setURL(url).setImage(url)] });
  },
};

const invite = {
  data: new SlashCommandBuilder().setName('invite').setDescription('Get the link to add Outlast Head Bot to another server').setDMPermission(false),
  async execute(interaction, client) {
    const perms = new PermissionsBitField([
      'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis',
      'ManageRoles', 'ManageChannels', 'ManageMessages', 'KickMembers', 'BanMembers', 'ModerateMembers', 'MentionEveryone',
    ].map((n) => PermissionFlagsBits[n]));
    const url = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot%20applications.commands&permissions=${perms.bitfield}`;
    await interaction.reply({ content: `🔗 **[Add Outlast Head Bot to a server](${url})**`, flags: EPHEMERAL });
  },
};

module.exports = [ping, botinfo, serverinfo, userinfo, avatar, invite];
