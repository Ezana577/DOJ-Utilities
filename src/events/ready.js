import { Events, REST, Routes } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: [] } // wipe all commands
  );

  console.log('All commands wiped.');
}