import express from 'express';
import fetch from 'node-fetch';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/clear-commands', async (req, res) => {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  try {
    // Delete global commands
    await fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([])
    });

    res.send('✅ All global commands cleared!');
  } catch (err) {
    console.error(err);
    res.send('❌ Failed to clear commands.');
  }
});

app.listen(PORT, () => console.log(`ClearCommands endpoint running on port ${PORT}`));