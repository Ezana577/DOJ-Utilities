import { buildEmbed } from '../utils/embedBuilder.js';
import { logger } from '../utils/logger.js';

export const name = 'ping';
export const description = 'Returns bot latency and connection status.';

export async function execute(message) {
  const sent = await message.reply({ content: 'Measuring...' });
  const roundtrip = sent.createdTimestamp - message.createdTimestamp;
  const wsHeartbeat = message.client.ws.ping;

  logger.info('PING', `Guild: ${message.guildId} | User: ${message.author.tag} | RTT: ${roundtrip}ms | WS: ${wsHeartbeat}ms`);

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

  await sent.edit({ content: null, embeds: [embed] });
}