import 'dotenv/config';
import fetch from 'node-fetch';
import { verifyKey } from 'discord-interactions';

export function VerifyDiscordRequest(clientKey) {
  return function (req, res, buf, encoding) {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');

    const isValidRequest = verifyKey(buf, signature, timestamp, clientKey);
    if (!isValidRequest) {
      res.status(401).send('Bad request signature');
      throw new Error('Bad request signature');
    }
  };
}

export async function DiscordRequest(endpoint, options) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  // Use node-fetch to make requests
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
    },
    ...options
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    console.log(res.status);
    throw new Error(JSON.stringify(data));
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function generateUniqueGameId() {
  // get current timestamp in milliseconds
  const timestamp = new Date().getTime();

  // generate a random number between 0 and 999
  const randomNumber = Math.floor(Math.random() * 1000);

  // combine the timestamp and random number
  const gameId = `${timestamp}-${randomNumber}`;

  return gameId;
}

// update parent message using "PATCH" method
export async function updateMessage(responseToken, messageContent) {
  try {
    await DiscordRequest(
      `webhooks/${process.env.APP_ID}/${responseToken}/messages/@original`,
      {
        method: "PATCH",
        body: messageContent,
      }
    );
  } catch (err) {
    console.error("Error updating message:", err);
  }
}

// send follow up response/message using "POST" method
export async function sendFollowUpMessage(initialResponseToken, messageContent) {
  try {
    await DiscordRequest(
      `webhooks/${process.env.APP_ID}/${initialResponseToken}`,
      {
        method: "POST",
        body: messageContent.data,
        wait: true,
      }
    );
  } catch (err) {
    console.error("Error sending follow-up message:", err);
  }
}

// delete follow up message
export async function DeleteFollowUpMessage(initialResponseToken, messageId) {
  try {
    await DiscordRequest(
      `webhooks/${process.env.APP_ID}/${initialResponseToken}/messages/${messageId}`,
    {
      method: "DELETE",
    }
    );
  } catch (err) {
    console.error("Error deleting follow-up message:", err);
  }
}

// shuffle array
export function shuffleArray(array) {
  const shuffledArray = [...array];
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];    
  }
  return shuffledArray;
}
