import { createClient } from '@supabase/supabase-js';
import { logger } from './logger.js';
import { scheduleRoleRemoval } from '../commands/convict.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const AUTHORIZED_GUILD = '1411865120891600906';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export async function runConvictionRecovery(client) {
  const guild = await client.guilds.fetch(AUTHORIZED_GUILD).catch(() => null);
  if (!guild) {
    logger.error('SCHEDULER', 'Failed to fetch guild for conviction recovery.');
    return;
  }

  const { data: departments, error: deptError } = await supabase
    .from('departments')
    .select('*')
    .eq('guild_id', AUTHORIZED_GUILD);

  if (deptError || !departments?.length) {
    logger.error('SCHEDULER', 'Failed to fetch departments during recovery.', deptError);
    return;
  }

  const { data: convictions, error: convError } = await supabase
    .from('convictions')
    .select('*');

  if (convError || !convictions?.length) {
    logger.info('SCHEDULER', 'No convictions found during recovery.');
    return;
  }

  const now = new Date();

  for (const conviction of convictions) {
    if (conviction.department === 'None') continue;

    const dept = departments.find(d => d.department_name === conviction.department);
    if (!dept) continue;

    const restrictedUntil = new Date(conviction.restricted_until);

    let member = null;
    try {
      member = await guild.members.fetch(conviction.user_id);
    } catch {
      logger.warn('SCHEDULER', `User ${conviction.user_id} not in server, skipping.`);
      continue;
    }

    const hasConvictedRole = member.roles.cache.has(dept.convicted_role_id);

    if (restrictedUntil > now) {
      if (!hasConvictedRole) {
        try {
          await member.roles.add(dept.convicted_role_id);
          logger.info('SCHEDULER', `Re-applied convicted role to ${conviction.user_id} in ${dept.department_name}`);
        } catch (err) {
          logger.error('SCHEDULER', `Failed to re-apply convicted role to ${conviction.user_id}`, err);
        }
      }
      scheduleRoleRemoval(guild, conviction.user_id, dept, restrictedUntil);
    } else {
      if (hasConvictedRole) {
        try {
          await member.roles.remove(dept.convicted_role_id);
          logger.info('SCHEDULER', `Removed expired convicted role from ${conviction.user_id} in ${dept.department_name}`);
        } catch (err) {
          logger.error('SCHEDULER', `Failed to remove expired convicted role from ${conviction.user_id}`, err);
        }
      }
    }
  }

  logger.info('SCHEDULER', 'Conviction recovery complete.');
}

export async function startConvictionPolling(client) {
  setInterval(() => runConvictionRecovery(client), CHECK_INTERVAL_MS);
  logger.info('SCHEDULER', 'Conviction polling started — interval: 1 hour.');
}