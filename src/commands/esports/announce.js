const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../../store');
const {
  resolveColor, urlOption, resolvePing, allowedMentionsFor, gatePings, assertCanSend, safeColor, dash, EPHEMERAL, UserError,
} = require('../../utils');

const str = (o, name, desc, max) => o.setName(name).setDescription(desc).setMaxLength(max).setRequired(false);

function addEmbedOptions(sub) {
  sub
    .addStringOption((o) => str(o, 'title', 'Bold top line (max 256) — use - to remove', 256))
    .addStringOption((o) => str(o, 'description', 'Main text — full markdown. Type \\n for a new line', 4000))
    .addStringOption((o) => str(o, 'color', 'Color name (red, gold, teal…) or hex like #5865F2', 12))
    .addStringOption((o) => str(o, 'image', 'Large banner image URL — use - to remove', 1000))
    .addStringOption((o) => str(o, 'thumbnail', 'Small corner logo URL — use - to remove', 1000))
    .addStringOption((o) => str(o, 'footer_text', 'Small text at the bottom — use - to remove', 256))
    .addStringOption((o) => str(o, 'footer_icon', 'Icon next to the footer text (URL)', 1000))
    .addStringOption((o) => str(o, 'author_name', "Author line, e.g. 'Org Staff' — use - to remove", 256))
    .addStringOption((o) => str(o, 'author_icon', 'Author avatar (URL)', 1000))
    .addBooleanOption((o) => o.setName('field_inline').setDescription('Show fields side-by-side instead of stacked').setRequired(false));
  for (const n of ['field1', 'field2', 'field3']) {
    sub
      .addStringOption((o) => str(o, `${n}_name`, 'Field title (use "-" for a blank)', 256))
      .addStringOption((o) => str(o, `${n}_value`, 'Field text (use "-" for a blank)', 1024));
  }
  return sub;
}

function addAlertOptions(sub) {
  return sub
    .addStringOption((o) =>
      o.setName('alert_mode').setDescription('Ping above the announcement')
        .addChoices({ name: 'None (silent)', value: 'none' }, { name: '@here', value: 'here' }, { name: '@everyone', value: 'everyone' })
        .setRequired(false)
    )
    .addRoleOption((o) => o.setName('alert_role').setDescription('Also ping this role').setRequired(false));
}

const channelOption = (sub) =>
  sub.addChannelOption((o) => o.setName('channel').setDescription('Where to post (default: this channel)').addChannelTypes(0, 5).setRequired(false));

const templateName = (o) => o.setName('name').setDescription('Template name').setMaxLength(32).setAutocomplete(true).setRequired(true);

const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Fully customisable announcements — build, preview, edit and save as templates')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((sub) => {
    addEmbedOptions(sub.setName('create').setDescription('Post a fully customisable announcement embed'));
    sub.addBooleanOption((o) => o.setName('timestamp').setDescription('Add the date/time at the bottom').setRequired(false));
    sub.addBooleanOption((o) => o.setName('preview').setDescription('Show a private preview to me instead of posting').setRequired(false));
    addAlertOptions(sub);
    return channelOption(sub);
  })
  .addSubcommand((sub) => {
    sub.setName('edit').setDescription('Edit an announcement the bot posted (blank options stay unchanged)');
    sub.addStringOption((o) => o.setName('message_id').setDescription('Message ID (right-click message → Copy Message ID)').setRequired(true));
    addEmbedOptions(sub);
    sub.addBooleanOption((o) => o.setName('timestamp').setDescription('Refresh the date/time at the bottom').setRequired(false));
    return addAlertOptions(sub);
  })
  .addSubcommand((sub) =>
    sub.setName('save-template').setDescription('Save a posted announcement as a reusable template')
      .addStringOption((o) => o.setName('name').setDescription('Template name, e.g. tournament-basic').setMaxLength(32).setRequired(true))
      .addStringOption((o) => o.setName('message_id').setDescription('Message ID of the bot announcement to copy').setRequired(true))
  )
  .addSubcommand((sub) => {
    sub.setName('use-template').setDescription('Post an announcement from a saved template').addStringOption(templateName);
    addAlertOptions(sub);
    return channelOption(sub);
  })
  .addSubcommand((sub) => sub.setName('list-templates').setDescription('Show your saved templates with previews'))
  .addSubcommand((sub) => sub.setName('delete-template').setDescription('Delete a saved template').addStringOption(templateName));

// ---------- helpers ----------

const norm = (s) => (s == null || s === '-' ? undefined : s);
const blankify = (s) => norm(s) ?? '\u200b'; // Discord rejects empty strings; an invisible char makes a blank

