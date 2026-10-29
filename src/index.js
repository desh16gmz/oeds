// ─────────────────────────────────────────────────────────────
//  Outlast Head Bot — entry point
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

// 1) Friendly check for missing modules (the #1 reason a fresh download fails).
for (const mod of ['discord.js', 'dotenv']) {
  try {
    require.resolve(mod);
  } catch {
    console.error(`\n❌ The module "${mod}" is not installed yet.\n   Open a terminal in this folder and run:   npm install\n   (or just double-click start.bat on Windows / run ./start.sh on Linux & macOS)\n`);
    process.exit(1);
  }
}

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const store = require('./store');

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token || token === 'paste_your_bot_token_here') {
  console.error('\n❌ DISCORD_TOKEN is missing.\n   Copy .env.example to .env and paste your bot token from https://discord.com/developers/applications (Bot → Reset Token).\n');
  process.exit(1);
}

// 2) Load every command in src/commands/** (a file may export one command or an array of them).
function loadCommands() {
  const commands = new Collection();
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : e.name.endsWith('.js') ? [p] : [];
    });

  const root = path.join(__dirname, 'commands');
  for (const file of walk(root)) {
    try {
      const exported = require(file);
      const list = Array.isArray(exported) ? exported : [exported];
      const folder = path.basename(path.dirname(file));
      for (const cmd of list) {
        if (!cmd?.data || typeof cmd.execute !== 'function') throw new Error('needs { data, execute }');
        cmd.category ??= folder === 'commands' ? 'general' : folder;
        commands.set(cmd.data.name, cmd);
      }
    } catch (err) {
      console.error(`⚠️  Skipped ${path.relative(root, file)}: ${err.message}`);
    }
  }
  return commands;
}

const commands = loadCommands();

// Components (buttons / menus) are routed by the part of customId before the first ":".
const components = new Collection();
for (const cmd of commands.values()) {
  for (const prefix of [].concat(cmd.componentPrefix ?? [])) components.set(prefix, cmd);
}

function loadEvents() {
  const dir = path.join(__dirname, 'events');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => require(path.join(dir, f)));
}
const events = loadEvents();

function createClient(useMembers) {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
  if (useMembers) intents.push(GatewayIntentBits.GuildMembers); // privileged: needed for welcome / goodbye
  const client = new Client({ intents, partials: [Partials.Message, Partials.Channel] });

  client.commands = commands;
  client.components = components;
  client.commandData = commands.map((c) => c.data.toJSON());
  client.features = { members: useMembers };

  for (const ev of events) {
    const run = async (...args) => {
      try {
        await ev.execute(...args, client);
      } catch (err) {
        console.error(`Error in event ${ev.name}:`, err);
      }
    };
    if (ev.once) client.once(ev.name, run);
    else client.on(ev.name, run);
  }
  client.on('error', (err) => console.error('Client error:', err.message));
  client.on('warn', (m) => console.warn('Warn:', m));
  return client;
}

let current;
async function start(useMembers = true) {
  current = createClient(useMembers);
  try {
    await current.login(token);
  } catch (err) {
    if (useMembers && (err.code === 'DisallowedIntents' || /disallowed intents/i.test(err.message))) {
      console.warn(
        '\n⚠️  The "Server Members Intent" is OFF for your bot, so welcome/goodbye/auto-role cannot work yet.\n' +
          '   Fix: https://discord.com/developers/applications → your app → Bot → turn ON "SERVER MEMBERS INTENT" → Save → restart.\n' +
          '   Starting WITHOUT it for now so everything else keeps working...\n'
      );
      try { await current.destroy(); } catch { /* ignore */ }
      return start(false);
    }
    console.error('\n❌ Login failed — check that DISCORD_TOKEN in your .env is correct.\n', err.message);
    process.exit(1);
  }
}

// 3) Keep the bot alive on unexpected errors and shut down cleanly.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n${sig} received — saving data and shutting down.`);
    store.flush();
    try { await current?.destroy(); } catch { /* ignore */ }
    process.exit(0);
  });
}

console.log(`Starting Outlast Head Bot with ${commands.size} commands...`);
start();
