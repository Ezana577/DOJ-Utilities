import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { supabase } from '../database/client.js';
import { buildEmbed } from '../utils/embedBuilder.js';
import { logger } from '../utils/logger.js';

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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.guildId !== AUTHORIZED_GUILD) {
    return interaction.editReply({
      embeds: [buildStatusEmbed('Unauthorized Server', 'This command is not authorized for use in this server.')],
    });
  }

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
      embeds: [buildStatusEmbed('Invalid Date', 'The date provided is not valid. Please use the format `YYYY-MM-DD`.')],
    });
  }

  const restrictedUntil = new Date(convictionDate.getTime() + CONVICTION_DURATION_MS);

  // ── DEBUG: Log environment variable presence (fixed formatting) ───────────
  logger.info('CONVICT', `[ENV] SUPABASE_URL present: ${!!process.env.SUPABASE_URL}`);
  logger.info('CONVICT', `[ENV] SUPABASE_ANON_KEY present: ${!!process.env.SUPABASE_ANON_KEY}`);
  logger.info('CONVICT', `[ENV] SUPABASE_SERVICE_ROLE_KEY present: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);

  // ── Fetch departments ──────────────────────────────────────────────────────
  logger.info('CONVICT', `[DB] Query: supabase.from("departments").select("*").eq("guild_id", "${AUTHORIZED_GUILD}")`);
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

  // ── 🆕 RAW DUMP: Log exactly what Supabase returned (all columns) ───────────
  logger.info('CONVICT', '─────────────────────────────────────────');
  logger.info('CONVICT', `[DB] Raw departments data returned by query (length: ${departments?.length ?? 0}):`);
  if (departments && departments.length > 0) {
    departments.forEach((dept, index) => {
      logger.info('CONVICT', `[DB] Row ${index + 1}: ${JSON.stringify(dept)}`);
    });
  } else {
    logger.warn('CONVICT', '[DB] Query returned an empty array.');
  }

  // Additional diagnostic: fetch all departments (no filter) to see what's in the table
  const { data: allDepts, error: allDeptsError } = await supabase
    .from('departments')
    .select('*')
    .limit(100);

  if (allDeptsError) {
    logger.error('CONVICT', '[DB] Failed to fetch all departments:', allDeptsError);
  } else {
    logger.info('CONVICT', `[DB] Total rows in departments table (unfiltered): ${allDepts?.length ?? 0}`);
    if (allDepts && allDepts.length > 0) {
      logger.info('CONVICT', '[DB] All rows in table (guild_id + department_name only):');
      allDepts.forEach((row, i) => {
        logger.info('CONVICT', `[DB]   ${i+1}. guild_id="${row.guild_id}" (type: ${typeof row.guild_id}) → dept="${row.department_name}"`);
      });
    }
  }

  // ── 🆕 Type & value comparison for guild_id ─────────────────────────────────
  logger.info('CONVICT', '─────────────────────────────────────────');
  logger.info('CONVICT', `[GUILD CHECK] AUTHORIZED_GUILD value: "${AUTHORIZED_GUILD}" (type: ${typeof AUTHORIZED_GUILD})`);
  logger.info('CONVICT', `[GUILD CHECK] interaction.guildId value: "${interaction.guildId}" (type: ${typeof interaction.guildId})`);
  logger.info('CONVICT', `[GUILD CHECK] Do they match? ${interaction.guildId === AUTHORIZED_GUILD}`);

  // ── Fetch target member (with explicit confirmation) ───────────────────────
  let targetMember = null;
  try {
    targetMember = await interaction.guild.members.fetch(targetUser.id);
    logger.info('CONVICT', `[MEMBER] Successfully fetched target member: ${targetUser.tag} (${targetUser.id})`);
  } catch (err) {
    logger.warn('CONVICT', `[MEMBER] Failed to fetch target member ${targetUser.id} (${targetUser.tag}): ${err.message}`);
    logger.warn('CONVICT', '[MEMBER] This user may not be in the guild or the bot lacks permissions.');
  }

  // ── DEBUG: Discord member role data ───────────────────────────────────────
  if (targetMember) {
    const roleIds = targetMember.roles.cache.map(r => r.id);
    const roleNames = targetMember.roles.cache.map(r => `${r.name}(${r.id})`).join(', ');
    logger.info('CONVICT', `[MEMBER] Target roles count: ${roleIds.length}`);
    logger.info('CONVICT', `[MEMBER] Role IDs (array): [${roleIds.join(', ')}]`);
    logger.info('CONVICT', `[MEMBER] Roles (name + id): ${roleNames}`);
  } else {
    logger.warn('CONVICT', `[MEMBER] Cannot match departments — target member is not in the guild or fetch failed.`);
  }

  // ── 🆕 Verbose matching with explicit string trimming and type coercion ────
  logger.info('CONVICT', '─────────────────────────────────────────');
  logger.info('CONVICT', '[MATCH] Beginning department role match check...');

  const matchedDepartments = [];

  if (targetMember && departments?.length) {
    for (const dept of departments) {
      const deptGuildId = String(dept.guild_id).trim();
      const deptRoleId = String(dept.personnel_role_id).trim();

      // Check guild match
      const guildMatch = deptGuildId === AUTHORIZED_GUILD;
      logger.info('CONVICT', `[MATCH] Department "${dept.department_name}" (ID: ${dept.id || 'N/A'})`);
      logger.info('CONVICT', `[MATCH]   guild_id from DB: "${deptGuildId}" (type: ${typeof dept.guild_id})`);
      logger.info('CONVICT', `[MATCH]   AUTHORIZED_GUILD:  "${AUTHORIZED_GUILD}" (type: string)`);
      logger.info('CONVICT', `[MATCH]   Guild match? ${guildMatch ? '✅ YES' : '❌ NO'}`);

      // Check role match
      const userHasRole = targetMember.roles.cache.has(deptRoleId);
      logger.info('CONVICT', `[MATCH]   personnel_role_id from DB: "${deptRoleId}"`);
      logger.info('CONVICT', `[MATCH]   User has this role? ${userHasRole ? '✅ YES' : '❌ NO'}`);

      // Additional debug: list all user role IDs for direct visual comparison
      if (!userHasRole) {
        const userRoleIds = targetMember.roles.cache.map(r => r.id);
        logger.info('CONVICT', `[MATCH]   User's role IDs: [${userRoleIds.join(', ')}]`);
      }

      if (guildMatch && userHasRole) {
        matchedDepartments.push(dept);
        logger.info('CONVICT', `[MATCH]   ✅ Department MATCHED and added.`);
      } else {
        logger.info('CONVICT', `[MATCH]   ❌ Department NOT matched.`);
      }
      logger.info('CONVICT', '---');
    }
  } else {
    if (!targetMember) logger.warn('CONVICT', '[MATCH] Skipped — target member not fetched.');
    if (!departments?.length) logger.warn('CONVICT', '[MATCH] Skipped — no departments returned from query.');
  }

  logger.info('CONVICT', `[MATCH] Final matched departments: ${matchedDepartments.length > 0 ? matchedDepartments.map(d => d.department_name).join(', ') : 'None'}`);
  logger.info('CONVICT', '─────────────────────────────────────────');

  const logChannel = await interaction.guild.channels.fetch(CONVICTION_LOG_CHANNEL).catch(() => null);

  // ── No department matched ──────────────────────────────────────────────────
  if (!matchedDepartments.length) {
    logger.warn('CONVICT', '[FALLBACK] No department matched. Possible reasons:');
    logger.warn('CONVICT', '[FALLBACK]   - Target member lacks any personnel_role_id listed in departments.');
    logger.warn('CONVICT', '[FALLBACK]   - Guild ID mismatch (should not happen due to earlier check).');
    logger.warn('CONVICT', '[FALLBACK]   - RLS blocking query (check service role key).');
    logger.warn('CONVICT', '[FALLBACK]   - Departments table empty for this guild.');

    const convictionPayload = {
      user_id: targetUser.id,
      charge,
      date: convictionDate.toISOString(),
      department: 'None',
      restricted_until: restrictedUntil.toISOString(),
    };
    logger.info('CONVICT', `[INSERT] Payload for no-department conviction:`, convictionPayload);

    const { error: insertError } = await supabase.from('convictions').insert(convictionPayload);

    if (insertError) {
      logger.error('CONVICT', 'Failed to log conviction with no department', insertError);
      if (insertError.message.includes('row-level security')) {
        logger.error('CONVICT', 'RLS violation detected. Use service role key for inserts.');
      }
    }

    const embed = buildConvictionEmbed(targetUser, interaction.user, 'None', charge, convictionDate, restrictedUntil);

    if (logChannel) {
      await logChannel.send({ content: `<@${targetUser.id}>`, embeds: [embed] })
        .catch(err => logger.error('CONVICT', 'Failed to send to conviction log channel', err));
    }

    logger.info('CONVICT', `${targetUser.tag} convicted (no department matched) by ${interaction.user.tag} | Charge: ${charge}`);

    return interaction.editReply({
      embeds: [buildStatusEmbed(
        'Conviction Recorded',
        `The conviction for <@${targetUser.id}> has been successfully logged.\n\n**Charge:** ${charge}\n**Restriction Period:** ${convictionDate.toDateString()} — ${restrictedUntil.toDateString()}\n\nNo active department affiliation was found for this user. The record has been filed without departmental restrictions.`
      )],
    });
  }

  // ── Matched departments ────────────────────────────────────────────────────
  for (const dept of matchedDepartments) {
    const convictionPayload = {
      user_id: targetUser.id,
      charge,
      date: convictionDate.toISOString(),
      department: dept.department_name,
      restricted_until: restrictedUntil.toISOString(),
    };
    logger.info('CONVICT', `[INSERT] Payload for department "${dept.department_name}":`, convictionPayload);

    const { error: insertError } = await supabase.from('convictions').insert(convictionPayload);

    if (insertError) {
      logger.error('CONVICT', `Failed to log conviction for ${dept.department_name}`, insertError);
      if (insertError.message.includes('row-level security')) {
        logger.error('CONVICT', 'RLS violation detected. Use service role key for inserts.');
      }
    }

    if (targetMember) {
      try {
        await targetMember.roles.add(String(dept.convicted_role_id));
        logger.info('CONVICT', `[ROLE] Assigned convicted role ${dept.convicted_role_id} in ${dept.department_name} to ${targetUser.id}`);
      } catch (err) {
        logger.error('CONVICT', `[ROLE] Failed to assign convicted role in ${dept.department_name}`, err);
      }
    }

    const embed = buildConvictionEmbed(targetUser, interaction.user, dept.department_name, charge, convictionDate, restrictedUntil);

    if (logChannel) {
      await logChannel.send({ content: `<@${targetUser.id}>`, embeds: [embed] })
        .catch(err => logger.error('CONVICT', 'Failed to send to conviction log channel', err));
    }

    const staffChannel = await interaction.guild.channels.fetch(String(dept.staff_channel_id)).catch(() => null);
    if (staffChannel) {
      await staffChannel.send({ content: `<@${targetUser.id}>`, embeds: [embed] })
        .catch(err => logger.error('CONVICT', `Failed to send to staff channel for ${dept.department_name}`, err));
    }

    scheduleRoleRemoval(interaction.guild, targetUser.id, dept, restrictedUntil);
  }

  logger.info('CONVICT', `${targetUser.tag} convicted by ${interaction.user.tag} | Charge: ${charge}`);

  return interaction.editReply({
    embeds: [buildStatusEmbed(
      'Conviction Processed',
      `The conviction for <@${targetUser.id}> has been successfully processed.\n\n**Charge:** ${charge}\n**Restriction Period:** ${convictionDate.toDateString()} — ${restrictedUntil.toDateString()}\n**Departments Affected:** ${matchedDepartments.map(d => d.department_name).join(', ')}`
    )],
  });
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
      { name: 'Conviction Logged By', value: `<@${executor.id}>`, inline: true },
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
      logger.info('CONVICT', `[ROLE] Removed convicted role in ${dept.department_name} from ${userId}`);
    } catch {
      logger.warn('CONVICT', `[ROLE] Could not remove convicted role from ${userId} in ${dept.department_name} — user may have left the server.`);
    }
  }, delay);
}