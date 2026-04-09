import { Events, ActivityType, REST, Routes } from ‘discord.js’;
import { logger } from ‘../utils/logger.js’;
import { startSyncInterval } from ‘../utils/rolesync.js’;

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
logger.info(‘READY’, `Logged in as ${client.user.tag}`);
logger.info(‘READY’, `Active in ${client.guilds.cache.size} guild(s)`);

client.user.setPresence({
activities: [{ name: ‘Department of Justice’, type: ActivityType.Watching }],
status: ‘online’,
});

try {
const rest = new REST({ version: ‘10’ }).setToken(process.env.DISCORD_TOKEN);
logger.info(‘COMMANDS’, `Registering ${client.commandPayloads.length} slash command(s)...`);
await rest.put(
Routes.applicationCommands(process.env.CLIENT_ID),
{ body: client.commandPayloads }
);
logger.info(‘COMMANDS’, ‘Slash commands registered successfully.’);
} catch (err) {
logger.error(‘COMMANDS’, ‘Failed to register slash commands’, err);
}

startSyncInterval(client);
}