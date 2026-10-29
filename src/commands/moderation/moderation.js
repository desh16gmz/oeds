const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../../store');
const { baseEmbed, okEmbed, UserError, EPHEMERAL, parseDuration, formatDuration, sendLog, unix, truncate } = require('../../utils');

// ---------- helpers ----------

const reasonOption = (o) => o.setName('reason').setDescription('Why? (shown in the log and to the user)').setMaxLength(400).setRequired(false);
const userOption = (desc) => (o) => o.setName('user').setDescription(desc).setRequired(true);
const reasonOf = (i) => i.options.getString('reason', false) ?? 'No reason given';

function makeData(name, description, perm) {
  return new SlashCommandBuilder().setName(name).setDescription(description).setDefaultMemberPermissions(perm).setDMPermission(false);
}

// Hierarchy safety: nobody can moderate the owner, themselves, the bot, or someone above them.
function assertCanModerate(interaction, target) {
  if (target.id === interaction.user.id) throw new UserError("You can't do that to yourself.");
  if (target.id === interaction.client.user.id) throw new UserError("Nice try — I won't do that to myself 😄");
  if (target.id === interaction.guild.ownerId) throw new UserError("You can't moderate the server owner.");
  const botTop = interaction.guild.members.me.roles.highest.position;
  if (target.roles.highest.position >= botTop) {
    throw new UserError("That member's top role is equal to or higher than mine. Move my role up in **Server Settings → Roles**.");
  }
  if (interaction.user.id !== interaction.guild.ownerId && target.roles.highest.position >= interaction.member.roles.highest.position) {
    throw new UserError("That member's top role is equal to or higher than yours.");
  }
}

async function fetchMember(interaction, user) {
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) throw new UserError(`**${user.username}** is not in this server.`);
  return member;
}

const dm = (user, text) => user.send(text).catch(() => false);

