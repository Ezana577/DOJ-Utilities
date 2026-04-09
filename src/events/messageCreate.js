import { Events } from 'discord.js';
import { buildEmbed } from '../utils/embedBuilder.js';
import { PREFIX, PING_COOLDOWN_MS } from '../../config/constants.js';
import { logger } from '../utils/logger.js';
import { runRolesync, resetSyncInterval, OWNER_ID } from '../utils/rolesync.js';

const mentionCooldowns = new Map();

export const name = Events.MessageCreate;

export async function execute(message) {
  if (message.author.bot) return;

  const isMention =
    message.content === `<@${message.client.user.id}>` ||
    message.content === `<@!${message.client.user.id}>`;

  if (isMention) {
    const userId = message.author.id;
    const now = Date.now();
    const lastSent = mentionCooldowns.get(userId);

    if (lastSent && now - lastSent < PING_COOLDOWN_MS) {
      logger.debug('MENTION', `Cooldown active for ${message.author.tag} in guild ${message.guildId}`);
      return;
    }

    mentionCooldowns.set(userId, now);
    logger.info('MENTION', `Responded to mention from ${message.author.tag} in guild ${message.guildId}`);

    const embed = buildEmbed({
      title: 'Department of Justice',
      description: `Greetings. My prefix is:\n\`\`\`\n${PREFIX}\n\`\`\`\nFor a full list of commands, use the slash command menu.`,
      footer: 'PRPC Department of Justice',
      timestamp: true,
    });

    await message.reply({ embeds: [embed] });
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  if (commandName === 'rolesync') {
    if (message.author.id !== OWNER_ID) {
      return message.reply({
        embeds: [buildEmbed({
          title: 'Access Denied',
          description: 'You do not have the proper permission to run this command.',
          footer: 'PRPC Department of Justice',
          timestamp: true,
        })],
      }).catch(() => {});
    }

    await message.reply({
      embeds: [buildEmbed({
        title: 'Rolesync Initiated',
        description: 'Manual sync has been triggered. Check the sync log channel for live updates.',
        footer: 'PRPC Department of Justice',
        timestamp: true,
      })],
    }).catch(() => {});

    logger.info('ROLESYNC', `Manual sync triggered via prefix by ${message.author.tag}`);
    resetSyncInterval(message.client);
    await runRolesync(message.client, message.author.id);
    return;
  }

  const command = message.client.prefixCommands.get(commandName);
  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (err) {
    logger.error('PREFIX', `Error executing command ${commandName}`, err);
    await message.reply({ content: 'An error occurred while executing that command.' });
  }
}