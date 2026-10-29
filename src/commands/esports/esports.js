const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../../store');
const { addStyleOptions, addPostOptions, readStyle, applyStyle, deliver } = require('../../lib/post');
const {
  urlOption, resolveColor, resolvePing, allowedMentionsFor, gatePings, EPHEMERAL, UserError,
} = require('../../utils');

const staff = (name, description) =>
  new SlashCommandBuilder().setName(name).setDescription(description).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).setDMPermission(false);

const text = (o, name, desc, max = 200, required = false) => o.setName(name).setDescription(desc).setMaxLength(max).setRequired(required);
const brand = (interaction) => store.guild(interaction.guildId).settings.color;
const get = (interaction, name) => interaction.options.getString(name, false) ?? undefined;
const nl = (s) => s?.replace(/\\n/g, '\n');

// ───────────── /tournament ─────────────
const tournament = {
  data: addPostOptions(addStyleOptions(
    staff('tournament', 'Post a tournament announcement (prize pool, format, signup info)')
      .addStringOption((o) => text(o, 'title', 'Headline (default: 🏆 Tournament Announcement)', 256))
      .addStringOption((o) => text(o, 'game', 'Game (BGMI, Valorant, Call of Duty…)', 100))
      .addStringOption((o) => text(o, 'starts', 'Date & time, e.g. "Sat 30 Nov, 6 PM IST"', 120))
      .addStringOption((o) => text(o, 'format', 'Format, e.g. "Single elim • Bo3 finals"', 200))
      .addStringOption((o) => text(o, 'team_size', 'Slots, e.g. "5v5 • 32 slots"', 100))
      .addStringOption((o) => text(o, 'prize_pool', 'Prize pool, e.g. "$5,000 total"', 200))
      .addStringOption((o) => text(o, 'registration', 'How to register', 500))
      .addStringOption((o) => text(o, 'rules_link', 'Rules / doc URL', 1000))
      .addStringOption((o) => text(o, 'details', 'Extra info: map pool, schedule… (markdown, \\n = new line)', 2000))
  )),
  async execute(interaction) {
    const style = readStyle(interaction);
    const rules = urlOption(interaction, 'rules_link');
    const lines = [
      get(interaction, 'game') && `🎮 **Game:** ${get(interaction, 'game')}`,
      get(interaction, 'starts') && `📅 **Starts:** ${get(interaction, 'starts')}`,
      get(interaction, 'format') && `🔀 **Format:** ${get(interaction, 'format')}`,
      get(interaction, 'team_size') && `👥 **Slots:** ${get(interaction, 'team_size')}`,
      get(interaction, 'prize_pool') && `💰 **Prize pool:** ${get(interaction, 'prize_pool')}`,
      get(interaction, 'registration') && `📝 **Register:** ${get(interaction, 'registration')}`,
      rules && `📜 **Rules:** ${rules}`,
      get(interaction, 'details') && `\n${nl(get(interaction, 'details'))}`,
    ].filter(Boolean);
    if (!lines.length) throw new UserError('Give me some details — try `game`, `starts`, `prize_pool` or `registration`.');

    const embed = new EmbedBuilder()
      .setTitle(get(interaction, 'title') ?? '🏆 Tournament Announcement')
      .setDescription(lines.join('\n'))
      .setTimestamp(new Date());
    applyStyle(embed, style, { color: '#E74C3C', footer: 'All the best, GLHF! 🎮' });
    await interaction.deferReply({ flags: EPHEMERAL });
    await deliver(interaction, embed, 'Tournament');
  },
};

// ───────────── /match ─────────────
const match = {
  data: addPostOptions(addStyleOptions(
    staff('match', 'Announce an upcoming match (teams, time, stream link)')
      .addStringOption((o) => text(o, 'team_a', 'Team 1 name', 100, true))
      .addStringOption((o) => text(o, 'team_b', 'Team 2 name', 100, true))
      .addStringOption((o) => text(o, 'game', 'Game', 100))
      .addStringOption((o) => text(o, 'event', 'Event name, e.g. "Scrims Cup Stage 2"', 200))
      .addStringOption((o) => text(o, 'starts', 'Date & time, e.g. "Today 8:30 PM IST"', 120))
      .addStringOption((o) => text(o, 'best_of', 'Format, e.g. "Bo5"', 60))
      .addStringOption((o) => text(o, 'stream_link', 'Stream / watch URL', 1000))
  )),
  async execute(interaction) {
    const style = readStyle(interaction);
    const stream = urlOption(interaction, 'stream_link');
    const lines = [
      `🆚 **${get(interaction, 'team_a')}** vs **${get(interaction, 'team_b')}**`,
      get(interaction, 'event') && `🏆 **Event:** ${get(interaction, 'event')}`,
      get(interaction, 'game') && `🎮 **Game:** ${get(interaction, 'game')}`,
      get(interaction, 'starts') && `📅 **Starts:** ${get(interaction, 'starts')}`,
      get(interaction, 'best_of') && `🔀 **Format:** ${get(interaction, 'best_of')}`,
      stream && `📺 **Watch:** ${stream}`,
    ].filter(Boolean);
    const embed = new EmbedBuilder().setTitle('⚔️ Match Announcement').setDescription(lines.join('\n')).setTimestamp(new Date());
    applyStyle(embed, style, { color: '#ED4245', footer: 'See you in the arena! 🎮' });
    await interaction.deferReply({ flags: EPHEMERAL });
    await deliver(interaction, embed, 'Match');
  },
};

