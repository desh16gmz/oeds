const { Events } = require('discord.js');
const { EPHEMERAL, UserError, friendlyError, failEmbed } = require('../utils');

async function reportError(interaction, err) {
  if (interaction.isAutocomplete()) return;
  if (err?.code === 10062) {
    // Discord's 3-second window was missed (slow network, clock drift, or another copy of the bot answering).
    console.warn(`⏱️  /${interaction.commandName ?? interaction.customId} was not acknowledged in time (Discord error 10062). Check server clock/network and that only ONE copy of the bot is running.`);
    return;
  }
  const known = friendlyError(err);
  if (!known) console.error(`Error in ${interaction.commandName ?? interaction.customId}:`, err);
  const message = { embeds: [failEmbed(known ?? 'Something went wrong on my side. Please try again — if it keeps happening, tell the server admins.')] };
  try {
    if (interaction.deferred && !interaction.replied) await interaction.editReply({ content: null, components: [], ...message });
    else if (interaction.replied || interaction.deferred) await interaction.followUp({ ...message, flags: EPHEMERAL });
    else await interaction.reply({ ...message, flags: EPHEMERAL });
  } catch { /* interaction expired */ }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return;
        if (!interaction.inGuild()) throw new UserError('Please use my commands inside a server.');
        await cmd.execute(interaction, client);
      } else if (interaction.isAutocomplete()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd?.autocomplete) await cmd.autocomplete(interaction, client);
      } else if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        const handler = client.components.get(interaction.customId.split(':')[0]);
        if (handler?.handleComponent) await handler.handleComponent(interaction, client);
      }
    } catch (err) {
      await reportError(interaction, err);
    }
  },
};