const URL_OPTIONS = ['image', 'thumbnail', 'footer_icon', 'author_icon'];

function readInputs(interaction) {
  const out = { urls: {} };
  for (const n of URL_OPTIONS) out.urls[n] = urlOption(interaction, n);
  const color = interaction.options.getString('color', false);
  if (color != null) resolveColor(color);
  return out;
}

// Applies the options to `embed` (a fresh EmbedBuilder on create, EmbedBuilder.from(old) on edit).
function applyOptions(interaction, embed, isNew) {
  const g = (n) => interaction.options.getString(n, false);
  const clearable = (name, set, clear) => {
    const v = dash(g(name));
    if (v === undefined) return;
    if (v === null) clear();
    else set(v.replace(/\\n/g, '\n'));
  };

  clearable('title', (v) => embed.setTitle(v), () => embed.setTitle(null));
  clearable('description', (v) => embed.setDescription(v), () => embed.setDescription(null));

  const color = g('color');
  if (color != null) embed.setColor(resolveColor(color));
  else if (isNew) embed.setColor(safeColor(store.guild(interaction.guildId).settings.color));

  for (const [opt, apply, clear] of [
    ['image', (u) => embed.setImage(u), () => embed.setImage(null)],
    ['thumbnail', (u) => embed.setThumbnail(u), () => embed.setThumbnail(null)],
  ]) {
    const raw = g(opt);
    if (raw?.trim() === '-') clear();
    else if (urlOption(interaction, opt)) apply(urlOption(interaction, opt));
  }

  const footerText = g('footer_text');
  const footerIcon = urlOption(interaction, 'footer_icon');
  if (footerText?.trim() === '-') embed.setFooter(null);
  else if (footerText != null || footerIcon) {
    embed.setFooter({ text: norm(footerText) ?? embed.data.footer?.text ?? '\u200b', iconURL: footerIcon ?? embed.data.footer?.icon_url });
  }

  const authorName = g('author_name');
  const authorIcon = urlOption(interaction, 'author_icon');
  if (authorName?.trim() === '-') embed.setAuthor(null);
  else if (authorName != null || authorIcon) {
    embed.setAuthor({ name: norm(authorName) ?? embed.data.author?.name ?? '\u200b', iconURL: authorIcon ?? embed.data.author?.icon_url });
  }

  // Fields: on edit, giving any field replaces the existing ones.
  const inline = interaction.options.getBoolean('field_inline', false) ?? false;
  const fields = [];
  for (const n of ['field1', 'field2', 'field3']) {
    const name = g(`${n}_name`);
    const value = g(`${n}_value`);
    if (name == null && value == null) continue;
    fields.push({ name: blankify(name ?? ''), value: blankify(value ?? '').replace(/\\n/g, '\n'), inline });
  }
  if (fields.length) embed.setFields(fields);

  if (interaction.options.getBoolean('timestamp', false)) embed.setTimestamp(new Date());
  return embed;
}

function templateFromEmbed(e) {
  return {
    title: e.title ?? null,
    description: e.description ?? null,
    color: e.color != null ? `#${e.color.toString(16).padStart(6, '0')}` : null,
    image: e.image?.url ?? null,
    thumbnail: e.thumbnail?.url ?? null,
    footer_text: e.footer?.text ?? null,
    footer_icon: e.footer?.iconURL ?? null,
    author_name: e.author?.name ?? null,
    author_icon: e.author?.iconURL ?? null,
    fields: (e.fields ?? []).map((f) => ({ name: f.name, value: f.value, inline: !!f.inline })),
  };
}

function replayTemplate(t) {
  const e = new EmbedBuilder();
  if (t.title) e.setTitle(t.title);
  if (t.description) e.setDescription(t.description);
  if (t.color) e.setColor(t.color);
  if (t.image) e.setImage(t.image);
  if (t.thumbnail) e.setThumbnail(t.thumbnail);
  if (t.footer_text) e.setFooter({ text: t.footer_text, iconURL: t.footer_icon ?? undefined });
  if (t.author_name) e.setAuthor({ name: t.author_name, iconURL: t.author_icon ?? undefined });
  for (const f of t.fields ?? []) e.addFields({ name: f.name, value: f.value, inline: !!f.inline });
  return e;
}

async function fetchOwnMessage(interaction, id) {
  const message = await interaction.channel.messages.fetch(id.trim()).catch(() => null);
  if (!message) throw new UserError(`I couldn't find message \`${id}\` in this channel. (Run the command in the same channel as the announcement.)`);
  if (message.author.id !== interaction.client.user.id) throw new UserError('That message was not posted by me — I can only edit or save my own announcements.');
  if (!message.embeds.length) throw new UserError('That message has no embed.');
  return message;
}

