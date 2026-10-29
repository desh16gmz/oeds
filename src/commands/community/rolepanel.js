const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { baseEmbed, okEmbed, resolveColor, assertCanSend, truncate, EPHEMERAL, UserError } = require('../../utils');

// Roles with staff-level powers can never be self-assigned through a panel.
const DANGEROUS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageWebhooks,
];
const isDangerous = (role) => role.permissions.any(DANGEROUS);

const data = new SlashCommandBuilder()
  .setName('rolepanel')
  .setDescription('Post a button panel so members can pick their own roles')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addRoleOption((o) => o.setName('role1').setDescription('First role').setRequired(true))
  .addRoleOption((o) => o.setName('role2').setDescription('Second role').setRequired(false))
  .addRoleOption((o) => o.setName('role3').setDescription('Third role').setRequired(false))
  .addRoleOption((o) => o.setName('role4').setDescription('Fourth role').setRequired(false))
  .addRoleOption((o) => o.setName('role5').setDescription('Fifth role').setRequired(false))
  .addStringOption((o) => o.setName('title').setDescription('Panel title (default: Pick your roles)').setMaxLength(256).setRequired(false))
  .addStringOption((o) => o.setName('description').setDescription('Panel text — \\n = new line').setMaxLength(2000).setRequired(false))
  .addStringOption((o) => o.setName('color').setDescription('Panel color name or hex').setMaxLength(12).setRequired(false))
  .addChannelOption((o) => o.setName('channel').setDescription('Where to post (default: here)').addChannelTypes(0, 5).setRequired(false));

async function execute(interaction) {
  const roles = [];
  for (let i = 1; i <= 5; i++) {
    const r = interaction.options.getRole(`role${i}`, false);
    if (r && !roles.some((x) => x.id === r.id)) roles.push(r);
  }
  for (const r of roles) {
    if (r.managed || r.id === interaction.guildId) throw new UserError(`**${r.name}** can't be used in a panel.`);
    if (!r.editable) throw new UserError(`I can't assign **${r.name}** — move my role above it in Server Settings → Roles.`);
    if (isDangerous(r)) throw new UserError(`**${r.name}** has staff permissions, so members can't self-assign it. Use a cosmetic/regular role.`);
  }
  const color = interaction.options.getString('color', false);
  if (color) resolveColor(color);
  const target = interaction.options.getChannel('channel', false) ?? interaction.channel;
  assertCanSend(target, interaction.guild.members.me);
  await interaction.deferReply({ flags: EPHEMERAL });

  const embed = baseEmbed(interaction.guildId)
    .setTitle(interaction.options.getString('title', false) ?? '🏷️ Pick your roles')
    .setDescription(
      (interaction.options.getString('description', false)?.replace(/\\n/g, '\n') ?? 'Click a button to get a role — click again to remove it.') +
        '\n\n' + roles.map((r) => `• <@&${r.id}>`).join('\n')
    );
  if (color) embed.setColor(resolveColor(color));

  const row = new ActionRowBuilder().addComponents(
    roles.map((r) => new ButtonBuilder().setCustomId(`rolepanel:${r.id}`).setLabel(truncate(r.name, 80)).setStyle(ButtonStyle.Secondary))
  );
  await target.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  await interaction.editReply({ embeds: [okEmbed(`Role panel posted in <#${target.id}> with ${roles.length} role(s).`, interaction.guildId)] });
}

async function handleComponent(interaction) {
  if (!interaction.isButton()) return;
  const roleId = interaction.customId.split(':')[1];
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return interaction.reply({ content: '⚠️ That role no longer exists.', flags: EPHEMERAL });
  if (isDangerous(role) || !role.editable) return interaction.reply({ content: "⚠️ I can't manage that role anymore — tell an admin.", flags: EPHEMERAL });
  const has = interaction.member.roles.cache.has(roleId);
  if (has) await interaction.member.roles.remove(role, 'Role panel');
  else await interaction.member.roles.add(role, 'Role panel');
  await interaction.reply({ content: has ? `➖ Removed **${role.name}**.` : `➕ You now have **${role.name}**!`, flags: EPHEMERAL });
}

module.exports = { data, execute, handleComponent, componentPrefix: 'rolepanel' };
