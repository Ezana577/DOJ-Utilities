import { SlashCommandBuilder } from 'discord.js';
import { supabase } from '../database/client.js';
import { buildEmbed } from '../utils/embedBuilder.js';
import { logger } from '../utils/logger.js';

const AUTHORIZED_ROLES = ['1412763165472591882', '1466940404220821504'];
const DOJ_GUILD_ID = '1411865120891600906';
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
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    logger.error('CONVICT', 'Failed to defer reply.', err);
    return;
  }

  if (interaction.guildId !== DOJ_GUILD_ID) {
    return interaction.editReply({
      embeds: [buildStatusEmbed('Access Denied', 'This command is not authorized for use in this server.')],
    }).catch(() => {});
  }

  const hasRole = interaction.member.roles.cache.some(r => AUTHORIZED_ROLES.includes(r.id));
  if (!hasRole) {
    return interaction.editReply({
      embeds: [buildStatusEmbed('Access Denied', 'You do not have the required permissions to use this command.')],
    }).catch(() => {});
  }

  const targetUser = interaction.options.getUser('user');
  const charge = interaction.options.getString('charge');
  const date = interaction.options.getString('date');

  const convictionDate = new Date(date);
  if (isNaN(convictionDate.getTime())) {
    return interaction.editReply({
      embeds: [buildStatusEmbed('Invalid Date', 'The date provided is not valid. Please use the format YYYY-MM-DD.')],
    }).catch(() => {});
  }

  const restrictedUntil = new Date(convictionDate.getTime() + CONVICTION_DURATION_MS);

  logger.info('CONVICT', `Initiated by ${interaction.user.tag} | Target: ${targetUser.tag} | Charge: ${charge}`);

  // Fetch ALL departments — each row has its own guild_id (department server)
  const { data: departments, error: deptError } = await supabase
    .from('departments')
    .select('*');

  if (deptError) {
    logger.error('CONVICT', '[DB] Failed to fetch departments.', deptError);
    return interaction.editReply({
      embeds: [buildStatusEmbed('Database Error', 'Failed to retrieve department data. Please try again later.')],
    }).catch(() => {});
  }

  logger.info('CONVICT', `[DB] Total departments in table: ${departments?.length ?? 0}`);
  departments?.forEach((d, i) => {
    logger.info('CONVICT', `[DB] Row ${i + 1}: dept="${d.department_name}" | guild_id="${d.guild_id}" | personnel_role_id="${d.personnel_role_id}" | convicted_role_id="${d.convicted_role_id}"`);
  });

  if (!departments?.length) {
    logger.warn('CONVICT', '[DB] No departments found in table. Check Supabase data and RLS policies.');
  }

  // For each department, check if the user is in that department's server
  const matchedDepartments = [];

  for (const dept of (departments ?? [])) {
    const deptGuildId = String(dept.guild_id).trim();
    const personnelRoleId = String(dept.personnel_role_id).trim();

    logger.info('CONVICT', `[MATCH] Checking dept "${dept.department_name}" | server: ${deptGuildId} | personnel_role: ${personnelRoleId}`);

    let deptGuild = null;
    try {
      deptGuild = await interaction.client.guilds.fetch(deptGuildId);
    } catch {
      logger.warn('CONVICT', `[MATCH] Bot is not in guild ${deptGuildId} for dept "${dept.department_name}" — skipping.`);
      continue;
    }

    let deptMember = null;
    try {
      deptMember = await deptGuild.members.fetch(targetUser.id);
    } catch {
      logger.info('CONVICT', `[MATCH] User ${targetUser.tag} is not in guild ${deptGuildId} (${dept.department_name}) — skipping.`);
      continue;
    }

    const hasPersonnelRole = deptMember.roles.cache.has(personnelRoleId);
    logger.info('CONVICT', `[MATCH] User in "${dept.department_name}" server: yes | has personnel role ${personnelRoleId}: ${hasPersonnelRole}`);
    logger.info('CONVICT', `[MATCH] User roles in that server: [${[...deptMember.roles.cache.keys()].join(', ')}]`);

    if (hasPersonnelRole) {
      matchedDepartments.push({ dept, deptGuild, deptMember });
      logger.info('CONVICT', `[MATCH] Matched: ${dept.department_name}`);
    }
  }

  logger.info('CONVICT', `[MATCH] Final matches: ${matchedDepartments.length ? matchedDepartments.map(m => m.dept.department_name).join(', ') : 'None'}`);

  const logChannel = await interaction.guild.channels.fetch(CONVICTION_LOG_CHANNEL).catch(() => {
    logger.warn('CONVICT', `[CHANNEL] Could not fetch conviction log channel: ${CONVICTION_LOG_CHANNEL}`);
    return null;
  });

  // No department matched
  if (!matchedDepartments.length) {
    const { error: insertError } = await supabase.from('convictions').insert({
      user_id: targetUser.id,
      charge,
      date: convictionDate.toISOString(),
      department: 'None',
      restricted_until: restrictedUntil.toISOString(),
    });

    if (insertError) {
      logger.error('CONVICT', '[INSERT] Failed to insert conviction (no dept).', insertError);
    }

    const embed = buildConvictionEmbed(targetUser, interaction.user, 'None', charge, convictionDate, restrictedUntil);
    if (logChannel) {
      await logChannel.send({ embeds: [embed] }).catch(err =>
        logger.error('CONVICT', '[CHANNEL] Failed to send to log channel.', err)
      );
    }

    logger.info('CONVICT', `[DONE] ${targetUser.tag} convicted with no matched department.`);

    return interaction.editReply({
      embeds: [buildStatusEmbed(
        'Conviction Recorded',
        `Conviction filed for <@${targetUser.id}>.\n\n**Charge:** ${charge}\n**Restriction Period:** ${convictionDate.toDateString()} — ${restrictedUntil.toDateString()}\n\nNo active department affiliation was found for this user across any registered department server.`
      )],
    }).catch(() => {});
  }

  // Process each matched department
  for (const { dept, deptGuild, deptMember } of matchedDepartments) {
    const { error: insertError } = await supabase.from('convictions').insert({
      user_id: targetUser.id,
      charge,
      date: convictionDate.toISOString(),
      department: dept.department_name,
      restricted_until: restrictedUntil.toISOString(),
    });

    if (insertError) {
      logger.error('CONVICT', `[INSERT] Failed for ${dept.department_name}.`, insertError);
    }

    try {
      await deptMember.roles.add(String(dept.convicted_role_id));
      logger.info('CONVICT', `[ROLE] Convicted role assigned in "${dept.department_name}" (${deptGuild.id}) to ${targetUser.id}`);
    } catch (err) {
      logger.error('CONVICT', `[ROLE] Failed to assign convicted role in "${dept.department_name}".`, err);
    }

    const embed = buildConvictionEmbed(targetUser, interaction.user, dept.department_name, charge, convictionDate, restrictedUntil);

    if (logChannel) {
      await logChannel.send({ embeds: [embed] }).catch(err =>
        logger.error('CONVICT', '[CHANNEL] Failed to send to DOJ log channel.', err)
      );
    }

    const staffChannelId = String(dept.staff_channel_id ?? '').trim();
    if (staffChannelId) {
      const staffChannel = await deptGuild.channels.fetch(staffChannelId).catch(() => {
        logger.warn('CONVICT', `[CHANNEL] Could not fetch staff channel ${staffChannelId} in "${dept.department_name}".`);
        return null;
      });
      if (staffChannel) {
        await staffChannel.send({ embeds: [embed] }).catch(err =>
          logger.error('CONVICT', `[CHANNEL] Failed to send to staff channel in "${dept.department_name}".`, err)
        );
      }
    }

    scheduleRoleRemoval(deptGuild, targetUser.id, dept, restrictedUntil);
  }

  logger.info('CONVICT', `[DONE] ${targetUser.tag} convicted by ${interaction.user.tag} | Departments: ${matchedDepartments.map(m => m.dept.department_name).join(', ')}`);

  return interaction.editReply({
    embeds: [buildStatusEmbed(
      'Conviction Processed',
      `<@${targetUser.id}> has been convicted and department restrictions have been applied.\n\n**Charge:** ${charge}\n**Restricted Until:** ${restrictedUntil.toDateString()}\n**Departments Affected:** ${matchedDepartments.map(m => m.dept.department_name).join(', ')}`
    )],
  }).catch(() => {});
}

