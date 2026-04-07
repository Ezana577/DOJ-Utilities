import { Events, ActivityType } from 'discord.js';
import { logger } from '../utils/logger.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  logger.info('READY', `Logged in as ${client.user.tag}`);
  logger.info('READY', `Active in ${client.guilds.cache.size} guild(s)`);

  client.user.setPresence({
    activities: [{ name: 'Department of Justice', type: ActivityType.Watching }],
    status: 'online',
  });
}
