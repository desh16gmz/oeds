const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../../store');
const giveaways = require('../../lib/giveaways');
const { resolvePing, allowedMentionsFor, gatePings, okEmbed, baseEmbed, parseDuration, formatDuration, assertCanSend, truncate, unix, EPHEMERAL, UserError } = require('../../utils');

const messageIdOption = (o) =>
  o.setName('giveaway').setDescription('Pick the giveaway').setAutocomplete(true).setRequired(true);

const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Run button-based giveaways')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName('start').setDescription('Start a giveaway')
      .addStringOption((o) => o.setName('prize').setDescription('What are you giving away?').setMaxLength(200).setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('How long? e.g. 30m, 2h, 1d, 1w').setMaxLength(20).setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(20).setRequired(false))
      .addRoleOption((o) => o.setName('required_role').setDescription('Only members with this role can enter').setRequired(false))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post (default: this channel)').addChannelTypes(0, 5).setRequired(false))
      .addStringOption((o) =>
        o.setName('alert_mode').setDescription('Ping when it starts')
          .addChoices({ name: 'None (silent)', value: 'none' }, { name: '@here', value: 'here' }, { name: '@everyone', value: 'everyone' })
          .setRequired(false)
      )
      .addRoleOption((o) => o.setName('alert_role').setDescription('Also ping this role').setRequired(false))
  )
  .addSubcommand((s) => s.setName('end').setDescription('End a running giveaway right now').addStringOption(messageIdOption))
  .addSubcommand((s) => s.setName('reroll').setDescription('Pick new winners for an ended giveaway').addStringOption(messageIdOption))
  .addSubcommand((s) => s.setName('list').setDescription('Show running giveaways'));

async function execute(interaction, client) {
  const sub = interaction.options.getSubcommand();
  const g = store.guild(interaction.guildId);
  await interaction.deferReply({ flags: EPHEMERAL });

  if (sub === 'start') {
    const ms = parseDuration(interaction.options.getString('duration', true));
    if (!ms || ms < 10_000 || ms > 60 * 864e5) throw new UserError('Duration must be between 10 seconds and 60 days — try `30m`, `2h` or `1d`.');
    const target = interaction.options.getChannel('channel', false) ?? interaction.channel;
    assertCanSend(target, interaction.guild.members.me);
    const role = interaction.options.getRole('required_role', false);
    const gw = {
      channelId: target.id,
      prize: interaction.options.getString('prize', true),
      endsAt: Date.now() + ms,
      winners: interaction.options.getInteger('winners', false) ?? 1,
      hostId: interaction.user.id,
      requiredRoleId: role?.id ?? null,
      entries: [],
      ended: false,
      winnerIds: [],
    };
    const mentions = await gatePings(interaction, resolvePing(interaction));
    const message = await target.send({
      content: mentions.join(' ') || undefined,
      embeds: [giveaways.giveawayEmbed(gw)],
      components: [giveaways.enterRow(gw)],
      allowedMentions: allowedMentionsFor(mentions),
    });
    g.giveaways[message.id] = gw;
    store.save();
    return interaction.editReply({ embeds: [okEmbed(`Giveaway started in <#${target.id}> — ends in **${formatDuration(ms)}**.\n<https://discord.com/channels/${interaction.guildId}/${target.id}/${message.id}>`, interaction.guildId)] });
  }

  if (sub === 'end' || sub === 'reroll') {
    const id = interaction.options.getString('giveaway', true);
    const gw = await giveaways.finish(client, interaction.guildId, id, { reroll: sub === 'reroll' });
    return interaction.editReply({
      embeds: [okEmbed(`${sub === 'reroll' ? 'Re-rolled' : 'Ended'} **${gw.prize}** — ${gw.winnerIds.length ? gw.winnerIds.map((w) => `<@${w}>`).join(', ') : 'no valid entries'}.`, interaction.guildId)],
    });
  }

  if (sub === 'list') {
    const running = Object.entries(g.giveaways).filter(([, gw]) => !gw.ended);
    const lines = running.map(([id, gw]) => `🎉 **${truncate(gw.prize, 60)}** — ends <t:${unix(gw.endsAt)}:R> • ${gw.entries.length} entries • <https://discord.com/channels/${interaction.guildId}/${gw.channelId}/${id}>`);
    return interaction.editReply({ embeds: [baseEmbed(interaction.guildId).setTitle('🎉 Running giveaways').setDescription(lines.join('\n') || 'No giveaways running. Start one with `/giveaway start`.')] });
  }
}

async function autocomplete(interaction) {
  const sub = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused().toLowerCase();
  const g = store.guild(interaction.guildId);
  const wantEnded = sub === 'reroll';
  const choices = Object.entries(g.giveaways)
    .filter(([, gw]) => gw.ended === wantEnded && gw.prize.toLowerCase().includes(focused))
    .slice(-25)
    .map(([id, gw]) => ({ name: truncate(`${gw.prize} (${id})`, 100), value: id }));
  await interaction.respond(choices);
}

// Button: toggle entry
async function handleComponent(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'gw:enter') return;
  const g = store.guild(interaction.guildId);
  const gw = g.giveaways[interaction.message.id];
  if (!gw) return interaction.reply({ content: '⚠️ I no longer have data for this giveaway.', flags: EPHEMERAL });
  if (gw.ended || gw.endsAt <= Date.now()) return interaction.reply({ content: '⏰ This giveaway has already ended.', flags: EPHEMERAL });
  if (gw.requiredRoleId && !interaction.member.roles.cache.has(gw.requiredRoleId)) {
    return interaction.reply({ content: `🔒 You need the <@&${gw.requiredRoleId}> role to enter.`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
  }
  const idx = gw.entries.indexOf(interaction.user.id);
  const joined = idx === -1;
  if (joined) gw.entries.push(interaction.user.id);
  else gw.entries.splice(idx, 1);
  store.save();
  await interaction.update({ embeds: [giveaways.giveawayEmbed(gw)], components: [giveaways.enterRow(gw)] });
  await interaction.followUp({ content: joined ? "🎉 You're in! Good luck!" : 'You left the giveaway. Click again to re-enter.', flags: EPHEMERAL });
}

module.exports = { data, execute, autocomplete, handleComponent, componentPrefix: 'gw' };