const hasContent = (e) => !!(e.data.title || e.data.description || e.data.fields?.length || e.data.image || e.data.author);
const link = (m) => `<https://discord.com/channels/${m.guildId}/${m.channelId}/${m.id}>`;

async function send(interaction, embed, label) {
  const target = interaction.options.getChannel('channel', false) ?? interaction.channel;
  assertCanSend(target, interaction.guild.members.me);
  const mentions = await gatePings(interaction, resolvePing(interaction));
  const sent = await target.send({ content: mentions.join(' ') || undefined, embeds: [embed], allowedMentions: allowedMentionsFor(mentions) });
  await interaction.editReply(`✅ ${label} — message ID \`${sent.id}\` (use it with \`/announce edit\` or \`/announce save-template\`).\n🔗 ${link(sent)}`);
}

// ---------- execution ----------

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = store.guild(interaction.guildId);

  if (sub === 'create') {
    readInputs(interaction); // validate before deferring
    const embed = applyOptions(interaction, new EmbedBuilder(), true);
    if (!hasContent(embed)) throw new UserError('Give me at least a **title**, a **description**, or some **fields**.');
    await interaction.deferReply({ flags: EPHEMERAL });
    if (interaction.options.getBoolean('preview', false)) {
      return interaction.editReply({ content: '👀 **Private preview** — run `/announce create` again without `preview` to post it.', embeds: [embed] });
    }
    return send(interaction, embed, 'Announcement posted');
  }

  if (sub === 'edit') {
    readInputs(interaction);
    await interaction.deferReply({ flags: EPHEMERAL });
    const message = await fetchOwnMessage(interaction, interaction.options.getString('message_id', true));
    const embed = applyOptions(interaction, EmbedBuilder.from(message.embeds[0]), false);
    if (!hasContent(embed)) throw new UserError('An announcement needs at least a title, description or fields.');
    const mentions = await gatePings(interaction, resolvePing(interaction));
    await message.edit({
      content: mentions.length ? mentions.join(' ') : message.content || undefined,
      embeds: [embed],
      allowedMentions: allowedMentionsFor(mentions),
    });
    return interaction.editReply(`✅ Edited: ${link(message)}`);
  }

  if (sub === 'save-template') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const name = interaction.options.getString('name', true).toLowerCase().trim();
    const message = await fetchOwnMessage(interaction, interaction.options.getString('message_id', true));
    g.templates[name] = templateFromEmbed(message.embeds[0]);
    store.save();
    return interaction.editReply(`💾 Saved template **${name}**. Post it anywhere with \`/announce use-template name:${name}\``);
  }

  if (sub === 'use-template') {
    const name = interaction.options.getString('name', true).toLowerCase().trim();
    const tpl = g.templates[name];
    if (!tpl) {
      const names = Object.keys(g.templates);
      throw new UserError(`No template named **${name}**. ${names.length ? `Saved: ${names.map((n) => `\`${n}\``).join(', ')}` : 'Save one first with `/announce save-template`.'}`);
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    return send(interaction, replayTemplate(tpl), `Template **${name}** posted`);
  }

  if (sub === 'list-templates') {
    const names = Object.keys(g.templates);
    if (!names.length) return interaction.reply({ content: '📄 No templates yet. Create an announcement, then `/announce save-template`.', flags: EPHEMERAL });
    const previews = names.slice(0, 5).map((n) => replayTemplate(g.templates[n]).setFooter({ text: `Template: ${n}` }));
    return interaction.reply({
      content: `📄 **${names.length}** template(s): ${names.map((n) => `\`${n}\``).join(', ')}${names.length > 5 ? '\n*(previewing the first 5)*' : ''}`,
      embeds: previews,
      flags: EPHEMERAL,
    });
  }

  if (sub === 'delete-template') {
    const name = interaction.options.getString('name', true).toLowerCase().trim();
    if (!g.templates[name]) throw new UserError(`No template named **${name}**.`);
    delete g.templates[name];
    store.save();
    return interaction.reply({ content: `🗑️ Deleted template **${name}**.`, flags: EPHEMERAL });
  }
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const names = Object.keys(store.guild(interaction.guildId).templates).filter((n) => n.includes(focused)).slice(0, 25);
  await interaction.respond(names.map((n) => ({ name: n, value: n })));
}

module.exports = { data, execute, autocomplete };
