const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../../store');
const { baseEmbed, okEmbed, resolveColor, EPHEMERAL, assertCanSend, dash } = require('../../utils');

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Server-wide bot settings: brand color, footer, log channel, reset')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('view').setDescription('Show every setting at a glance'))
  .addSubcommand((s) =>
    s.setName('color').setDescription("Set the bot's brand color for this server")
      .addStringOption((o) => o.setName('color').setDescription('Color name (teal, gold…) or hex like #FF8800').setMaxLength(12).setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName('footer').setDescription('Set the default footer text on bot embeds')
      .addStringOption((o) => o.setName('text').setDescription('Footer text, or - to remove it').setMaxLength(200).setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName('logchannel').setDescription('Set (or clear) the channel for mod logs and ticket transcripts')
      .addChannelOption((o) => o.setName('channel').setDescription('Leave empty to turn logging off').addChannelTypes(0, 5).setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName('reset').setDescription('Reset a section of settings back to defaults')
      .addStringOption((o) =>
        o.setName('section').setDescription('What to reset').setRequired(true)
          .addChoices(
            { name: 'General (color, footer, log channel)', value: 'settings' },
            { name: 'Welcome', value: 'welcome' },
            { name: 'Goodbye', value: 'goodbye' },
            { name: 'Levels', value: 'leveling' }
          )
      )
  );

const ch = (id) => (id ? `<#${id}>` : '*not set*');
const onoff = (b) => (b ? '🟢 on' : '🔴 off');

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = store.guild(interaction.guildId);
  await interaction.deferReply({ flags: EPHEMERAL });

  if (sub === 'view') {
    const embed = baseEmbed(interaction.guildId)
      .setTitle(`⚙️ Settings for ${interaction.guild.name}`)
      .addFields(
        { name: 'General', value: `Color: \`${g.settings.color}\`\nFooter: ${g.settings.footer ?? '*none*'}\nLog channel: ${ch(g.settings.logChannelId)}` },
        { name: '👋 Welcome', value: `${onoff(g.welcome.enabled)} • ${ch(g.welcome.channelId)}\nDM: ${onoff(g.welcome.dm)} • Ping: ${onoff(g.welcome.ping)}\nAuto-roles: ${g.welcome.autoRoles.map((r) => `<@&${r}>`).join(' ') || '*none*'}`, inline: true },
        { name: '🚪 Goodbye', value: `${onoff(g.goodbye.enabled)} • ${ch(g.goodbye.channelId)}`, inline: true },
        { name: '📈 Levels', value: `${onoff(g.leveling.enabled)} • XP ${g.leveling.xpMin}-${g.leveling.xpMax} / ${g.leveling.cooldown}s\nAnnounce in: ${g.leveling.channelId ? ch(g.leveling.channelId) : 'same channel'}\nRewards: ${Object.keys(g.leveling.rewards).length}` },
        { name: '🎫 Tickets', value: `Support role: ${g.tickets.supportRoleId ? `<@&${g.tickets.supportRoleId}>` : '*not set*'}\nCategory: ${g.tickets.categoryId ? `<#${g.tickets.categoryId}>` : '*none*'}`, inline: true },
        { name: '📦 Stored', value: `Templates: ${Object.keys(g.templates).length}\nWarnings: ${Object.values(g.warnings).reduce((n, w) => n + w.length, 0)}\nGiveaways: ${Object.keys(g.giveaways).length}`, inline: true }
      );
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'color') {
    const input = interaction.options.getString('color', true);
    resolveColor(input);
    g.settings.color = resolveHex(input);
    store.save();
    return interaction.editReply({ embeds: [okEmbed(`Brand color set to \`${g.settings.color}\`.`, interaction.guildId)] });
  }

  if (sub === 'footer') {
    const text = dash(interaction.options.getString('text', true));
    g.settings.footer = text;
    store.save();
    return interaction.editReply({ embeds: [okEmbed(text ? `Footer set to “${text}”.` : 'Footer removed.', interaction.guildId)] });
  }

  if (sub === 'logchannel') {
    const channel = interaction.options.getChannel('channel', false);
    if (channel) assertCanSend(channel, interaction.guild.members.me, ['AttachFiles']);
    g.settings.logChannelId = channel?.id ?? null;
    store.save();
    return interaction.editReply({ embeds: [okEmbed(channel ? `Logs will go to <#${channel.id}>.` : 'Logging turned off.', interaction.guildId)] });
  }

  if (sub === 'reset') {
    const section = interaction.options.getString('section', true);
    store.resetSection(interaction.guildId, section);
    return interaction.editReply({ embeds: [okEmbed(`**${section}** settings were reset to defaults.`, interaction.guildId)] });
  }
}

// Converts a color name or hex to the "#RRGGBB" form we store.
function resolveHex(input) {
  const n = resolveColor(input);
  return `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
}

module.exports = { data, execute };
