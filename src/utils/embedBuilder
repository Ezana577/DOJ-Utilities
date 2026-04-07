import { EmbedBuilder } from 'discord.js';
import { EMBED_COLOR } from '../../config/constants.js';

export function buildEmbed(options = {}) {
  const embed = new EmbedBuilder().setColor(EMBED_COLOR);

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.footer) embed.setFooter({ text: options.footer });
  if (options.timestamp) embed.setTimestamp();
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.author) embed.setAuthor(options.author);

  return embed;
}
