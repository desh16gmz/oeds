const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, UserError } = require('../../utils');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const splitList = (text) => text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

const coinflip = {
  data: new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin').setDMPermission(false),
  async execute(interaction) {
    await interaction.reply(`🪙 It's **${pick(['Heads', 'Tails'])}**!`);
  },
};

const roll = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice (default: one 6-sided die)')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('sides').setDescription('Sides per die (2-1000, default 6)').setMinValue(2).setMaxValue(1000).setRequired(false))
    .addIntegerOption((o) => o.setName('dice').setDescription('How many dice (1-20, default 1)').setMinValue(1).setMaxValue(20).setRequired(false)),
  async execute(interaction) {
    const sides = interaction.options.getInteger('sides', false) ?? 6;
    const dice = interaction.options.getInteger('dice', false) ?? 1;
    const rolls = Array.from({ length: dice }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0);
    await interaction.reply(dice > 1 ? `🎲 ${dice}d${sides}: ${rolls.join(' + ')} = **${total}**` : `🎲 d${sides}: **${total}**`);
  },
};

const eightball = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('question').setDescription('Your yes/no question').setMaxLength(200).setRequired(true)),
  async execute(interaction) {
    const answers = ['It is certain.', 'Without a doubt.', 'Yes — definitely.', 'Most likely.', 'Signs point to yes.', 'Ask again later.', 'Cannot predict now.', "Don't count on it.", 'My sources say no.', 'Very doubtful.'];
    await interaction.reply({ content: `🎱 **${interaction.options.getString('question', true)}**\n${pick(answers)}`, allowedMentions: { parse: [] } });
  },
};

const choose = {
  data: new SlashCommandBuilder()
    .setName('choose')
    .setDescription("Can't decide? Let the bot pick")
    .setDMPermission(false)
    .addStringOption((o) => o.setName('options').setDescription('Options separated by commas, e.g. "Ascent, Bind, Haven"').setMaxLength(500).setRequired(true)),
  async execute(interaction) {
    const options = splitList(interaction.options.getString('options', true));
    if (options.length < 2) throw new UserError('Give me at least 2 options separated by commas.');
    await interaction.reply({ content: `🤔 I choose… **${pick(options)}**`, allowedMentions: { parse: [] } });
  },
};

const teams = {
  data: new SlashCommandBuilder()
    .setName('teams')
    .setDescription('Randomly split players into fair teams (great for customs & scrims)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('players').setDescription('Names or @mentions separated by commas').setMaxLength(1500).setRequired(true))
    .addIntegerOption((o) => o.setName('teams').setDescription('Number of teams (2-10, default 2)').setMinValue(2).setMaxValue(10).setRequired(false)),
  async execute(interaction) {
    const players = splitList(interaction.options.getString('players', true));
    const count = interaction.options.getInteger('teams', false) ?? 2;
    if (players.length < count) throw new UserError(`You need at least ${count} players for ${count} teams.`);
    const groups = Array.from({ length: count }, () => []);
    shuffle(players).forEach((p, i) => groups[i % count].push(p));
    const embed = baseEmbed(interaction.guildId)
      .setTitle('🎮 Random teams')
      .addFields(groups.map((g, i) => ({ name: `Team ${i + 1} (${g.length})`, value: g.join('\n').slice(0, 1024) || '—', inline: true })));
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

module.exports = [coinflip, roll, eightball, choose, teams];
