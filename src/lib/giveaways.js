const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../store');
const { UserError, unix } = require('../utils');

function pickWinners(entries, count) {
  const pool = [...entries];
  const winners = [];
  while (winners.length < count && pool.length) {
    winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return winners;
}

function giveawayEmbed(gw) {
  const e = new EmbedBuilder().setTitle(`🎉 ${gw.prize}`).setColor(gw.ended ? 0x95a5a6 : 0xeb459e);
  const lines = [];
  if (gw.ended) {
    lines.push(`**Ended** <t:${unix(gw.endsAt)}:R>`);
    lines.push(`🏆 **Winner${gw.winnerIds.length === 1 ? '' : 's'}:** ${gw.winnerIds.length ? gw.winnerIds.map((id) => `<@${id}>`).join(', ') : 'No valid entries 😢'}`);
  } else {
    lines.push('Click **Enter** below for a chance to win!', '');
    lines.push(`⏰ **Ends:** <t:${unix(gw.endsAt)}:R> (<t:${unix(gw.endsAt)}:f>)`);
    lines.push(`🏆 **Winners:** ${gw.winners}`);
    if (gw.requiredRoleId) lines.push(`🔒 **Requires:** <@&${gw.requiredRoleId}>`);
  }
  lines.push(`🎤 **Hosted by:** <@${gw.hostId}>`);
  e.setDescription(lines.join('\n')).setFooter({ text: `${gw.entries.length} entr${gw.entries.length === 1 ? 'y' : 'ies'}` });
  return e;
}

function enterRow(gw) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gw:enter')
      .setLabel(`Enter (${gw.entries.length})`)
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!!gw.ended)
  );
}

// Ends a giveaway (or re-rolls an ended one) and announces the winners.
async function finish(client, guildId, messageId, { reroll = false } = {}) {
  const gw = store.guild(guildId).giveaways[messageId];
  if (!gw) throw new UserError('I could not find that giveaway.');
  if (gw.ended && !reroll) throw new UserError('That giveaway already ended. Use `/giveaway reroll` to pick new winners.');
  if (!gw.ended && reroll) throw new UserError('That giveaway is still running.');

  gw.winnerIds = pickWinners(gw.entries, gw.winners);
  gw.ended = true;
  store.save();

  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  if (!channel) return gw;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) await message.edit({ embeds: [giveawayEmbed(gw)], components: [enterRow(gw)] }).catch(() => {});

  const text = gw.winnerIds.length
    ? `🎉 Congratulations ${gw.winnerIds.map((id) => `<@${id}>`).join(', ')}! You won **${gw.prize}**!`
    : `😢 Nobody entered the giveaway for **${gw.prize}**.`;
  await channel
    .send({ content: text, allowedMentions: { users: gw.winnerIds }, reply: message ? { messageReference: message.id, failIfNotExists: false } : undefined })
    .catch(() => {});
  return gw;
}

// Runs every 15s and ends giveaways whose time is up (survives restarts).
function startChecker(client) {
  setInterval(() => {
    const now = Date.now();
    for (const [guildId, server] of Object.entries(store.data.servers)) {
      for (const [messageId, gw] of Object.entries(server.giveaways ?? {})) {
        if (!gw.ended && gw.endsAt <= now) {
          finish(client, guildId, messageId).catch((err) => console.error('Giveaway end failed:', err.message));
        }
      }
    }
  }, 15_000).unref();
}

module.exports = { giveawayEmbed, enterRow, finish, startChecker };