// ───────────── /result ─────────────
const result = {
  data: addPostOptions(addStyleOptions(
    staff('result', 'Announce a match result (winner, score, MVP)')
      .addStringOption((o) => text(o, 'winner', 'Winning team / player', 100, true))
      .addStringOption((o) => text(o, 'game', 'Game / event name', 100))
      .addStringOption((o) => text(o, 'team_a', 'Team 1 name', 100))
      .addStringOption((o) => text(o, 'team_b', 'Team 2 name', 100))
      .addStringOption((o) => text(o, 'score', 'Score, e.g. "3 - 1"', 60))
      .addStringOption((o) => text(o, 'mvp', 'MVP of the match', 100))
      .addStringOption((o) => text(o, 'summary', 'Short recap (markdown, \\n = new line)', 1500))
      .addStringOption((o) => text(o, 'stats_link', 'Stats / bracket / VOD URL', 1000))
  )),
  async execute(interaction) {
    const style = readStyle(interaction);
    const winner = interaction.options.getString('winner', true);
    const [a, b, score] = ['team_a', 'team_b', 'score'].map((n) => get(interaction, n));
    const stats = urlOption(interaction, 'stats_link');
    const lines = [
      get(interaction, 'game') && `🎮 **${get(interaction, 'game')}**`,
      a && b && score ? `**${a}** ${score} **${b}**` : score && `📊 **Score:** ${score}`,
      get(interaction, 'mvp') && `⭐ **MVP:** ${get(interaction, 'mvp')}`,
      get(interaction, 'summary') && `\n${nl(get(interaction, 'summary'))}`,
      stats && `📈 **Stats/VOD:** ${stats}`,
    ].filter(Boolean);
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Result: ${winner}`)
      .setDescription(lines.join('\n') || `🏆 Congratulations to **${winner}**!`)
      .setTimestamp(new Date());
    applyStyle(embed, style, { color: '#57F287', footer: 'GG WP 🎮' });
    await interaction.deferReply({ flags: EPHEMERAL });
    await deliver(interaction, embed, 'Result');
  },
};

// ───────────── /tryouts ─────────────
const tryouts = {
  data: addPostOptions(addStyleOptions(
    staff('tryouts', 'Open tryouts / roster recruitment')
      .addStringOption((o) => text(o, 'position', 'Role(s) needed, e.g. "IGL + Entry"', 200, true))
      .addStringOption((o) => text(o, 'team_name', 'Team / org name', 100))
      .addStringOption((o) => text(o, 'game', 'Game', 100))
      .addStringOption((o) => text(o, 'date', 'Tryout date & time', 120))
      .addStringOption((o) => text(o, 'requirements', 'Requirements (rank, region, mic…) — use \\n between lines', 1000))
      .addStringOption((o) => text(o, 'apply', 'How to apply (form URL, DM @staff, ticket…)', 500))
  )),
  async execute(interaction) {
    const style = readStyle(interaction);
    const team = get(interaction, 'team_name');
    const lines = [
      `🪖 **Positions:** ${interaction.options.getString('position', true)}`,
      get(interaction, 'game') && `🎮 **Game:** ${get(interaction, 'game')}`,
      get(interaction, 'date') && `📅 **When:** ${get(interaction, 'date')}`,
      get(interaction, 'requirements') && `✅ **Requirements:**\n${nl(get(interaction, 'requirements'))}`,
      get(interaction, 'apply') && `📝 **Apply:** ${get(interaction, 'apply')}`,
    ].filter(Boolean);
    const embed = new EmbedBuilder()
      .setTitle(team ? `🎯 Tryouts: ${team}` : '🎯 Tryouts Open')
      .setDescription(lines.join('\n\n'))
      .setTimestamp(new Date());
    applyStyle(embed, style, { color: '#1ABC9C', footer: 'Recruitment • good luck! 🍀' });
    await interaction.deferReply({ flags: EPHEMERAL });
    await deliver(interaction, embed, 'Tryouts');
  },
};

// ───────────── /schedule ─────────────
function scheduleOptions(sub, requireEntries) {
  return addStyleOptions(sub
    .addStringOption((o) => text(o, 'entries', 'One slot per line, e.g. "Mon 8 PM IST - Scrims" (use \\n between lines)', 3500, requireEntries))
    .addStringOption((o) => text(o, 'title', 'Headline (default: 🗓 Weekly Schedule)', 256))
    .addStringOption((o) => text(o, 'timezone', 'Note, e.g. "All times IST (GMT+5:30)"', 100))
    .addStringOption((o) => text(o, 'notes', 'Extra info (markdown OK)', 1500)));
}

const schedule = {
  data: staff('schedule', 'Post (and later edit) a weekly scrim / season schedule')
    .addSubcommand((sub) => addPostOptions(scheduleOptions(sub.setName('post').setDescription('Post the schedule embed'), true)))
    .addSubcommand((sub) => {
      sub.setName('edit').setDescription('Edit a posted schedule (blank options stay unchanged)');
      sub.addStringOption((o) => text(o, 'message_id', 'Message ID of the schedule (right-click → Copy Message ID)', 25, true));
      scheduleOptions(sub, false);
      return sub
        .addStringOption((o) =>
          o.setName('alert_mode').setDescription('Ping above the schedule')
            .addChoices({ name: 'None (silent)', value: 'none' }, { name: '@here', value: 'here' }, { name: '@everyone', value: 'everyone' })
            .setRequired(false)
        )
        .addRoleOption((o) => o.setName('alert_role').setDescription('Also ping this role').setRequired(false));
    }),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const style = readStyle(interaction);
    const entries = get(interaction, 'entries');

    let message;
    let embed;
    if (sub === 'edit') {
      await interaction.deferReply({ flags: EPHEMERAL });
      const id = interaction.options.getString('message_id', true).trim();
      message = await interaction.channel.messages.fetch(id).catch(() => null);
      if (!message) throw new UserError(`I couldn't find message \`${id}\` in this channel.`);
      if (message.author.id !== interaction.client.user.id) throw new UserError('I can only edit schedules I posted myself.');
      if (!message.embeds.length) throw new UserError('That message has no embed to edit.');
      embed = EmbedBuilder.from(message.embeds[0]);
    } else {
      embed = new EmbedBuilder().setTitle('🗓 Weekly Schedule').setTimestamp(new Date());
    }

    if (entries != null) {
      const lines = nl(entries).split('\n').map((l) => l.trim()).filter(Boolean)
        .map((l) => (/^(•|[-*]\s|\p{Extended_Pictographic})/u.test(l) ? l : `• ${l}`));
      embed.setDescription(
        lines.join('\n') +
          (get(interaction, 'timezone') ? `\n\n⏰ ${get(interaction, 'timezone')}` : '') +
          (get(interaction, 'notes') ? `\n\n📌 ${nl(get(interaction, 'notes'))}` : '')
      );
    }
    if (get(interaction, 'title')) embed.setTitle(get(interaction, 'title'));
    if (style.color != null) embed.setColor(resolveColor(style.color));
    else if (sub === 'post') embed.setColor(resolveColor(null, '#3498DB'));
    if (style.banner) embed.setImage(style.banner);
    if (style.thumbnail) embed.setThumbnail(style.thumbnail);
    if (style.footer) embed.setFooter({ text: style.footer });
    else if (sub === 'post') embed.setFooter({ text: 'Be on time, bring your best. 🔥' });
    if (!embed.data.description) throw new UserError('Add at least one schedule line in `entries`.');

    if (sub === 'post') {
      await interaction.deferReply({ flags: EPHEMERAL });
      return deliver(interaction, embed, 'Schedule');
    }

    const mentions = await gatePings(interaction, resolvePing(interaction));
    await message.edit({
      content: mentions.length ? mentions.join(' ') : message.content || undefined,
      embeds: [embed],
      allowedMentions: allowedMentionsFor(mentions),
    });
    await interaction.editReply(`✅ Schedule edited: <https://discord.com/channels/${interaction.guildId}/${message.channelId}/${message.id}>`);
  },
};

