import { SlashCommandBuilder } from 'discord.js';
import { supabase } from './database/client.js';
import { buildEmbed } from './utils/embedBuilder.js';
import { logger } from './utils/logger.js';

const AUTHORIZED_ROLES = ['1412763165472591882', '1466940404220821504'];
const AUTHORIZED_GUILD = '1411865120891600906';
const CONVICTION_LOG_CHANNEL = '1491218158781202572';
const CONVICTION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName('convict')
  .setDescription('Convict a user and apply department restrictions.')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to convict.')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('charge')
      .setDescription('The charge or reason for conviction.')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('date')
      .setDescription('Date of conviction (e.g. 2025-04-07).')
      .setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  // Verify guild
  if (interaction.guildId !== AUTHORIZED_GUILD) {
    return interaction.editReply({
      embeds: [buildStatusEmbed('Access Denied', 'This command is not authorized for use in this server.')],
    });
  }

  // Verify user roles
  const hasRole = interaction.member.roles.cache.some(r => AUTHORIZED_ROLES.includes(r.id));
  if (!hasRole) {
    return interaction.editReply({
      embeds: [buildStatusEmbed('Access Denied', 'You do not have the required permissions to use this command.')],
    });
  }

  const targetUser = interaction.options.getUser('user');
  const charge = interaction.options.getString('charge');
  const date = interaction.options.getString('date');

  const convictionDate = new Date(date);
  if (isNaN(convictionDate.getTime())) {
    return interaction.editReply({
      embeds: [buildStatusEmbed('Invalid Date', 'The date provided is not valid. Please use the format YYYY-MM-DD.')],
    });
  }

  const restrictedUntil = new Date(convictionDate.getTime() + CONVICTION_DURATION_MS);

  // Fetch departments from Supabase
  const { data: departments, error: deptError } = await supabase
    .from('departments')
    .select('*')
    .eq('guild_id', AUTHORIZED_GUILD);

  if (deptError) {
    logger.error('CONVICT', 'Failed to fetch departments from Supabase', deptError);
    return interaction.editReply({
      embeds: [buildStatusEmbed('Database Error', 'Failed to retrieve department data. Please try again later.')],
    });
  }

  // Fetch member from Discord
  let targetMember = null;
  try {
    targetMember = await interaction.guild.members.fetch(targetUser.id);
  } catch {
    logger.warn('CONVICT', `User ${targetUser.id} could not be fetched — may not be in the server.`);
  }

  // Match member roles to department personnel_role_id
  const matchedDepartments = targetMember && departments?.length
    ? departments.filter(dept => {
        const roleId = String(dept.personnel_role_id); // ensure string type
        return targetMember.roles.cache.has(roleId);
      })
    : [];

  const logChannel = await interaction.guild.channels.fetch(CONVICTION_LOG_CHANNEL).catch(() => null);

  // Handle no matched departments
  if (!matchedDepartments.length) {
    const { error: insertError } = await supabase.from('convictions').insert({
      user_id: targetUser.id,
      charge,
      date: convictionDate.toISOString(),
      department: 'None',
      restricted_until: restrictedUntil.toISOString(),
    });

    if (insertError) logger.error('CONVICT', 'Failed to log conviction with no department', insertError);

    const embed = buildConvictionEmbed(targetUser, 'None', charge, convictionDate, restrictedUntil);

    if (logChannel) await logChannel.send({ embeds: [embed] }).catch(err =>
      logger.error('CONVICT', 'Failed to send to conviction log channel', err)
    );

    return interaction.editReply({
      embeds: [buildStatusEmbed(
        'Conviction Logged — No Department Matched',
        `Conviction recorded for **${targetUser.tag}**.\n**Charge:** ${charge}\nNo department restriction was applied. Ensure personnel_role_id in Supabase matches Discord role IDs.`
      )],
    });
  }

  // Handle matched departments
  for (const dept of matchedDepartments) {
    const { error: insertError } = await supabase.from('convictions').insert({
      user_id: targetUser.id,
      charge,
      date: convictionDate.toISOString(),
      department: dept.department_name,
      restricted_until: restrictedUntil.toISOString(),
    });

    if (insertError) logger.error('CONVICT', `Failed to insert conviction for ${dept.department_name}`, insertError);

    if (targetMember) {
      try {
        await targetMember.roles.add(String(dept.convicted_role_id));
      } catch (err) {
        logger.error('CONVICT', `Failed to assign convicted role in ${dept.department_name}`, err);
      }
    }

    const embed = buildConvictionEmbed(targetUser, dept.department_name, charge, convictionDate, restrictedUntil);

    if (logChannel) await logChannel.send({ embeds: [embed] }).catch(err =>
      logger.error('CONVICT', 'Failed to send to conviction log channel', err)
    );

    const staffChannelId = String(dept.staff_channel_id);
    const staffChannel = staffChannelId
      ? await interaction.guild.channels.fetch(staffChannelId).catch(() => null)
      : null;

    if (staffChannel) await staffChannel.send({ embeds: [embed] }).catch(err =>
      logger.error('CONVICT', `Failed to send to staff channel for ${dept.department_name}`, err)
    );

    scheduleRoleRemoval(interaction.guild, targetUser.id, dept, restrictedUntil);
  }

  return interaction.editReply({
    embeds: [buildStatusEmbed(
      'Conviction Processed',
      `**${targetUser.tag}** has been convicted.\n**Charge:** ${charge}\n**Restricted Until:** ${restrictedUntil.toDateString()}\n**Departments Affected:** ${matchedDepartments.map(d => d.department_name).join(', ')}`
    )],
  });
}

function buildStatusEmbed(title, description) {
  return buildEmbed({ title, description, footer: 'PRPC Department of Justice', timestamp: true });
}

function buildConvictionEmbed(user, department, charge, convictionDate, restrictedUntil) {
  return buildEmbed({
    title: 'Conviction Notice',
    fields: [
      { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
      { name: 'Department', value: department, inline: true },
      { name: 'Charge', value: charge },
      { name: 'Conviction Date', value: convictionDate.toDateString(), inline: true },
      { name: 'Restricted Until', value: restrictedUntil.toDateString(), inline: true },
    ],
    footer: 'PRPC Department of Justice',
    timestamp: true,
  });
}

export function scheduleRoleRemoval(guild, userId, dept, restrictedUntil) {
  const delay = restrictedUntil.getTime() - Date.now();
  if (delay <= 0) return;

  setTimeout(async () => {
    try {
      const member = await guild.members.fetch(userId);
      await member.roles.remove(String(dept.convicted_role_id));
    } catch {
      logger.warn('CONVICT', `Could not remove convicted role from ${userId} in ${dept.department_name}`);
    }
  }, delay);
}