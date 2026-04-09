import { buildEmbed } from '../utils/embedBuilder.js';
import { logger } from '../utils/logger.js';
import { runRolesync, resetSyncInterval, OWNER_ID } from '../utils/rolesync.js';

export const name = 'rolesync';

export async function execute(message) {
  if (message.author.id !== OWNER_ID) {
    return message.reply({
      embeds: [buildEmbed({
        title: 'Access Denied',
        description: 'You do not have the proper permission to run this command.',
        footer: 'PRPC Department of Justice',
        timestamp: true,
      })],
    }).catch(err => logger.error('ROLESYNC', 'Failed to send access denied reply', err));
  }

  await message.reply({
    embeds: [buildEmbed({
      title: 'Rolesync Initiated',
      description: 'Manual sync has been triggered. Check the sync log channel for live updates.',
      footer: 'PRPC Department of Justice',
      timestamp: true,
    })],
  }).catch(err => logger.error('ROLESYNC', 'Failed to send confirmation reply', err));

  logger.info('ROLESYNC', `Manual sync triggered via prefix by ${message.author.tag}`);
  resetSyncInterval(message.client);
  await runRolesync(message.client, message.author.id);
}