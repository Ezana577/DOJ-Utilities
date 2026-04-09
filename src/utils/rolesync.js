import { buildEmbed } from './embedBuilder.js';
import { logger } from './logger.js';
import { supabase } from '../database/client.js';

const DOJ_GUILD_ID = '1411865120891600906';
const SYNC_LOG_CHANNEL = '1491642155234496592';

const OWNER_ID = '816820037527797780';

const DEPARTMENT_MAP = [
  { name: 'S.W.A.T', dojRoleId: '1466924789191938089' },
  { name: 'FBI',     dojRoleId: '1460762360657740053' },
  { name: 'C.A.T',   dojRoleId: '1481297780541624340' },
  { name: 'USMS',    dojRoleId: '1460451213173723197' },
  { name: 'USAR',    dojRoleId: '1491641233494380654' },
  { name: 'USSS',    dojRoleId: '1490450626809823480' },
];

export { OWNER_ID, DEPARTMENT_MAP };

let syncInterval = null;
let isSyncing = false;

export function startSyncInterval(client) {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    if (isSyncing) {
      logger.warn('ROLESYNC', 'Sync already in progress — skipping this interval tick.');
      return;
    }
    await runRolesync(client, null);
  }, 15 * 60 * 1000);

  logger.info('ROLESYNC', 'Automatic 15-minute sync interval started.');
}

export function resetSyncInterval(client) {
  logger.info('ROLESYNC', 'Resetting sync interval after manual trigger.');
  startSyncInterval(client);
}

export async function runRolesync(client, triggeredBy) {
  if (isSyncing) {
    logger.warn('ROLESYNC', 'Sync already running — blocked duplicate call.');
    return;
  }

  isSyncing = true;
  logger.info('ROLESYNC', `Sync started. Triggered by: ${triggeredBy ?? 'automatic interval'}`);

  try {
    let dojGuild;
    try {
      dojGuild = await client.guilds.fetch(DOJ_GUILD_ID);
      await dojGuild.members.fetch();
    } catch (err) {
      logger.error('ROLESYNC', 'Failed to fetch DOJ guild or members.', err);
      return;
    }

    const logChannel = await dojGuild.channels.fetch(SYNC_LOG_CHANNEL).catch(() => null);
    if (!logChannel) {
      logger.warn('ROLESYNC', `Could not fetch sync log channel: ${SYNC_LOG_CHANNEL}`);
    }

    if (logChannel) {
      await logChannel.send({
        embeds: [buildEmbed({
          title: 'Rolesync Starting',
          description: `The bot is checking all department servers for DOJ role consistency.\n\n**Triggered by:** ${triggeredBy ? `<@${triggeredBy}>` : 'Automatic 15-minute interval'}`,
          footer: 'PRPC Department of Justice',
          timestamp: true,
        })],
      }).catch(err => logger.error('ROLESYNC', 'Failed to send sync start embed.', err));
    }

    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('*');

    if (deptError) {
      logger.error('ROLESYNC', 'Failed to fetch departments from Supabase.', deptError);
      return;
    }

    logger.info('ROLESYNC', `Departments loaded: ${departments?.length ?? 0}`);

    let totalAdded = 0;
    let totalRemoved = 0;

    for (const deptConfig of DEPARTMENT_MAP) {
      const deptRow = departments?.find(d => d.department_name === deptConfig.name);

      if (!deptRow) {
        logger.warn('ROLESYNC', `No Supabase row found for department "${deptConfig.name}" — skipping.`);
        continue;
      }

      const deptGuildId = String(deptRow.guild_id).trim();
      const personnelRoleId = String(deptRow.personnel_role_id).trim();
      const dojRoleId = deptConfig.dojRoleId;

      logger.info('ROLESYNC', `Processing "${deptConfig.name}" | guild: ${deptGuildId} | personnel_role: ${personnelRoleId} | doj_role: ${dojRoleId}`);

      let deptGuild;
      try {
        deptGuild = await client.guilds.fetch(deptGuildId);
        await deptGuild.members.fetch();
      } catch (err) {
        logger.warn('ROLESYNC', `Could not fetch guild or members for "${deptConfig.name}" (${deptGuildId}): ${err.message}`);
        continue;
      }

      const deptMembersWithRole = deptGuild.members.cache.filter(m =>
        !m.user.bot && m.roles.cache.has(personnelRoleId)
      );

      const deptMemberIds = new Set(deptMembersWithRole.map(m => m.id));

      logger.info('ROLESYNC', `"${deptConfig.name}" has ${deptMembersWithRole.size} member(s) with the personnel role.`);

      for (const dojMember of dojGuild.members.cache.values()) {
        if (dojMember.user.bot) continue;

        const shouldHaveRole = deptMemberIds.has(dojMember.id);
        const hasRole = dojMember.roles.cache.has(dojRoleId);

        if (shouldHaveRole && !hasRole) {
          try {
            await dojMember.roles.add(dojRoleId);
            totalAdded++;
            logger.info('ROLESYNC', `[ADD] <@${dojMember.id}> → <@&${dojRoleId}> (${deptConfig.name})`);

            if (logChannel) {
              await logChannel.send({
                embeds: [buildEmbed({
                  title: 'Role Added',
                  fields: [
                    { name: 'User', value: `<@${dojMember.id}>`, inline: true },
                    { name: 'Role', value: `<@&${dojRoleId}>`, inline: true },
                    { name: 'Action', value: 'Added', inline: true },
                    { name: 'Department', value: deptConfig.name, inline: true },
                  ],
                  footer: 'PRPC Department of Justice',
                  timestamp: true,
                })],
              }).catch(() => {});
            }
          } catch (err) {
            logger.error('ROLESYNC', `Failed to add role ${dojRoleId} to ${dojMember.id}.`, err);
          }
        }

        if (!shouldHaveRole && hasRole) {
          try {
            await dojMember.roles.remove(dojRoleId);
            totalRemoved++;
            logger.info('ROLESYNC', `[REMOVE] <@${dojMember.id}> → <@&${dojRoleId}> (${deptConfig.name})`);

            if (logChannel) {
              await logChannel.send({
                embeds: [buildEmbed({
                  title: 'Role Removed',
                  fields: [
                    { name: 'User', value: `<@${dojMember.id}>`, inline: true },
                    { name: 'Role', value: `<@&${dojRoleId}>`, inline: true },
                    { name: 'Action', value: 'Removed', inline: true },
                    { name: 'Department', value: deptConfig.name, inline: true },
                  ],
                  footer: 'PRPC Department of Justice',
                  timestamp: true,
                })],
              }).catch(() => {});
            }
          } catch (err) {
            logger.error('ROLESYNC', `Failed to remove role ${dojRoleId} from ${dojMember.id}.`, err);
          }
        }
      }
    }

    if (logChannel) {
      await logChannel.send({
        embeds: [buildEmbed({
          title: 'Rolesync Complete',
          fields: [
            { name: 'Roles Added', value: `${totalAdded}`, inline: true },
            { name: 'Roles Removed', value: `${totalRemoved}`, inline: true },
            { name: 'Triggered By', value: triggeredBy ? `<@${triggeredBy}>` : 'Automatic interval', inline: true },
          ],
          footer: 'PRPC Department of Justice',
          timestamp: true,
        })],
      }).catch(err => logger.error('ROLESYNC', 'Failed to send sync complete embed.', err));
    }

    logger.info('ROLESYNC', `Sync complete. Added: ${totalAdded} | Removed: ${totalRemoved}`);
  } catch (error) {
    logger.error('ROLESYNC', 'Unhandled error during sync.', error);
  } finally {
    isSyncing = false;
  }
}