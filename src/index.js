import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from './utils/logger.js';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
client.prefixCommands = new Collection();
const commandPayloads = [];

const commandFiles = readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = pathToFileURL(join(__dirname, 'commands', file)).href;
  const command = await import(filePath);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    commandPayloads.push(command.data.toJSON());
    logger.info('LOADER', `Slash command loaded: ${command.data.name}`);
  } else {
    logger.warn('LOADER', `Skipped slash command file ${file} — missing data or execute.`);
  }
}

const prefixCommandFiles = readdirSync(join(__dirname, 'prefixCommands')).filter(f => f.endsWith('.js'));
for (const file of prefixCommandFiles) {
  const filePath = pathToFileURL(join(__dirname, 'prefixCommands', file)).href;
  const command = await import(filePath);
  if (command.name && command.execute) {
    client.prefixCommands.set(command.name, command);
    logger.info('LOADER', `Prefix command loaded: ${command.name}`);
  } else {
    logger.warn('LOADER', `Skipped prefix command file ${file} — missing name or execute.`);
  }
}

const eventFiles = readdirSync(join(__dirname, 'events')).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
  const filePath = pathToFileURL(join(__dirname, 'events', file)).href;
  const event = await import(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  logger.info('LOADER', `Event loaded: ${event.name}`);
}

process.on('unhandledRejection', (err) => {
  logger.error('PROCESS', 'Unhandled promise rejection', err);
});

process.on('uncaughtException', (err) => {
  logger.error('PROCESS', 'Uncaught exception', err);
  process.exit(1);
});

if (!process.env.DISCORD_TOKEN) {
  logger.error('STARTUP', 'DISCORD_TOKEN is not set. Exiting.');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  logger.error('STARTUP', 'CLIENT_ID is not set. Exiting.');
  process.exit(1);
}

try {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  logger.info('COMMANDS', `Registering ${commandPayloads.length} slash command(s)...`);
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commandPayloads }
  );
  logger.info('COMMANDS', 'Slash commands registered successfully.');
} catch (err) {
  logger.error('COMMANDS', 'Failed to register slash commands', err);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    ping: client.ws.ping,
    uptime: process.uptime(),
    commands: client.commands.size,
    prefixCommands: client.prefixCommands.size,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info('WEB', `Web server running on port ${PORT}`);
});

await client.login(process.env.DISCORD_TOKEN);