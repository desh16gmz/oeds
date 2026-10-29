const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../../store');
const { PLACEHOLDERS, buildMemberEmbed } = require('../../lib/memberMessages');
const { okEmbed, baseEmbed, resolveColor, validateUrl, dash, assertCanSend, EPHEMERAL, UserError } = require('../../utils');

// One factory builds both /welcome and /goodbye so they always behave the same way.
function createCommand(kind) {
  const isWelcome = kind === 'welcome';
  const noun = isWelcome ? 'welcome' : 'goodbye';

  const data = new SlashCommandBuilder()
    .setName(noun)
    .setDescription(isWelcome ? 'Customise how new members are welcomed' : 'Customise the message shown when someone leaves')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('channel').setDescription(`Choose the ${noun} channel (also switches ${noun} messages on)`)
        .addChannelOption((o) => o.setName('channel').setDescription('Text channel').addChannelTypes(0, 5).setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('toggle').setDescription(`Turn ${noun} messages on or off`)
        .addBooleanOption((o) => o.setName('enabled').setDescription('true = on, false = off').setRequired(true))
    )
    .addSubcommand((s) => {
      s.setName('message').setDescription(`Edit the ${noun} embed — leave options blank to keep them, use - to clear`)
        .addStringOption((o) => o.setName('title').setDescription('Embed title — placeholders like {user} {server} work').setMaxLength(256).setRequired(false))
        .addStringOption((o) => o.setName('description').setDescription('Embed text — type \\n for a new line. See /' + noun + ' placeholders').setMaxLength(2000).setRequired(false))
        .addStringOption((o) => o.setName('color').setDescription('Color name or hex (blank = server brand color)').setMaxLength(12).setRequired(false))
        .addStringOption((o) => o.setName('image').setDescription('Big banner image URL (or - to remove)').setMaxLength(1000).setRequired(false))
        .addStringOption((o) => o.setName('footer').setDescription('Footer text (or - to remove)').setMaxLength(200).setRequired(false))
        .addBooleanOption((o) => o.setName('thumbnail').setDescription("Show the member's avatar in the corner").setRequired(false));
      if (isWelcome) s.addBooleanOption((o) => o.setName('ping').setDescription('Mention the new member above the embed').setRequired(false));
      return s;
    });

  if (isWelcome) {
    data
      .addSubcommand((s) =>
        s.setName('dm').setDescription('Send new members a private welcome DM')
          .addBooleanOption((o) => o.setName('enabled').setDescription('Turn the welcome DM on/off').setRequired(false))
          .addStringOption((o) => o.setName('message').setDescription('DM text — placeholders work, \\n = new line').setMaxLength(1500).setRequired(false))
      )
      .addSubcommand((s) =>
        s.setName('autorole-add').setDescription('Give this role to every new member automatically')
          .addRoleOption((o) => o.setName('role').setDescription('Role to assign').setRequired(true))
      )
      .addSubcommand((s) =>
        s.setName('autorole-remove').setDescription('Stop auto-assigning a role')
          .addRoleOption((o) => o.setName('role').setDescription('Role to remove from the list').setRequired(true))
      )
      .addSubcommand((s) => s.setName('autorole-list').setDescription('Show the roles given to new members'));
  }

  data
    .addSubcommand((s) => s.setName('preview').setDescription(`Privately preview your ${noun} message (using you as the member)`))
    .addSubcommand((s) => s.setName('test').setDescription(`Post a real test ${noun} message in the configured channel`))
    .addSubcommand((s) => s.setName('placeholders').setDescription('List the {placeholders} you can use in texts'))
    .addSubcommand((s) => s.setName('reset').setDescription(`Reset ${noun} settings to the defaults`));

  async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const g = store.guild(interaction.guildId);
    const cfg = g[kind];
    const me = interaction.guild.members.me;
    await interaction.deferReply({ flags: EPHEMERAL });
    const done = (text) => interaction.editReply({ embeds: [okEmbed(text, interaction.guildId)] });

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      assertCanSend(channel, me);
      cfg.channelId = channel.id;
      cfg.enabled = true;
      store.save();
      return done(`${isWelcome ? 'Welcome' : 'Goodbye'} messages are **on** in <#${channel.id}>. Try \`/${noun} preview\` or \`/${noun} test\`.`);
    }

    if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      if (enabled && !cfg.channelId) throw new UserError(`Pick a channel first with \`/${noun} channel\`.`);
      cfg.enabled = enabled;
      store.save();
      return done(`${isWelcome ? 'Welcome' : 'Goodbye'} messages are now **${enabled ? 'on' : 'off'}**.`);
    }

    if (sub === 'message') {
      const get = (n) => interaction.options.getString(n, false);
      const title = dash(get('title'));
      const description = dash(get('description'));
      const footer = dash(get('footer'));
      const image = dash(get('image'));
      const color = dash(get('color'));
      const thumbnail = interaction.options.getBoolean('thumbnail', false);
      const ping = isWelcome ? interaction.options.getBoolean('ping', false) : null;

      if (color) resolveColor(color);
      if (image) validateUrl(image, 'image');
      const provided = [title, description, footer, image, color].some((v) => v !== undefined) || thumbnail !== null || (ping !== null && ping !== undefined);
      if (!provided) throw new UserError('Give me at least one thing to change — e.g. `title`, `description`, `color`, `image`…');

      if (title !== undefined) cfg.title = title;
      if (description !== undefined) cfg.description = description;
      if (footer !== undefined) cfg.footer = footer;
      if (image !== undefined) cfg.image = image;
      if (color !== undefined) cfg.color = color === null ? null : `#${resolveColor(color).toString(16).padStart(6, '0').toUpperCase()}`;
      if (thumbnail !== null) cfg.thumbnail = thumbnail;
      if (ping !== null && ping !== undefined) cfg.ping = ping;
      store.save();

      return interaction.editReply({
        content: `✅ Saved! This is how it looks now:`,
        embeds: [buildMemberEmbed(interaction.member, cfg, g.settings.color)],
      });
    }

    if (sub === 'dm') {
      const enabled = interaction.options.getBoolean('enabled', false);
      const message = interaction.options.getString('message', false);
      if (enabled === null && message === null) throw new UserError('Set `enabled` and/or `message`.');
      if (enabled !== null) cfg.dm = enabled;
      if (message !== null) cfg.dmMessage = message;
      store.save();
      return done(`Welcome DM is **${cfg.dm ? 'on' : 'off'}**.\nMessage: ${cfg.dmMessage}`);
    }

    if (sub === 'autorole-add' || sub === 'autorole-remove') {
      const role = interaction.options.getRole('role', true);
      if (sub === 'autorole-add') {
        if (role.managed || role.id === interaction.guildId) throw new UserError('That role cannot be assigned automatically.');
        if (!role.editable) throw new UserError(`I can't assign **${role.name}** — move my role above it in Server Settings → Roles.`);
        if (cfg.autoRoles.length >= 10) throw new UserError('Maximum 10 auto-roles.');
        if (!cfg.autoRoles.includes(role.id)) cfg.autoRoles.push(role.id);
        store.save();
        return done(`New members will get <@&${role.id}>.`);
      }
      cfg.autoRoles = cfg.autoRoles.filter((id) => id !== role.id);
      store.save();
      return done(`<@&${role.id}> is no longer an auto-role.`);
    }

    if (sub === 'autorole-list') {
      return interaction.editReply({
        embeds: [baseEmbed(interaction.guildId).setTitle('🏷️ Auto-roles').setDescription(cfg.autoRoles.map((id) => `• <@&${id}>`).join('\n') || 'None yet — add one with `/welcome autorole-add`.')],
      });
    }

    if (sub === 'preview') {
      return interaction.editReply({ content: `👀 **Preview** (you are the member):`, embeds: [buildMemberEmbed(interaction.member, cfg, g.settings.color)] });
    }

    if (sub === 'test') {
      const channel = cfg.channelId && interaction.guild.channels.cache.get(cfg.channelId);
      if (!channel) throw new UserError(`No ${noun} channel yet — set one with \`/${noun} channel\`.`);
      assertCanSend(channel, me);
      await channel.send({
        content: isWelcome && cfg.ping ? `<@${interaction.user.id}>` : undefined,
        embeds: [buildMemberEmbed(interaction.member, cfg, g.settings.color)],
        allowedMentions: { users: isWelcome && cfg.ping ? [interaction.user.id] : [] },
      });
      return done(`Test ${noun} sent to <#${channel.id}>.`);
    }

    if (sub === 'placeholders') {
      return interaction.editReply({
        embeds: [baseEmbed(interaction.guildId).setTitle('🧩 Placeholders').setDescription(Object.entries(PLACEHOLDERS).map(([k, v]) => `\`${k}\` — ${v}`).join('\n') + '\n\nExample: `/' + noun + ' message title:Welcome {username}! description:You are {ordinal} to join {server}`')],
      });
    }

    if (sub === 'reset') {
      const keep = { channelId: cfg.channelId, enabled: cfg.enabled, autoRoles: cfg.autoRoles };
      store.resetSection(interaction.guildId, kind);
      Object.assign(store.guild(interaction.guildId)[kind], keep);
      store.save();
      return done(`${isWelcome ? 'Welcome' : 'Goodbye'} texts and styling were reset (channel and on/off state kept).`);
    }
  }

  return { data, execute, category: 'admin' };
}

module.exports = [createCommand('welcome'), createCommand('goodbye')];
