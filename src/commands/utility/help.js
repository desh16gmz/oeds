const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { baseEmbed, truncate, EPHEMERAL, UserError } = require('../../utils');

// Category display info. Any new folder in src/commands automatically shows up too.
const CATEGORIES = {
  admin: { label: 'Setup & Customisation', emoji: '⚙️', blurb: 'Welcome, goodbye, branding and server settings' },
  community: { label: 'Community', emoji: '🎉', blurb: 'Levels, giveaways, tickets and role panels' },
  moderation: { label: 'Moderation', emoji: '🛡️', blurb: 'Kick, ban, timeout, warn, purge and more' },
  esports: { label: 'eSports & Announcements', emoji: '🏆', blurb: 'Announcements, tournaments, matches, schedules, polls' },
  fun: { label: 'Fun', emoji: '🎲', blurb: 'Dice, coin flips, team splitter and more' },
  utility: { label: 'Utility', emoji: '🧰', blurb: 'Info and handy tools' },
};
const meta = (key) => CATEGORIES[key] ?? { label: key[0].toUpperCase() + key.slice(1), emoji: '📦', blurb: '' };

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Browse everything the bot can do — or get details on one command')
  .setDMPermission(false)
  .addStringOption((o) => o.setName('command').setDescription('Get detailed help for one command').setAutocomplete(true).setRequired(false));

function grouped(client) {
  const groups = new Map();
  for (const cmd of client.commands.values()) {
    const key = cmd.category ?? 'general';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cmd);
  }
  return groups;
}

function menuRow(client, selected) {
  const options = [...grouped(client).keys()].map((key) => ({
    label: meta(key).label,
    value: key,
    emoji: meta(key).emoji,
    default: key === selected,
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('help:menu').setPlaceholder('Choose a category…').addOptions(options)
  );
}

function overviewEmbed(client, guildId) {
  const groups = grouped(client);
  return baseEmbed(guildId)
    .setTitle('📖 Outlast Head Bot — Help')
    .setDescription(
      'Pick a category from the menu below, or use `/help command:<name>` for details.\n🔒 = staff-only (visibility can be changed in **Server Settings → Integrations**).\n\n' +
        [...groups.entries()].map(([key, cmds]) => `${meta(key).emoji} **${meta(key).label}** — ${meta(key).blurb} *(${cmds.length})*`).join('\n') +
        '\n\n**New here?** Run `/setup` to configure welcome & goodbye messages in seconds.'
    );
}

function subNames(json) {
  return (json.options ?? []).filter((o) => o.type === 1 || o.type === 2).map((o) => o.name);
}

function categoryEmbed(client, guildId, key) {
  const cmds = grouped(client).get(key) ?? [];
  const lines = cmds
    .map((c) => {
      const json = c.data.toJSON();
      const subs = subNames(json);
      const lock = json.default_member_permissions != null ? ' 🔒' : '';
      return `**/${json.name}**${lock} — ${json.description}${subs.length ? `\n└ \`${subs.join('` `')}\`` : ''}`;
    })
    .join('\n');
  return baseEmbed(guildId).setTitle(`${meta(key).emoji} ${meta(key).label}`).setDescription(truncate(lines, 4000) || 'Nothing here yet.');
}

const TYPE_NAMES = { 3: 'text', 4: 'number', 5: 'yes/no', 6: 'user', 7: 'channel', 8: 'role', 9: 'user/role', 10: 'decimal', 11: 'file' };

function optionLines(options = [], indent = '') {
  return options
    .flatMap((o) => {
      if (o.type === 1 || o.type === 2) {
        return [`${indent}**${o.name}** — ${o.description}`, ...optionLines(o.options, `${indent}　`)];
      }
      return [`${indent}\`${o.name}\`${o.required ? ' **(required)**' : ''} *${TYPE_NAMES[o.type] ?? 'value'}* — ${o.description}`];
    });
}

function detailEmbed(client, guildId, name) {
  const cmd = client.commands.get(name.replace(/^\//, '').toLowerCase());
  if (!cmd) throw new UserError(`I don't have a command called \`${name}\`. Try \`/help\` to browse.`);
  const json = cmd.data.toJSON();
  return baseEmbed(guildId)
    .setTitle(`/${json.name}`)
    .setDescription(`${json.description}\n\n${truncate(optionLines(json.options).join('\n'), 3500) || '*No options — just run it.*'}`);
}

async function execute(interaction, client) {
  const name = interaction.options.getString('command', false);
  if (name) {
    return interaction.reply({ embeds: [detailEmbed(client, interaction.guildId, name)], flags: EPHEMERAL });
  }
  await interaction.reply({ embeds: [overviewEmbed(client, interaction.guildId)], components: [menuRow(client)], flags: EPHEMERAL });
}

async function autocomplete(interaction, client) {
  const focused = interaction.options.getFocused().toLowerCase().replace(/^\//, '');
  const matches = [...client.commands.keys()].filter((n) => n.includes(focused)).slice(0, 25);
  await interaction.respond(matches.map((n) => ({ name: `/${n}`, value: n })));
}

async function handleComponent(interaction, client) {
  if (!interaction.isStringSelectMenu()) return;
  const key = interaction.values[0];
  await interaction.update({ embeds: [categoryEmbed(client, interaction.guildId, key)], components: [menuRow(client, key)] });
}

module.exports = { data, execute, autocomplete, handleComponent, componentPrefix: 'help' };