// ───────────── /poll ─────────────
const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const poll = {
  data: addPostOptions(
    staff('poll', 'Quick community poll with clickable reactions (2–10 options)')
      .addStringOption((o) => text(o, 'question', 'The question', 250, true))
      .addStringOption((o) => text(o, 'options', 'Options separated by commas, e.g. "Saturday, Sunday, Both days"', 1000, true))
      .addStringOption((o) => text(o, 'color', 'Color name or hex', 12))
  ),
  async execute(interaction) {
    const choices = interaction.options.getString('options', true).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (choices.length < 2) throw new UserError('Please give at least **2** options, separated by commas.');
    if (choices.length > 10) throw new UserError('Maximum **10** options for reaction polls.');
    const embed = new EmbedBuilder()
      .setColor(resolveColor(get(interaction, 'color'), brand(interaction)))
      .setTitle(`📊 ${interaction.options.getString('question', true)}`)
      .setDescription(choices.map((c, i) => `${NUMBERS[i]} ${c}`).join('\n'))
      .setFooter({ text: 'React below to vote' })
      .setTimestamp();
    await interaction.deferReply({ flags: EPHEMERAL });
    await deliver(interaction, embed, 'Poll', { react: NUMBERS.slice(0, choices.length) });
  },
};

module.exports = [tournament, match, result, tryouts, schedule, poll];
