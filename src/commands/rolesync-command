import { SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../utils/embedBuilder.js';
import { logger } from '../utils/logger.js';
import { runRolesync, resetSyncInterval, OWNER_ID } from '../utils/rolesync.js';

export const data = new SlashCommandBuilder()
  .setName('rolesync')
  .setDescription('Manually trigger a DOJ role sync across all department servers.');

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      embeds: [buildEmbed({
        title: 'Access Denied',
        description: 'You do not have the proper permission to run this command.',
        footer: 'PRPC Department of Justice',
        timestamp: true,
      })],
      ephemeral: true,
    }).catch(err => logger.error('ROLESYNC', 'Failed to send access denied reply', err));
  }

  await interaction.reply({
    embeds: [buildEmbed({
      title: 'Rolesync Initiated',
      description: 'Manual sync has been triggered. Check the sync log channel for live updates.',
      footer: 'PRPC Department of Justice',
      timestamp: true,
    })],
    ephemeral: true,
  }).catch(err => logger.error('ROLESYNC', 'Failed to send confirmation reply', err));

  logger.info('ROLESYNC', `Manual sync triggered via slash command by ${interaction.user.tag}`);

  resetSyncInterval(interaction.client);
  await runRolesync(interaction.client, interaction.user.id);
}