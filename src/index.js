import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
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

const commandFiles = readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = pathToFileURL(join(__dirname, 'commands', file)).href;
  const command = await import(filePath);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    logger.info('LOADER', `Command loaded: ${command.data.name}`);
  } else {
    logger.warn('LOADER', `Skipped command file ${file} — missing data or execute.`);
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


const app = express();
const PORT = process.env.PORT || 3000;

app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    ping: client.ws.ping,
    uptime: process.uptime(),
    commands: client.commands.size,
  });
});


app.listen(PORT, '0.0.0.0', () => {
  logger.info('WEB', `Web server running on port ${PORT}`);
});

await client.login(process.env.DISCORD_TOKEN);