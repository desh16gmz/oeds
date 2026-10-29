const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../../store');
const { progress } = require('../../lib/leveling');
const { baseEmbed, okEmbed, progressBar, assertCanSend, EPHEMERAL, UserError } = require('../../utils');

const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your level and XP (or someone else\'s)')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who? (default: you)').setRequired(false)),
  async execute(interaction) {
    const g = store.guild(interaction.guildId);
    if (!g.leveling.enabled) throw new UserError('Levels are switched off on this server. Admins can enable them with `/levels toggle`.');
    const user = interaction.options.getUser('user', false) ?? interaction.user;
    const entry = g.users[user.id] ?? { xp: 0 };
    const p = progress(entry.xp);
    const position = Object.entries(g.users).sort((a, b) => b[1].xp - a[1].xp).findIndex(([id]) => id === user.id) + 1;
    const embed = baseEmbed(interaction.guildId)
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setDescription(`**Level ${p.level}**\n${progressBar(p.current, p.needed)} ${p.current}/${p.needed} XP`)
      .addFields(
        { name: 'Rank', value: position ? `#${position}` : 'Unranked', inline: true },
        { name: 'Total XP', value: entry.xp.toLocaleString('en-US'), inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top members by XP')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('page').setDescription('Page number (10 per page)').setMinValue(1).setRequired(false)),
  async execute(interaction) {
    const g = store.guild(interaction.guildId);
    if (!g.leveling.enabled) throw new UserError('Levels are switched off on this server.');
    const sorted = Object.entries(g.users).filter(([, u]) => u.xp > 0).sort((a, b) => b[1].xp - a[1].xp);
    const pages = Math.max(1, Math.ceil(sorted.length / 10));
    const page = Math.min(interaction.options.getInteger('page', false) ?? 1, pages);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = sorted.slice((page - 1) * 10, page * 10).map(([id, u], i) => {
      const n = (page - 1) * 10 + i;
      return `${medals[n] ?? `**${n + 1}.**`} <@${id}> — Level ${progress(u.xp).level} • ${u.xp.toLocaleString('en-US')} XP`;
    });
    const embed = baseEmbed(interaction.guildId)
      .setTitle(`🏆 ${interaction.guild.name} leaderboard`)
      .setDescription(lines.join('\n') || 'Nobody has earned XP yet — start chatting!')
      .setFooter({ text: `Page ${page}/${pages}` });
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

const levels = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Configure the XP & level system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('toggle').setDescription('Turn the level system on or off')
        .addBooleanOption((o) => o.setName('enabled').setDescription('true = on').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('announce').setDescription('Level-up announcements: on/off, channel and text')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Announce level-ups?').setRequired(false))
        .addChannelOption((o) => o.setName('channel').setDescription('Announce here (leave empty = same channel as the message)').addChannelTypes(0, 5).setRequired(false))
        .addStringOption((o) => o.setName('message').setDescription('Text — {user} {username} {level} {server}').setMaxLength(500).setRequired(false))
        .addBooleanOption((o) => o.setName('reset_channel').setDescription('Go back to announcing in the same channel').setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('rate').setDescription('Change how much XP a message gives and how often')
        .addIntegerOption((o) => o.setName('min_xp').setDescription('Minimum XP per message').setMinValue(1).setMaxValue(500).setRequired(true))
        .addIntegerOption((o) => o.setName('max_xp').setDescription('Maximum XP per message').setMinValue(1).setMaxValue(500).setRequired(true))
        .addIntegerOption((o) => o.setName('cooldown').setDescription('Seconds between XP gains (default 60)').setMinValue(0).setMaxValue(3600).setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('reward-add').setDescription('Give a role when members reach a level')
        .addIntegerOption((o) => o.setName('level').setDescription('Level required').setMinValue(1).setMaxValue(500).setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Role to give').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('reward-remove').setDescription('Remove the role reward for a level')
        .addIntegerOption((o) => o.setName('level').setDescription('Level').setMinValue(1).setMaxValue(500).setRequired(true))
    )
    .addSubcommand((s) => s.setName('reward-list').setDescription('Show all level role rewards'))
    .addSubcommand((s) =>
      s.setName('setxp').setDescription("Set a member's XP (e.g. to fix or reset it)")
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption((o) => o.setName('xp').setDescription('New total XP (0 resets)').setMinValue(0).setMaxValue(10000000).setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const g = store.guild(interaction.guildId);
    const L = g.leveling;
    await interaction.deferReply({ flags: EPHEMERAL });
    const done = (t) => interaction.editReply({ embeds: [okEmbed(t, interaction.guildId)] });

    if (sub === 'toggle') {
      L.enabled = interaction.options.getBoolean('enabled', true);
      store.save();
      return done(`Levels are now **${L.enabled ? 'on' : 'off'}**.`);
    }

    if (sub === 'announce') {
      const enabled = interaction.options.getBoolean('enabled', false);
      const channel = interaction.options.getChannel('channel', false);
      const message = interaction.options.getString('message', false);
      const reset = interaction.options.getBoolean('reset_channel', false);
      if (enabled !== null) L.announce = enabled;
      if (channel) { assertCanSend(channel, interaction.guild.members.me); L.channelId = channel.id; }
      if (reset) L.channelId = null;
      if (message) L.message = message;
      store.save();
      return done(`Level-ups: **${L.announce ? 'announced' : 'silent'}** • ${L.channelId ? `<#${L.channelId}>` : 'same channel'}\nText: ${L.message}`);
    }

    if (sub === 'rate') {
      L.xpMin = interaction.options.getInteger('min_xp', true);
      L.xpMax = Math.max(L.xpMin, interaction.options.getInteger('max_xp', true));
      L.cooldown = interaction.options.getInteger('cooldown', false) ?? L.cooldown;
      store.save();
      return done(`Each message now gives **${L.xpMin}–${L.xpMax} XP**, at most once every **${L.cooldown}s**.`);
    }

    if (sub === 'reward-add') {
      const role = interaction.options.getRole('role', true);
      if (role.managed || role.id === interaction.guildId) throw new UserError('That role cannot be used as a reward.');
      if (!role.editable) throw new UserError(`I can't assign **${role.name}** — move my role above it in Server Settings → Roles.`);
      const level = interaction.options.getInteger('level', true);
      L.rewards[level] = role.id;
      store.save();
      return done(`Members reaching **level ${level}** will get <@&${role.id}>.`);
    }

    if (sub === 'reward-remove') {
      const level = interaction.options.getInteger('level', true);
      if (!L.rewards[level]) throw new UserError(`No reward is set for level ${level}.`);
      delete L.rewards[level];
      store.save();
      return done(`Removed the level ${level} reward.`);
    }

    if (sub === 'reward-list') {
      const lines = Object.entries(L.rewards).sort((a, b) => a[0] - b[0]).map(([lvl, id]) => `Level **${lvl}** → <@&${id}>`);
      return interaction.editReply({ embeds: [baseEmbed(interaction.guildId).setTitle('🎁 Level rewards').setDescription(lines.join('\n') || 'None yet — add one with `/levels reward-add`.')] });
    }

    if (sub === 'setxp') {
      const user = interaction.options.getUser('user', true);
      const xp = interaction.options.getInteger('xp', true);
      g.users[user.id] = { xp, level: progress(xp).level, last: 0 };
      store.save();
      return done(`<@${user.id}> now has **${xp} XP** (level ${progress(xp).level}).`);
    }
  },
};

module.exports = [rank, leaderboard, levels];
