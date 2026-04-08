import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('restrict')
  .setDescription('Restrict a role across all channels and categories for review')
  .addRoleOption(option => 
    option.setName('role')
          .setDescription('Role to restrict')
          .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, client) {
  if (interaction.user.id !== '816820037527797780') {
    return interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
  }

  const role = interaction.options.getRole('role');
  const allChannels = interaction.guild.channels.cache;

  await interaction.reply({ content: `Restricting role **${role.name}** across all channels...`, ephemeral: true });

  for (const [_, channel] of allChannels) {
    try {
      await channel.permissionOverwrites.edit(role, { ViewChannel: false });
    } catch (err) {
      logger.error('RESTRICT', `Failed to restrict ${role.name} in ${channel.name}`, err);
    }
  }

  await interaction.editReply({ content: `Restriction completed for **${role.name}**.\nNow reviewing channels one by one.` });

  // Filter out categories/channels already processed
  const channelsArray = Array.from(allChannels.values());
  let index = 0;

  const nextChannel = async () => {
    if (index >= channelsArray.length) {
      return interaction.followUp({ content: `Finished reviewing all channels for **${role.name}**.`, ephemeral: true });
    }

    const channel = channelsArray[index];
    index++;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('yes')
        .setLabel('Yes (Keep Restricted)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('no')
        .setLabel('No (Unrestrict)')
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.followUp({ 
      content: `Do you want **${role.name}** to remain restricted in ${channel.name}?`, 
      components: [row],
      ephemeral: true
    });

    const collector = msg.createMessageComponentCollector({ time: 120000, max: 1 });

    collector.on('collect', async i => {
      if (i.user.id !== '816820037527797780') return;

      if (i.customId === 'no') {
        try {
          await channel.permissionOverwrites.edit(role, { ViewChannel: null });
        } catch (err) {
          logger.error('RESTRICT', `Failed to unrestrict ${role.name} in ${channel.name}`, err);
        }
      }

      
      await i.deferUpdate();

      nextChannel(); 
    });

    collector.on('end', collected => {
      if (collected.size === 0) nextChannel(); 
    });
  };

  nextChannel();
}