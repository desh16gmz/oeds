const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../../store');
const { baseEmbed, assertCanSend, EPHEMERAL, UserError } = require('../../utils');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Quick setup wizard — pick your welcome, goodbye and log channels in one go')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addChannelOption((o) => o.setName('welcome_channel').setDescription('Where new members are welcomed').addChannelTypes(0, 5).setRequired(false))
  .addChannelOption((o) => o.setName('goodbye_channel').setDescription('Where leaving members are announced').addChannelTypes(0, 5).setRequired(false))
  .addChannelOption((o) => o.setName('log_channel').setDescription('Private staff channel for mod logs & ticket transcripts').addChannelTypes(0, 5).setRequired(false))
  .addRoleOption((o) => o.setName('autorole').setDescription('Role given automatically to every new member').setRequired(false));

async function execute(interaction, client) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const g = store.guild(interaction.guildId);
  const me = interaction.guild.members.me;
  const changes = [];

  const welcomeCh = interaction.options.getChannel('welcome_channel', false);
  const goodbyeCh = interaction.options.getChannel('goodbye_channel', false);
  const logCh = interaction.options.getChannel('log_channel', false);
  const role = interaction.options.getRole('autorole', false);

  if (welcomeCh) {
    assertCanSend(welcomeCh, me);
    g.welcome.channelId = welcomeCh.id;
    g.welcome.enabled = true;
    changes.push(`👋 Welcome messages → <#${welcomeCh.id}>`);
  }
  if (goodbyeCh) {
    assertCanSend(goodbyeCh, me);
    g.goodbye.channelId = goodbyeCh.id;
    g.goodbye.enabled = true;
    changes.push(`🚪 Goodbye messages → <#${goodbyeCh.id}>`);
  }
  if (logCh) {
    assertCanSend(logCh, me);
    g.settings.logChannelId = logCh.id;
    changes.push(`📜 Log channel → <#${logCh.id}>`);
  }
  if (role) {
    if (role.managed || role.id === interaction.guildId) throw new UserError('That role cannot be used as an auto-role.');
    if (!role.editable) throw new UserError(`I can't assign **${role.name}** — drag my role above it in Server Settings → Roles.`);
    if (!g.welcome.autoRoles.includes(role.id)) g.welcome.autoRoles.push(role.id);
    changes.push(`🏷️ Auto-role added → <@&${role.id}>`);
  }
  store.save();

  const tick = (v) => (v ? '✅' : '❌');
  const embed = baseEmbed(interaction.guildId)
    .setTitle('⚙️ Outlast Head Bot — setup')
    .setDescription(changes.length ? `**Saved:**\n${changes.join('\n')}` : 'Nothing changed — here is your current status. Re-run `/setup` with options to change things.')
    .addFields(
      { name: 'Status', value: [
        `${tick(g.welcome.enabled && g.welcome.channelId)} Welcome messages`,
        `${tick(g.goodbye.enabled && g.goodbye.channelId)} Goodbye messages`,
        `${tick(g.settings.logChannelId)} Log channel`,
        `${tick(g.welcome.autoRoles.length)} Auto-role`,
        `${tick(g.leveling.enabled)} Levels`,
        `${tick(g.tickets.supportRoleId)} Tickets`,
      ].join('\n'), inline: true },
      { name: 'Next steps', value: [
        '`/welcome preview` — see your welcome embed',
        '`/welcome message` — change text, color, banner',
        '`/levels toggle` — turn on XP & ranks',
        '`/ticket setup` — add a support ticket panel',
        '`/config view` — see every setting',
      ].join('\n'), inline: true }
    );

  if (!client.features.members) {
    embed.addFields({
      name: '⚠️ Server Members Intent is OFF',
      value: 'Welcome, goodbye and auto-roles will not fire until you enable **Server Members Intent** at discord.com/developers → your app → Bot, then restart the bot.',
    });
  }
  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, execute };
