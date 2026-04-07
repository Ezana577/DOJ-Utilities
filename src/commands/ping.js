import { SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../utils/embedBuilder.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Returns bot latency and connection status.');

export async function execute(interaction) {
  const sent = await interaction.reply({ content: 'Measuring...', fetchReply: true, ephemeral: true });

  const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
  const wsHeartbeat = interaction.client.ws.ping;

  logger.info('PING', `Guild: ${interaction.guildId} | User: ${interaction.user.tag} | RTT: ${roundtrip}ms | WS: ${wsHeartbeat}ms`);

  const embed = buildEmbed({
    title: 'Connection Status',
    fields: [
      { name: 'Roundtrip Latency', value: `${roundtrip}ms`, inline: true },
      { name: 'WebSocket Heartbeat', value: `${wsHeartbeat}ms`, inline: true },
      { name: 'Status', value: wsHeartbeat < 200 ? 'Operational' : wsHeartbeat < 500 ? 'Degraded' : 'High Latency', inline: true },
    ],
    footer: 'PRPC Department of Justice',
    timestamp: true,
  });

  await interaction.editReply({ content: null, embeds: [embed] });
}