function buildStatusEmbed(title, description) {
  return buildEmbed({ title, description, footer: 'PRPC Department of Justice', timestamp: true });
}

function buildConvictionEmbed(user, executor, department, charge, convictionDate, restrictedUntil) {
  return buildEmbed({
    title: 'Conviction Notice',
    fields: [
      { name: 'Convicted User', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Department', value: department, inline: true },
      { name: 'Charge', value: charge },
      { name: 'Conviction Date', value: convictionDate.toDateString(), inline: true },
      { name: 'Restricted Until', value: restrictedUntil.toDateString(), inline: true },
      { name: 'Logged By', value: `<@${executor.id}>`, inline: true },
    ],
    footer: 'PRPC Department of Justice',
    timestamp: true,
  });
}

export function scheduleRoleRemoval(deptGuild, userId, dept, restrictedUntil) {
  const delay = restrictedUntil.getTime() - Date.now();
  if (delay <= 0) {
    logger.warn('CONVICT', `[ROLE] Removal delay is 0 or negative for ${userId} — skipping timer.`);
    return;
  }

  logger.info('CONVICT', `[ROLE] Removal scheduled for ${userId} in "${dept.department_name}" in ${Math.round(delay / 1000 / 60)} minutes.`);

  setTimeout(async () => {
    try {
      const member = await deptGuild.members.fetch(userId);
      await member.roles.remove(String(dept.convicted_role_id));
      logger.info('CONVICT', `[ROLE] Convicted role removed from ${userId} in "${dept.department_name}".`);
    } catch {
      logger.warn('CONVICT', `[ROLE] Could not remove role from ${userId} in "${dept.department_name}" — user may have left.`);
    }
  }, delay);
}