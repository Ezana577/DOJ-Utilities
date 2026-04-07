import { Events } from 'discord.js';
import { buildEmbed } from '../utils/embedBuilder.js';
import { PREFIX, PING_COOLDOWN_MS } from '../../config/constants.js';
import { logger } from '../utils/logger.js';

const mentionCooldowns = new Map();

export const name = Events.MessageCreate;

export async function execute(message) {
  if (message.author.bot) return;

  const isMention =
    message.content === `<@${message.client.user.id}>` ||
    message.content === `<@!${message.client.user.id}>`;

  if (!isMention) return;

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
}
