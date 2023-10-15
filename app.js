import "dotenv/config";
import express from "express";
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
} from "discord-interactions";
import {
  VerifyDiscordRequest,
  getRandomEmoji,
  DiscordRequest,
  generateUniqueGameId,
} from "./utils.js";

import { createInitialTables, getActiveGames, insertActiveGame } from "./database.js";

import { getShuffledOptions, getResult } from "./game.js";
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./database.sqlite3");

console.log("Before creating tables");
// Create database tables if they don't exist
await createInitialTables(db);
console.log("After creating tables");

// Create an express app
const app = express();

// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

// Store for in-progress games. In production, you'd want to use a DB
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
app.post("/interactions", async function (req, res) {
  // Interaction type and data
  const { type, id, data, member } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === "test") {
      // username is SaSaX
      if (member.user.id === "399669929227452437") {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
              `Hello <@${member.user.id}> <3 You are my developer! ` +
              getRandomEmoji(),
          },
        });
      } else {
        // username is not SaSaX
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            // Fetches a random emoji to send from a helper function
            content: `Hello <@${member.user.id}> ` + getRandomEmoji(),
          },
        });
      }
    }
    // "start" command
    else if (name === "start" && id) {
      console.log("Start command initiated");

      // fetch the number of players chosen by the user
      const maxPlayers = parseInt(data.options[0].value);

      // fetch the user ID
      const userId = member.user.id;

      // check if host already has an active game running
      const games = await getActiveGames(db);
      console.log("getActiveGames selected");
      const hostHasActiveGame = games.some((game) => game.host_user === userId);
      if (hostHasActiveGame) {
        console.log("Host has an active game!");
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "You already have an active game running!",
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      console.log("Host has NO active games!");
      const gameId = generateUniqueGameId();

      // insert game data into the active_games table
      await insertActiveGame(db, gameId, userId, maxPlayers);
      console.log("inserted active game data");

      // send interaction response
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `<@${userId}> started a game with a maximum of ${maxPlayers} players!`,
        },
      });
    } else if (name === "database_test") {
      db.run(
        `CREATE TABLE IF NOT EXISTS active_games (
          game_id TEXT PRIMARY KEY,
          host_user TEXT,
          max_players INTEGER
        )`,
        function (err) {
          if (err) {
            console.error("Error creating table:", err);
          } else {
            // Table created successfully, now insert data
            /*db.run(
              "INSERT INTO active_games (game_id, host_user, max_players) VALUES (?, ?, ?)",
              ["123455", "SamiSaleh", 10],
              function (err) {
                if (err) {
                  console.error("Error inserting data:", err);
                } else {
                  console.log("Data inserted successfully.");
                }
              }
            );*/
          }
        }
      );
    }
  }
});

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
