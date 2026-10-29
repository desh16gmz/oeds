const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const store = require('../../store');
const { baseEmbed, okEmbed, resolveColor, assertCanSend, sendLog, unix, EPHEMERAL, UserError } = require('../../utils');

const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Support tickets: private channels members open with a button')
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName('setup').setDescription('Post a "Create ticket" panel (admins)')
      .addRoleOption((o) => o.setName('support_role').setDescription('Staff role that can see and answer tickets').setRequired(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post the panel (default: here)').addChannelTypes(0, 5).setRequired(false))
      .addChannelOption((o) => o.setName('category').setDescription('Category new tickets are created in').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
      .addStringOption((o) => o.setName('title').setDescription('Panel title').setMaxLength(256).setRequired(false))
      .addStringOption((o) => o.setName('description').setDescription('Panel text — \\n = new line').setMaxLength(2000).setRequired(false))
      .addStringOption((o) => o.setName('button_label').setDescription('Button text (default: Create ticket)').setMaxLength(80).setRequired(false))
      .addStringOption((o) => o.setName('color').setDescription('Panel color name or hex').setMaxLength(12).setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName('close').setDescription('Close this ticket (staff or ticket owner)')
      .addStringOption((o) => o.setName('reason').setDescription('Why is it being closed?').setMaxLength(300).setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName('add').setDescription('Add a member to this ticket')
      .addUserOption((o) => o.setName('user').setDescription('Member to add').setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName('remove').setDescription('Remove a member from this ticket')
      .addUserOption((o) => o.setName('user').setDescription('Member to remove').setRequired(true))
  );

const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks,
];

const closeRow = () =>
  new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));

// Who may close/manage a ticket: its owner, the support role, or anyone with Manage Channels.
function canManage(interaction, g) {
  const ownerId = g.openTickets[interaction.channelId];
  return (
    ownerId === interaction.user.id ||
    (g.tickets.supportRoleId && interaction.member.roles.cache.has(g.tickets.supportRoleId)) ||
    interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)
  );
}

async function transcript(channel) {
  const all = [];
  let before;
  for (let i = 0; i < 3; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  const lines = all.reverse().map((m) => {
    const files = m.attachments.size ? ` [${[...m.attachments.values()].map((a) => a.url).join(', ')}]` : '';
    const embeds = m.embeds.length && !m.content ? ' [embed]' : '';
    return `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.username}: ${m.content}${files}${embeds}`;
  });
  return new AttachmentBuilder(Buffer.from(lines.join('\n') || '(no messages)', 'utf8'), { name: `${channel.name}-transcript.txt` });
}

async function closeTicket(interaction, reason) {
  const g = store.guild(interaction.guildId);
  const channel = interaction.channel;
  const ownerId = g.openTickets[channel.id];
  const file = await transcript(channel);
  delete g.openTickets[channel.id];
  store.save();
  await sendLog(
    interaction.guild,
    baseEmbed(interaction.guildId).setTitle('🎫 Ticket closed').addFields(
      { name: 'Ticket', value: channel.name, inline: true },
      { name: 'Opened by', value: ownerId ? `<@${ownerId}>` : 'unknown', inline: true },
      { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason ?? 'No reason given' }
    ).setTimestamp(),
    [file]
  );
  setTimeout(() => channel.delete(`Ticket closed by ${interaction.user.username}`).catch(() => {}), 5000);
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = store.guild(interaction.guildId);

  if (sub === 'setup') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) throw new UserError('You need the **Manage Server** permission to set up tickets.');
    await interaction.deferReply({ flags: EPHEMERAL });
    const role = interaction.options.getRole('support_role', true);
    const target = interaction.options.getChannel('channel', false) ?? interaction.channel;
    const category = interaction.options.getChannel('category', false);
    const colorInput = interaction.options.getString('color', false);
    assertCanSend(target, interaction.guild.members.me);
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new UserError('I need the **Manage Channels** permission to create ticket channels.');
    }
    g.tickets.supportRoleId = role.id;
    g.tickets.categoryId = category?.id ?? null;
    store.save();

    const embed = baseEmbed(interaction.guildId)
      .setTitle(interaction.options.getString('title', false) ?? '🎫 Need help?')
      .setDescription((interaction.options.getString('description', false) ?? 'Click the button below to open a private ticket with our staff.').replace(/\\n/g, '\n'));
    if (colorInput) embed.setColor(resolveColor(colorInput));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:open').setLabel(interaction.options.getString('button_label', false) ?? 'Create ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );
    await target.send({ embeds: [embed], components: [row] });
    return interaction.editReply({ embeds: [okEmbed(`Ticket panel posted in <#${target.id}>. Support role: <@&${role.id}>.${g.settings.logChannelId ? '' : '\nTip: set `/config logchannel` to receive transcripts.'}`, interaction.guildId)] });
  }

  // The remaining subcommands only work inside a ticket channel.
  if (!g.openTickets[interaction.channelId]) throw new UserError('This command only works inside a ticket channel.');
  if (!canManage(interaction, g)) throw new UserError('Only staff or the ticket owner can do that.');

  if (sub === 'close') {
    await interaction.reply({ content: '🔒 Closing this ticket in 5 seconds… a transcript is being saved.' });
    return closeTicket(interaction, interaction.options.getString('reason', false) ?? undefined);
  }

  const user = interaction.options.getUser('user', true);
  await interaction.deferReply({ flags: EPHEMERAL });
  if (sub === 'add') {
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    await interaction.channel.send({ content: `➕ <@${user.id}> was added to the ticket.`, allowedMentions: { users: [user.id] } });
    return interaction.editReply({ embeds: [okEmbed(`Added **${user.username}**.`, interaction.guildId)] });
  }
  if (user.id === g.openTickets[interaction.channelId]) throw new UserError("You can't remove the ticket owner.");
  await interaction.channel.permissionOverwrites.delete(user.id);
  await interaction.editReply({ embeds: [okEmbed(`Removed **${user.username}**.`, interaction.guildId)] });
}

