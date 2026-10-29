const { EmbedBuilder } = require('discord.js');
const { formatText, ordinal, safeColor, truncate } = require('../utils');

// Placeholders available in welcome / goodbye / DM texts.
const PLACEHOLDERS = {
  '{user}': 'mentions the member (@Name)',
  '{username}': "the member's name",
  '{displayname}': "the member's server nickname",
  '{server}': 'server name',
  '{membercount}': 'number of members',
  '{ordinal}': 'member count as 1st, 2nd, 3rd…',
  '{id}': "the member's ID",
  '\\n': 'a new line',
};

function memberVars(member) {
  const count = member.guild.memberCount;
  return {
    user: `<@${member.id}>`,
    username: member.user.username,
    displayname: member.displayName ?? member.user.username,
    server: member.guild.name,
    membercount: count,
    ordinal: ordinal(count),
    id: member.id,
  };
}

// Builds the welcome or goodbye embed from a server's saved settings.
function buildMemberEmbed(member, cfg, brandColor) {
  const vars = memberVars(member);
  const embed = new EmbedBuilder().setColor(safeColor(cfg.color ?? brandColor)).setTimestamp();
  const title = cfg.title ? truncate(formatText(cfg.title, vars), 256) : null;
  const description = cfg.description ? truncate(formatText(cfg.description, vars), 4000) : null;
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (!title && !description) embed.setDescription(`<@${member.id}>`);
  if (cfg.thumbnail) embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  if (cfg.image) embed.setImage(cfg.image);
  if (cfg.footer) embed.setFooter({ text: truncate(formatText(cfg.footer, vars), 2048) });
  return embed;
}

module.exports = { PLACEHOLDERS, memberVars, buildMemberEmbed };
