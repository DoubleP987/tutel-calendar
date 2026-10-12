import {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
} from 'discord.js';
import { createHash } from 'node:crypto';

const definition = new SlashCommandBuilder()
  .setName('calendar')
  .setDescription('ปฏิทินกลุ่มและแจ้งเตือน')
  .addSubcommand((sub) =>
    sub
      .setName('connect')
      .setDescription('เชื่อมปฏิทินกับช่องนี้ด้วยลิงก์')
      .addStringOption((option) =>
        option
          .setName('calendar')
          .setDescription('ลิงก์ปฏิทิน เช่น https://calendar.toomtoom.online/g/cs-skru')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('view').setDescription('เปิดปฏิทินที่เชื่อมช่องนี้'));

let activeClient = null;

export function calendarDiscordStatus() {
  const guilds = activeClient?.isReady() ? [...activeClient.guilds.cache.values()] : null;
  return {
    discordTransport: process.env.CALENDAR_DISCORD_TOKEN?.trim() ? 'standalone' : 'shared',
    botGuilds: guilds?.length ?? null,
    discordMembers:
      guilds && guilds.every((guild) => Number.isFinite(guild.memberCount))
        ? guilds.reduce((sum, guild) => sum + guild.memberCount, 0)
        : null,
  };
}

export async function assertCalendarChannel(guildId, channelId) {
  if (!process.env.CALENDAR_DISCORD_TOKEN?.trim()) return;
  if (!activeClient?.isReady())
    throw new Error('บอทปฏิทินแยกยังไม่พร้อม ให้ตรวจ token และสถานะก่อน');
  const channel = await activeClient.channels.fetch(String(channelId));
  const permissions = channel?.permissionsFor(activeClient.user);
  if (
    !channel?.isTextBased() ||
    channel.guildId !== String(guildId) ||
    !permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    throw new Error('บอทปฏิทินต้องอยู่ในเซิร์ฟเวอร์ และมีสิทธิ์ดูช่อง ส่งข้อความและ Embed Links');
  }
}

/** Optional Discord identity owned by Calendar. No music, voice, cluster or MongoDB dependency. */
export async function startCalendarDiscordBot() {
  const token = process.env.CALENDAR_DISCORD_TOKEN?.trim();

  if (!token) {
    return () => {};
  }

  const base = new URL(process.env.BASE_URL);
  const secret = process.env.CALENDAR_BOT_SECRET || '';

  if (secret.length < 32 || base.protocol !== 'https:') {
    throw new Error('Calendar Discord requires HTTPS BASE_URL and CALENDAR_BOT_SECRET');
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  activeClient = client;
  let stopped = false;
  let running = false;
  let readyForDelivery = false;

  async function call(path, body) {
    const response = await fetch(new URL('/internal/v1/bot' + path, base), {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: 'Bearer ' + secret,
        'content-type': 'application/json',
        'x-calendar-transport': 'standalone',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'Calendar API unavailable');
    }

    return result;
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'calendar') {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!interaction.guildId) {
        throw new Error('ใช้คำสั่งในเซิร์ฟเวอร์ Discord');
      }

      if (interaction.options.getSubcommand() === 'connect') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          throw new Error('ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์ Discord');
        }

        const permissions = interaction.channel?.permissionsFor(client.user);

        if (
          !permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
          ])
        ) {
          throw new Error('บอทต้องมีสิทธิ์ดูช่อง ส่งข้อความ และ Embed Links');
        }

        const result = await call('/connect-link', {
          calendarUrl: interaction.options.getString('calendar', true),
          discordUserId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        });
        await interaction.editReply({
          content: `เชื่อม ${result.groupName} กับช่องนี้แล้ว`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('เปิดปฏิทิน')
                .setURL(result.url),
            ),
          ],
        });
      } else {
        const bindings = (await call('/bindings'))
          .filter(
            (binding) =>
              binding.guild_id === interaction.guildId &&
              binding.channel_id === interaction.channelId,
          )
          .slice(0, 5);
        await interaction.editReply({
          content: bindings.length
            ? 'ปฏิทินของช่องนี้'
            : 'ยังไม่เชื่อมปฏิทิน ใช้ /calendar connect',
          components: bindings.length
            ? [
                new ActionRowBuilder().addComponents(
                  bindings.map((binding) =>
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Link)
                      .setLabel(binding.slug.slice(0, 80))
                      .setURL(new URL('/g/' + binding.slug, base).href),
                  ),
                ),
              ]
            : [],
        });
      }
    } catch (error) {
      await interaction.editReply({ content: error.message }).catch(() => {});
    }
  });

  async function tick() {
    if (stopped || running || !client.isReady() || !readyForDelivery) {
      return;
    }

    running = true;

    try {
      const { jobs } = await call('/claim', { guildIds: [...client.guilds.cache.keys()] });

      for (const job of jobs) {
        if (stopped) {
          break;
        }

        let started = false;
        let sent = false;

        try {
          const channel = await client.channels.fetch(job.channel_id);

          if (!channel?.isTextBased() || channel.guildId !== job.guild_id) {
            throw new Error('Channel unavailable');
          }

          await call(`/jobs/${job.id}/start`, { claimToken: job.claimToken });
          started = true;
          const lines = job.payload.events.map(
            (event) => `${event.all_day ? 'ทั้งวัน' : event.time} · ${escapeMarkdown(event.title)}`,
          );
          const message = await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  `${job.payload.groupName} · ${job.payload.kind === 'before' ? 'กิจกรรมพรุ่งนี้' : job.payload.kind === 'event' ? 'กิจกรรมใกล้ถึง' : 'กิจกรรมวันนี้'}`.slice(
                    0,
                    256,
                  ),
                )
                .setDescription(lines.join('\n').slice(0, 3500) || 'เปิดปฏิทินเพื่อดูรายละเอียด')
                .setColor(job.payload.color),
            ],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Link)
                  .setLabel('เปิดปฏิทิน')
                  .setURL(job.payload.url),
              ),
            ],
            allowedMentions: { parse: [] },
            nonce: createHash('sha256').update(job.id).digest('hex').slice(0, 25),
            enforceNonce: true,
          });
          sent = true;
          await call(`/jobs/${job.id}/ack`, { claimToken: job.claimToken, messageId: message.id });
        } catch (error) {
          // A send/ack ambiguity stays uncertain for administrator review, never blind retry.
          await call(`/jobs/${job.id}/ack`, {
            claimToken: job.claimToken,
            uncertain: started || sent,
            error: 'Check channel permissions and delivery history',
          }).catch(() => {});
          console.warn('[calendar-discord] delivery:', error.name);
        }
      }
    } catch (error) {
      console.warn('[calendar-discord] API:', error.name);
    } finally {
      running = false;
    }
  }

  client.once(Events.ClientReady, async (ready) => {
    try {
      await ready.application.commands.create(definition);
      ready.user.setActivity('/calendar');
      readyForDelivery = true;
      console.log('[calendar-discord] ready');
    } catch (error) {
      console.warn('[calendar-discord] registration:', error.name);
    }
  });

  client.on(Events.Error, (error) => console.error('[calendar-discord]', error.name));

  try {
    await client.login(token);
  } catch (error) {
    client.destroy();
    activeClient = null;
    throw error;
  }

  const timer = setInterval(() => void tick(), 15000);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
    client.destroy();
    activeClient = null;
  };
}