async function handleComponent(interaction) {
  if (!interaction.isButton()) return;
  const g = store.guild(interaction.guildId);
  const guild = interaction.guild;

  if (interaction.customId === 'ticket:open') {
    if (!g.tickets.supportRoleId) throw new UserError('Tickets are not fully set up yet — ask an admin to run `/ticket setup`.');
    await interaction.deferReply({ flags: EPHEMERAL });

    // One open ticket per member (and clean up tickets whose channel was deleted by hand).
    for (const [channelId, ownerId] of Object.entries(g.openTickets)) {
      if (!guild.channels.cache.has(channelId)) { delete g.openTickets[channelId]; continue; }
      if (ownerId === interaction.user.id) throw new UserError(`You already have an open ticket: <#${channelId}>`);
    }

    g.tickets.counter += 1;
    const name = `ticket-${String(g.tickets.counter).padStart(4, '0')}`;
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: g.tickets.categoryId && guild.channels.cache.has(g.tickets.categoryId) ? g.tickets.categoryId : undefined,
      topic: `Ticket opened by ${interaction.user.username} (${interaction.user.id})`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: MEMBER_ALLOW },
        { id: g.tickets.supportRoleId, allow: [...MEMBER_ALLOW, PermissionFlagsBits.ManageMessages] },
        { id: interaction.client.user.id, allow: [...MEMBER_ALLOW, PermissionFlagsBits.ManageChannels] },
      ],
      reason: `Ticket opened by ${interaction.user.username}`,
    });
    g.openTickets[channel.id] = interaction.user.id;
    store.save();

    await channel.send({
      content: `<@${interaction.user.id}> <@&${g.tickets.supportRoleId}>`,
      embeds: [baseEmbed(interaction.guildId).setTitle('🎫 Ticket opened').setDescription(`Hi <@${interaction.user.id}>! Please describe your issue and staff will be with you shortly.\n\nOpened <t:${unix(Date.now())}:R>`)],
      components: [closeRow()],
      allowedMentions: { users: [interaction.user.id], roles: [g.tickets.supportRoleId] },
    });
    return interaction.editReply({ embeds: [okEmbed(`Your ticket is ready: <#${channel.id}>`, interaction.guildId)] });
  }

  if (interaction.customId === 'ticket:close') {
    if (!g.openTickets[interaction.channelId]) return interaction.reply({ content: '⚠️ This is not an active ticket.', flags: EPHEMERAL });
    if (!canManage(interaction, g)) return interaction.reply({ content: '⚠️ Only staff or the ticket owner can close this ticket.', flags: EPHEMERAL });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:confirm').setLabel('Yes, close it').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ content: 'Close this ticket? A transcript will be saved to the log channel.', components: [row], flags: EPHEMERAL });
  }

  if (interaction.customId === 'ticket:cancel') {
    return interaction.update({ content: 'Cancelled — the ticket stays open.', components: [] });
  }

  if (interaction.customId === 'ticket:confirm') {
    if (!g.openTickets[interaction.channelId] || !canManage(interaction, g)) return interaction.update({ content: '⚠️ Not allowed.', components: [] });
    await interaction.update({ content: '🔒 Closing in 5 seconds…', components: [] });
    await interaction.channel.send('🔒 This ticket is being closed in 5 seconds… a transcript is being saved.').catch(() => {});
    return closeTicket(interaction);
  }
}

module.exports = { data, execute, handleComponent, componentPrefix: 'ticket' };
