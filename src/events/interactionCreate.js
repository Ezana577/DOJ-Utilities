import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { buildEmbed } from '../utils/embedBuilder.js';

export const name = Events.InteractionCreate;

export async function execute(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    logger.warn('INTERACTION', `No handler found for command: ${interaction.commandName}`);
    return;
  }

  try {
    logger.info('INTERACTION', `Command /${interaction.commandName} used by ${interaction.user.tag} in guild ${interaction.guildId}`);
    await command.execute(interaction);
  } catch (err) {
    logger.error('INTERACTION', `Error executing /${interaction.commandName}`, err);

    const errorEmbed = buildEmbed({
      title: 'An Error Occurred',
      description: 'This command encountered an unexpected error. The issue has been logged.',
      footer: 'PRPC Department of Justice',
      timestamp: true,
    });

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
    }
  }
}
