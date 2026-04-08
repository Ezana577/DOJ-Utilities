import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('restrict')
  .setDescription('Restrict a role across all channels and review them interactively.')
  .addRoleOption(option => option
    .setName('role')
    .setDescription('Role to restrict')
    .setRequired(true)
  );

export const execute = async (interaction) => {
  if (interaction.user.id !== '816820037527797780') {
    return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
  }

  const role = interaction.options.getRole('role');

  const allChannels = interaction.guild.channels.cache;

  await Promise.all(allChannels.map(async (c) => {
    try {
      await c.permissionOverwrites.edit(role, { ViewChannel: false });
    } catch (err) {
      logger.error('RESTRICT', `Failed to restrict ${role.name} in ${c.name}`, err);
    }
  }));

  await interaction.reply({ content: `Restriction completed for role **${role.name}**. Starting interactive review...`, ephemeral: true });

  const channelsArray = Array.from(allChannels.values());
  let currentIndex = 0;

  const askNext = async () => {
    if (currentIndex >= channelsArray.length) {
      return interaction.followUp({ content: 'You have gone through all restricted channels.', ephemeral: true });
    }

    const channel = channelsArray[currentIndex];

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('yes')
        .setLabel('Yes - keep restricted')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('no')
        .setLabel('No - unrestrict')
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.followUp({
      content: `Do you want **${channel.name}** to **stay restricted** for role **${role.name}**?`,
      components: [row],
      ephemeral: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000
    });

    collector.on('collect', async i => {
      if (i.user.id !== '816820037527797780') return;

      if (i.customId === 'no') {
        try {
          await channel.permissionOverwrites.edit(role, { ViewChannel: null });
        } catch (err) {
          logger.error('RESTRICT', `Failed to unrestrict ${role.name} in ${channel.name}`, err);
        }
      }

      collector.stop();
    });

    collector.on('end', async () => {
      currentIndex++;
      askNext();
    });
  };

  askNext();
};