async function logAction(interaction, { action, color, target, reason, extra = [] }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${action}`)
    .addFields(
      { name: 'User', value: target ? `<@${target.id}> (${target.username ?? target.id})` : '—', inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      ...extra,
      { name: 'Reason', value: truncate(reason, 1000) }
    )
    .setTimestamp();
  await sendLog(interaction.guild, embed);
}

const done = (interaction, text) => interaction.editReply({ embeds: [okEmbed(text, interaction.guildId)] });

// ---------- commands ----------

const kick = {
  data: makeData('kick', 'Kick a member from the server', PermissionFlagsBits.KickMembers)
    .addUserOption(userOption('Member to kick')).addStringOption(reasonOption),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = interaction.options.getUser('user', true);
    const reason = reasonOf(interaction);
    const member = await fetchMember(interaction, user);
    assertCanModerate(interaction, member);
    await dm(user, `👢 You were **kicked** from **${interaction.guild.name}**.\nReason: ${reason}`);
    await member.kick(`${interaction.user.tag ?? interaction.user.username}: ${reason}`);
    await logAction(interaction, { action: '👢 Member kicked', color: 0xe67e22, target: user, reason });
    await done(interaction, `Kicked **${user.username}**.`);
  },
};

const ban = {
  data: makeData('ban', 'Ban a member (works even if they already left)', PermissionFlagsBits.BanMembers)
    .addUserOption(userOption('User to ban'))
    .addStringOption(reasonOption)
    .addIntegerOption((o) =>
      o.setName('delete_days').setDescription('Also delete their messages from the last N days (0-7)').setMinValue(0).setMaxValue(7).setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = interaction.options.getUser('user', true);
    const reason = reasonOf(interaction);
    const days = interaction.options.getInteger('delete_days', false) ?? 0;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) assertCanModerate(interaction, member);
    else if (user.id === interaction.user.id) throw new UserError("You can't ban yourself.");
    await dm(user, `🔨 You were **banned** from **${interaction.guild.name}**.\nReason: ${reason}`);
    await interaction.guild.members.ban(user, { reason: `${interaction.user.username}: ${reason}`, deleteMessageSeconds: days * 86400 });
    await logAction(interaction, { action: '🔨 Member banned', color: 0xed4245, target: user, reason });
    await done(interaction, `Banned **${user.username}**.`);
  },
};

const unban = {
  data: makeData('unban', 'Unban a user by their ID', PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('user_id').setDescription('The banned user\'s ID (Server Settings → Bans)').setMaxLength(25).setRequired(true))
    .addStringOption(reasonOption),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const id = interaction.options.getString('user_id', true).trim();
    if (!/^\d{15,25}$/.test(id)) throw new UserError('That does not look like a user ID (it is a long number).');
    const reason = reasonOf(interaction);
    try {
      await interaction.guild.members.unban(id, `${interaction.user.username}: ${reason}`);
    } catch (err) {
      if (err.code === 10026) throw new UserError('That user is not banned.');
      throw err;
    }
    await logAction(interaction, { action: '♻️ Member unbanned', color: 0x57f287, target: { id }, reason });
    await done(interaction, `Unbanned <@${id}>.`);
  },
};

const timeout = {
  data: makeData('timeout', 'Mute a member for a while (they can read but not talk)', PermissionFlagsBits.ModerateMembers)
    .addUserOption(userOption('Member to timeout'))
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 2h, 1d, 1h30m (max 28d)').setMaxLength(20).setRequired(true))
    .addStringOption(reasonOption),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = interaction.options.getUser('user', true);
    const ms = parseDuration(interaction.options.getString('duration', true));
    if (!ms || ms < 5000 || ms > 28 * 864e5) throw new UserError('Duration must be between 5 seconds and 28 days — try `10m`, `2h` or `1d`.');
    const reason = reasonOf(interaction);
    const member = await fetchMember(interaction, user);
    assertCanModerate(interaction, member);
    await member.timeout(ms, `${interaction.user.username}: ${reason}`);
    await dm(user, `🔇 You were **timed out** in **${interaction.guild.name}** for ${formatDuration(ms)}.\nReason: ${reason}`);
    await logAction(interaction, { action: '🔇 Member timed out', color: 0xf1c40f, target: user, reason, extra: [{ name: 'Duration', value: formatDuration(ms), inline: true }] });
    await done(interaction, `Timed out **${user.username}** for **${formatDuration(ms)}**.`);
  },
};

const untimeout = {
  data: makeData('untimeout', 'Remove a timeout early', PermissionFlagsBits.ModerateMembers).addUserOption(userOption('Member')).addStringOption(reasonOption),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = interaction.options.getUser('user', true);
    const member = await fetchMember(interaction, user);
    await member.timeout(null, `${interaction.user.username}: ${reasonOf(interaction)}`);
    await logAction(interaction, { action: '🔊 Timeout removed', color: 0x57f287, target: user, reason: reasonOf(interaction) });
    await done(interaction, `Removed the timeout from **${user.username}**.`);
  },
};

const warn = {
  data: makeData('warn', 'Give a member a warning (saved and DMed to them)', PermissionFlagsBits.ModerateMembers)
    .addUserOption(userOption('Member to warn'))
    .addStringOption((o) => o.setName('reason').setDescription('Why are you warning them?').setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    if (user.bot) throw new UserError("Bots can't be warned.");
    if (user.id === interaction.user.id) throw new UserError("You can't warn yourself.");
    const g = store.guild(interaction.guildId);
    const list = (g.warnings[user.id] ??= []);
    const entry = { id: Date.now().toString(36), modId: interaction.user.id, reason, at: Date.now() };
    list.push(entry);
    store.save();
    await dm(user, `⚠️ You received a **warning** in **${interaction.guild.name}**.\nReason: ${reason}\nTotal warnings: ${list.length}`);
    await logAction(interaction, { action: '⚠️ Member warned', color: 0xf1c40f, target: user, reason, extra: [{ name: 'Total', value: String(list.length), inline: true }] });
    await done(interaction, `Warned **${user.username}** (warning #${list.length}, ID \`${entry.id}\`).`);
  },
};

