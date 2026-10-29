# 🤖 Outlast Head Bot

An all-in-one, **fully customisable** Discord bot — welcome & goodbye messages, auto-roles, moderation, tickets, giveaways, levels, role panels and eSports announcements. Everything is controlled with **slash commands** (no code editing, no redeploys).

---

## 🚀 Quick start (5 minutes)

### 1. Create the bot
1. Open <https://discord.com/developers/applications> → **New Application** → name it *Outlast Head Bot*.
2. **Bot** tab → **Reset Token** → copy it (keep it secret!).
3. Still on the **Bot** tab, scroll to **Privileged Gateway Intents** and switch **ON → SERVER MEMBERS INTENT** → Save.
   *(Required for welcome / goodbye / auto-roles. If you forget, the bot still starts and tells you what to fix.)*

### 2. Invite it to your server
**OAuth2 → URL Generator** → scopes: `bot` + `applications.commands` → permission: **Administrator** (easiest) — or at least *View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Add Reactions, Manage Roles, Manage Channels, Manage Messages, Kick/Ban/Moderate Members, Mention Everyone*. Open the generated link and pick your server.

> Later, `/invite` gives you a ready-made link.

### 3. Run it
You need **Node.js 18.17+** (<https://nodejs.org>).

| System | Do this |
|---|---|
| **Windows** | Double-click **`start.bat`**. First run creates `.env` → open it, paste your token, double-click `start.bat` again. |
| **Linux / macOS** | `./start.sh` (same flow). |
| **Manual** | `cp .env.example .env` → edit → `npm install` → `npm start` |

`start.bat` / `start.sh` install the modules automatically the first time — that fixes the "Cannot find module 'discord.js'" error.

In `.env`:
- `DISCORD_TOKEN` — your bot token (required)
- `GUILD_ID` — your server ID for **instant** slash commands (optional; several IDs separated by commas). Leave empty to run the bot in many servers (global commands, up to 1 hour the first time).
- `BOT_STATUS` — custom "Watching …" text (optional)

### 4. Configure in Discord
```
/setup welcome_channel:#welcome goodbye_channel:#goodbye log_channel:#mod-logs autorole:@Member
/welcome preview
/help
```
That's it — new members are welcomed, leavers get a goodbye, and everything else is one `/help` away.

---

## ✨ Features & commands

Run **`/help`** in Discord for an interactive menu, or `/help command:announce` for details on any command. 🔒 = staff-only by default (change per command in *Server Settings → Integrations → Outlast Head Bot*).

### ⚙️ Setup & customisation
| Command | What it does |
|---|---|
| `/setup` | One-shot wizard: welcome, goodbye, log channel and auto-role. Shows a status checklist. |
| `/welcome` | `channel` · `toggle` · `message` (title, text, color, banner image, footer, avatar, ping) · `dm` · `autorole-add/remove/list` · `preview` · `test` · `placeholders` · `reset` |
| `/goodbye` | `channel` · `toggle` · `message` · `preview` · `test` · `placeholders` · `reset` |
| `/config` | `view` all settings · brand `color` · default `footer` · `logchannel` · `reset` sections |

### 🎉 Community
| Command | What it does |
|---|---|
| `/levels` | XP system: `toggle`, `announce` (channel + text), `rate` (XP & cooldown), `reward-add/remove/list` (role rewards), `setxp` |
| `/rank` · `/leaderboard` | Level, progress bar, server ranking |
| `/giveaway` | `start` (duration, winners, required role, ping) · `end` · `reroll` · `list` — button entry, survives restarts |
| `/ticket` | `setup` (panel with button) · `close` · `add` · `remove` — private channels, transcripts to your log channel |
| `/rolepanel` | Button panel so members pick their own roles (staff-permission roles are blocked for safety) |

### 🛡️ Moderation
`/kick` `/ban` `/unban` `/timeout` `/untimeout` `/warn` `/warnings` `/clearwarnings` `/purge` `/slowmode` `/lock` `/unlock` — role-hierarchy safe, DMs the user, writes to the log channel.

### 🏆 eSports & announcements
| Command | What it does |
|---|---|
| `/announce` | `create` (title, text, color, banner, thumbnail, footer, author, 3 fields, pings) · `edit` · `save-template` · `use-template` (autocomplete) · `list-templates` · `delete-template` |
| `/tournament` `/match` `/result` `/tryouts` | Ready-made structured embeds. All support `banner`, `thumbnail`, `color`, `footer`, `alert_mode`, `alert_role`, `channel` and **`preview`** |
| `/schedule` | `post` a weekly schedule once, `edit` it every week by message ID |
| `/poll` | Reaction poll with 2–10 options |

### 🎲 Fun & utility
`/teams` (random fair teams for customs) · `/roll` · `/coinflip` · `/8ball` · `/choose` · `/ping` · `/botinfo` · `/serverinfo` · `/userinfo` · `/avatar` · `/invite` · `/help`

---

## 🎨 Customising welcome & goodbye

```
/welcome message title:Welcome {username}! description:You are our **{ordinal}** member in {server}.\nRead the rules in <#123456789012345678> color:teal image:https://example.com/banner.png footer:Member #{membercount}
/welcome dm enabled:true message:Hey {username}, welcome to **{server}**!
/welcome autorole-add role:@Member
```

**Placeholders** (work in titles, texts, footers and DMs): `{user}` (mention) · `{username}` · `{displayname}` · `{server}` · `{membercount}` · `{ordinal}` (1st, 2nd…) · `{id}` · `\n` = new line.
Use **`-`** in an option to clear it (e.g. `image:-`). Blank options keep their current value. Always check with `/welcome preview`.

**Brand it:** `/config color color:#FF8800` and `/config footer text:Outlast Head • est. 2024` restyle every bot embed in your server.

---

## 🔒 Safety built in
- `@everyone`/`@here` posted by the bot is limited to once per hour per channel (use `alert_role` for instant alerts).
- Mentions in bot messages never ping unless you asked for it.
- Moderation respects the role hierarchy; nobody can act on the owner, themselves or higher roles.
- Role panels refuse roles that carry staff permissions.
- If a data file is ever corrupted, it is backed up automatically and the bot starts fresh instead of crashing.

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'discord.js'` | Run `npm install` (or use `start.bat` / `start.sh`). |
| Slash commands don't show up | Put your server ID in `GUILD_ID` for instant commands, or wait up to 1 hour (global). Re-invite with the `applications.commands` scope if registration fails. |
| Welcome / goodbye never fires | Enable **Server Members Intent** (Developer Portal → Bot) and restart. Check `/setup` for the status checklist. |
| "I'm missing permissions in #channel" | Give the bot *View Channel, Send Messages, Embed Links* there. |
| Can't assign a role | Drag the bot's role **above** that role in *Server Settings → Roles*. |
| `Unknown interaction` (10062) in the console | Discord got the bot's reply too late (>3s). Check the server clock (`timedatectl`, enable NTP), network latency, and that **only one** copy of the bot is running (`pgrep -af "node src/index.js"`). Then retry the command. |
| Commands duplicated | With `GUILD_ID` set the bot clears global commands automatically on next start. |

`npm run check` syntax-checks every file.

## 📁 Project layout
```
src/index.js            startup, command loader, intent fallback
src/store.js            safe JSON storage (data/store.json) with auto-defaults
src/utils.js            colors, URLs, placeholders, durations, ping safety, permission checks
src/events/             ready, interactionCreate, guildMemberAdd/Remove, messageCreate, guildCreate
src/lib/                welcome embed builder, XP curve, giveaway engine, shared post helpers
src/commands/<folder>/  one file per feature group — drop in a new file and it's auto-loaded
```
Adding your own command: create `src/commands/yourfolder/mycommand.js` exporting `{ data, execute }` (see any existing file). It appears in `/help` automatically.

## 🔄 Upgrading from "esports-announcer-bot"
Copy your old `data/store.json` into this folder's `data/` — saved templates carry over.

### What was fixed in the original
- **Missing modules** — no installer/launcher and no friendly error; now `start.bat`/`start.sh` install automatically and the bot explains exactly what's missing.
- `/announce edit` and `/schedule edit` **crashed** (Discord's received embed can't be modified directly) — fixed.
- `/announce create` wrongly rejected title-only posts — fixed.
- Template names promised autocomplete that didn't exist — added.
- Commands were registered **both** globally and per-server (duplicates) — now one or the other.
- Un-awaited replies could hide errors; errors now always come back as clear, private messages.
