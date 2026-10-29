const { Events, REST, Routes, ActivityType } = require('discord.js');
const giveaways = require('../lib/giveaways');

async function registerCommands(client) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  const body = client.commandData;
  const guildIds = (process.env.GUILD_ID || '').split(/[,\s]+/).filter(Boolean);

  try {
    if (guildIds.length) {
      // Dev mode: instant commands in your server(s). Global list is emptied so nothing shows up twice.
      for (const id of guildIds) {
        await rest.put(Routes.applicationGuildCommands(client.user.id, id), { body });
        console.log(`✅ Registered ${body.length} commands in server ${id} (live in ~1 second).`);
      }
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body });
      console.log(`✅ Registered ${body.length} global commands (can take up to an hour to appear the first time).`);
    }
  } catch (err) {
    const hint = err.code === 50001
      ? ' → Re-invite the bot with the "applications.commands" scope (use /invite or the README link).'
      : '';
    console.error(`❌ Command registration failed (${err.code ?? err.name}): ${err.message}${hint}`);
  }
}

function startPresence(client) {
  let i = 0;
  const update = () => {
    const members = client.guilds.cache.reduce((n, g) => n + g.memberCount, 0);
    const options = [
      process.env.BOT_STATUS?.trim() || '/help • Outlast Head Bot',
      `${client.guilds.cache.size} server${client.guilds.cache.size === 1 ? '' : 's'}`,
      `${members.toLocaleString('en-US')} members`,
    ];
    client.user.setPresence({ activities: [{ name: options[i++ % options.length], type: ActivityType.Watching }], status: 'online' });
  };
  update();
  setInterval(update, 10 * 60 * 1000).unref();
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`🟢 Logged in as ${client.user.tag} — in ${client.guilds.cache.size} server(s).`);
    if (!client.features.members) console.log('ℹ️  Running without the Server Members Intent (welcome/goodbye disabled).');
    await registerCommands(client);
    startPresence(client);
    giveaways.startChecker(client);
  },
};
