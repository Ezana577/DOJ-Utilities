import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('restrict')
  .setDescription('Restrict a role from viewing all channels.')
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('Role to restrict')
      .setRequired(true)
  );

export async function execute(interaction) {
  const allowedUserId = '816820037527797780';
  if (interaction.user.id !== allowedUserId) {
    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  const role = interaction.options.getRole('role');
  const guild = interaction.guild;

  await interaction.reply({ content: `Restricting ${role.name}...`, ephemeral: true });

  let count = 0;

  for (const channel of guild.channels.cache.values()) {
    try {
      await channel.permissionOverwrites.edit(role.id, {
        ViewChannel: false,
        SendMessages: false,
        Connect: false,
      });
      count++;
    } catch (err) {
      logger.error('RESTRICT', `Failed in ${channel.name}`, err);
    }
  }

  await interaction.editReply({
    content: `Restriction applied to ${role.name} in ${count} channels.`,
  });

  logger.info('RESTRICT', `Role ${role.name} restricted in ${guild.name}`);
}