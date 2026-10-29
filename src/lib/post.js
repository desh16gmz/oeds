const { UserError, urlOption, resolveColor, resolvePing, allowedMentionsFor, gatePings, assertCanSend, EPHEMERAL } = require('../utils');

// ---------- shared slash-command options ----------

function addStyleOptions(sub) {
  return sub
    .addStringOption((o) => o.setName('banner').setDescription('Large banner image URL').setMaxLength(1000).setRequired(false))
    .addStringOption((o) => o.setName('thumbnail').setDescription('Small corner image URL').setMaxLength(1000).setRequired(false))
    .addStringOption((o) => o.setName('color').setDescription('Color name (red, gold, teal…) or hex like #5865F2').setMaxLength(12).setRequired(false))
    .addStringOption((o) => o.setName('footer').setDescription('Custom footer text').setMaxLength(200).setRequired(false));
}

function addPostOptions(sub) {
  return sub
    .addStringOption((o) =>
      o
        .setName('alert_mode')
        .setDescription('Ping above the post')
        .addChoices({ name: 'None (silent)', value: 'none' }, { name: '@here', value: 'here' }, { name: '@everyone', value: 'everyone' })
        .setRequired(false)
    )
    .addRoleOption((o) => o.setName('alert_role').setDescription('Also ping this role').setRequired(false))
    .addChannelOption((o) => o.setName('channel').setDescription('Where to post (default: this channel)').addChannelTypes(0, 5).setRequired(false))
    .addBooleanOption((o) => o.setName('preview').setDescription('Only show ME a private preview — do not post').setRequired(false));
}

// Reads + validates style options. Call BEFORE deferring so errors stay private.
function readStyle(interaction) {
  const color = interaction.options.getString('color', false);
  if (color != null) resolveColor(color);
  return {
    banner: urlOption(interaction, 'banner'),
    thumbnail: urlOption(interaction, 'thumbnail'),
    color,
    footer: interaction.options.getString('footer', false),
  };
}

function applyStyle(embed, style, { color, footer }) {
  embed.setColor(resolveColor(style.color, color));
  if (style.banner) embed.setImage(style.banner);
  if (style.thumbnail) embed.setThumbnail(style.thumbnail);
  const f = style.footer ?? footer;
  if (f) embed.setFooter({ text: f });
  return embed;
}

// Sends the embed (or a private preview) and confirms to the staff member.
async function deliver(interaction, embed, label, { react = [] } = {}) {
  if (interaction.options.getBoolean('preview', false)) {
    await interaction.editReply({ content: '👀 **Private preview** — run the command again without `preview` to post it.', embeds: [embed] });
    return null;
  }
  const target = interaction.options.getChannel('channel', false) ?? interaction.channel;
  assertCanSend(target, interaction.guild.members.me, react.length ? ['AddReactions', 'ReadMessageHistory'] : []);
  const mentions = await gatePings(interaction, resolvePing(interaction));
  const sent = await target.send({
    content: mentions.join(' ') || undefined,
    embeds: [embed],
    allowedMentions: allowedMentionsFor(mentions),
  });
  for (const emoji of react) await sent.react(emoji);
  await interaction.editReply(
    `✅ ${label} posted — message ID \`${sent.id}\`\n🔗 <https://discord.com/channels/${sent.guildId}/${sent.channelId}/${sent.id}>`
  );
  return sent;
}

async function startEphemeral(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
}

module.exports = { addStyleOptions, addPostOptions, readStyle, applyStyle, deliver, startEphemeral, UserError };
