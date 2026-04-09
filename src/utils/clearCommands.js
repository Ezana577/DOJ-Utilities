import express from 'express';
import fetch from 'node-fetch';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.CLIENT_ID; // your bot's client ID
const TOKEN = process.env.DISCORD_TOKEN; // your bot token

// Only allow clearing commands from your own IP/user for safety
const SAFE_KEY = process.env.CLEAR_KEY; // set a secret key in .env

app.get('/clear-commands', async (req, res) => {
  if (req.query.key !== SAFE_KEY) return res.status(403).send('Forbidden');

  try {
    // Clear global commands
    await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/commands`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([])
    });

    // Optional: clear guild commands (if you want)
    // await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/guilds/YOUR_GUILD_ID/commands`, {
    //   method: 'PUT',
    //   headers: {
    //     Authorization: `Bot ${TOKEN}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify([])
    // });

    res.send('✅ All commands cleared!');
  } catch (err) {
    console.error(err);
    res.send('❌ Failed to clear commands.');
  }
});

app.listen(PORT, () => console.log(`ClearCommands endpoint running on port ${PORT}`));