const warnings = {
  data: makeData('warnings', "See a member's warnings", PermissionFlagsBits.ModerateMembers).addUserOption(userOption('Member')),
  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const list = store.guild(interaction.guildId).warnings[user.id] ?? [];
    const embed = baseEmbed(interaction.guildId)
      .setTitle(`⚠️ Warnings for ${user.username}`)
      .setDescription(
        list.length
          ? list.slice(-15).map((w, i) => `**${i + 1}.** \`${w.id}\` • <t:${unix(w.at)}:d> • by <@${w.modId}>\n${truncate(w.reason, 200)}`).join('\n\n')
          : 'No warnings — squeaky clean ✨'
      );
    await interaction.reply({ embeds: [embed], flags: EPHEMERAL, allowedMentions: { parse: [] } });
  },
};

const clearwarnings = {
  data: makeData('clearwarnings', 'Remove all warnings (or one by ID) from a member', PermissionFlagsBits.ModerateMembers)
    .addUserOption(userOption('Member'))
    .addStringOption((o) => o.setName('warning_id').setDescription('Only remove this warning ID (see /warnings)').setMaxLength(20).setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const user = interaction.options.getUser('user', true);
    const id = interaction.options.getString('warning_id', false);
    const g = store.guild(interaction.guildId);
    const list = g.warnings[user.id] ?? [];
    if (!list.length) throw new UserError('That member has no warnings.');
    if (id) {
      const next = list.filter((w) => w.id !== id.trim());
      if (next.length === list.length) throw new UserError('No warning with that ID.');
      g.warnings[user.id] = next;
    } else {
      delete g.warnings[user.id];
    }
    store.save();
    await logAction(interaction, { action: '🧹 Warnings cleared', color: 0x3498db, target: user, reason: id ? `Removed warning ${id}` : 'Removed all warnings' });
    await done(interaction, id ? 'Warning removed.' : `Cleared all warnings for **${user.username}**.`);
  },
};

const purge = {
  data: makeData('purge', 'Bulk-delete recent messages (up to 100, newer than 14 days)', PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('amount').setDescription('How many messages to delete (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this member').setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user', false);
    const channel = interaction.channel;
    let messages = await channel.messages.fetch({ limit: 100 });
    if (user) messages = messages.filter((m) => m.author.id === user.id);
    const toDelete = [...messages.values()].slice(0, amount);
    const deleted = await channel.bulkDelete(toDelete, true);
    await logAction(interaction, { action: '🧹 Messages purged', color: 0x3498db, target: user, reason: `${deleted.size} message(s) in <#${channel.id}>` });
    await done(interaction, `Deleted **${deleted.size}** message(s).${deleted.size < toDelete.length ? ' (Messages older than 14 days can\'t be bulk-deleted.)' : ''}`);
  },
};

const slowmode = {
  data: makeData('slowmode', 'Set slowmode in this channel (0 = off)', PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) => o.setName('seconds').setDescription('Seconds between messages (0-21600)').setMinValue(0).setMaxValue(21600).setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const seconds = interaction.options.getInteger('seconds', true);
    await interaction.channel.setRateLimitPerUser(seconds, `Slowmode by ${interaction.user.username}`);
    await done(interaction, seconds ? `Slowmode set to **${formatDuration(seconds * 1000)}**.` : 'Slowmode turned **off**.');
  },
};

function lockCommand(name, locking) {
  return {
    data: makeData(name, locking ? 'Stop @everyone from talking in this channel' : 'Let @everyone talk in this channel again', PermissionFlagsBits.ManageChannels).addStringOption(reasonOption),
    async execute(interaction) {
      await interaction.deferReply({ flags: EPHEMERAL });
      const reason = reasonOf(interaction);
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: locking ? false : null }, { reason: `${interaction.user.username}: ${reason}` });
      await interaction.channel.send({
        embeds: [baseEmbed(interaction.guildId).setDescription(locking ? `🔒 **Channel locked.**\n${reason}` : '🔓 **Channel unlocked.** You can chat again!')],
      }).catch(() => {});
      await logAction(interaction, { action: locking ? '🔒 Channel locked' : '🔓 Channel unlocked', color: 0x3498db, target: null, reason: `<#${interaction.channelId}> — ${reason}` });
      await done(interaction, locking ? 'Channel locked.' : 'Channel unlocked.');
    },
  };
}

module.exports = [kick, ban, unban, timeout, untimeout, warn, warnings, clearwarnings, purge, slowmode, lockCommand('lock', true), lockCommand('unlock', false)];
