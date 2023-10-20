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
  updateMessage,
  sendFollowUpMessage,
  DeleteFollowUpMessage,
  shuffleArray
} from "./utils.js";

import {
  createInitialTables,
  getActiveGames,
  insertActiveGame,
  insertMessageData,
  getResponseToken,
  deleteActiveGame,
  deleteMessageWithToken,
  insertJoinedUser,
  getJoinedUsers,
  deleteJoinedUsers,
  GetMessageId,
  assignRoleToUser,
} from "./database.js";

import { getShuffledOptions, getResult } from "./game.js";
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./database.sqlite3");

//let parentMessageId;
//let gameId;

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

  // global variable for User ID
  //const userId = member.user.id;

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
    // "start" command ---------------------------------------------------------------------------------------------------------------
    else if (name === "start" && id) {
      console.log("------------------------");
      console.log("Start command initiated");

      // fetch the number of players chosen by the user
      const maxPlayers = parseInt(data.options[0].value);

      // fetch the user ID
      const hostUserId = member.user.id;

      // check if host already has an active game running
      const games = await getActiveGames(db);
      console.log("getActiveGames selected");
      const hostHasActiveGame = games.some(
        (game) => game.host_user === hostUserId
      );
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

      // insert message data into messages table
      const messageId = req.body.id;
      const responseToken = req.body.token;
      await insertMessageData(db, messageId, hostUserId, responseToken);
      console.log("message data inserted!");
      console.log("Token from parent message:", responseToken);

      console.log("Host has NO active games!");
      // create game ID based on timestamp and a number
      const gameId = generateUniqueGameId();

      // insert game data into the active_games table
      await insertActiveGame(db, gameId, hostUserId, maxPlayers, messageId);
      console.log("inserted active game data");

      // insert hostuser automatically to joined_users
      await insertJoinedUser(db, gameId, hostUserId);
      console.log("Joined hostuser inserted!");

      // fetch joined users from this game session
      const joinedUsers = await getJoinedUsers(db, gameId);
      console.log("Joined users selected");
      const joinedUsersList = joinedUsers
        .map((user) => `<@${user.username}>`)
        .join("\n");

      // send interaction response
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: `join_button_${gameId}`,
                  label: "Join",
                  style: 3,
                },
                {
                  type: 2,
                  custom_id: `leave_button_${gameId}`,
                  label: "Leave",
                  style: 4,
                },
              ],
            },
          ],
        },
      });

      // create follow up message
      const startGameFollowUp = {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `<@${hostUserId}> can start the game whenever they want by clicking the button bellow!`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: `start_game_button_${gameId}`,
                  label: "Start game",
                  style: 3,
                },
              ],
            },
          ],
        },
      };

      // send follow up message
      await sendFollowUpMessage(responseToken, startGameFollowUp);
    }
    // cancel command -----------------------------------------------------------------------------------------------------------------
    else if (name === "cancel") {
      console.log("------------------------");
      console.log("Cancel command initiated");

      const hostUserId = member.user.id;
      // check if the user is already running a game or not
      const games = await getActiveGames(db);
      const hasActiveGame = games.some(
        (game) => game.host_user === member.user.id
      );
      if (!hasActiveGame) {
        console.log("User has no active games!");
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "You are not hosting a game to cancel!",
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      // fetch response token from parent message ID from the Host User
      const responseTokenFromParentMessage = await getResponseToken(
        db,
        hostUserId
      );
      if (!responseTokenFromParentMessage) {
        console.error("No stored response token found from parent message");
        return;
      }

      // get active game ID
      const gameIdObj = games.find((game) => game.host_user === hostUserId);
      const gameId = gameIdObj.game_id;
      console.log("game ID:", gameId);
      // delete active game from database table active_games
      await deleteActiveGame(db, gameId, member.user.id);
      console.log("Active game deleted!");

      // delete joined users from this game
      await deleteJoinedUsers(db, gameId);
      console.log("Joined users deleted!");



      // delete follow up message
      //const messageId = gameIdObj.message_id;
      //await DeleteFollowUpMessage(responseTokenFromParentMessage, messageId);

      // update parent message
      const updateParentMessageContent = {
        content: `<@${member.user.id}> canceled this game. Use the command /start to start a new one`,
        components: [],
      };
      await updateMessage(
        responseTokenFromParentMessage,
        updateParentMessageContent
      );

      // Delete the dataset with the message and token after updating the message (it's not needed anymore)
      await deleteMessageWithToken(db, hostUserId);

      // send game cancelation confirmation
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `The game created by <@${hostUserId}> has been canceled!`,
        },
      });
    } 

    // database_test command
    else if (name === "database_test") {
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

  // message components
  if (type === InteractionType.MESSAGE_COMPONENT) {
    // fetch user ID who clicked the button
    const userId = member.user.id;

    // custom_id set in payload when sending message component
    const componentId = data.custom_id;

    // if clicked button is "JOIN"----------------------------------------------------------------------------------------------
    if (componentId.startsWith("join_button_")) {
      // get the associated game ID
      const gameId = componentId.replace("join_button_", "");

      // fetch data from this game
      const activeGamesData = await getActiveGames(db, gameId);

      // fetch data from joined users
      const joinedUsersData = await getJoinedUsers(db, gameId);

      // check if the user has already joined this game
      const userAlreadyJoined = joinedUsersData.some(
        (user) => user.username === userId
      );
      if (userAlreadyJoined) {
        // send an ephemeral message showing that you have already joined the game session
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "You've already joined this game!",
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      // check if max players exceeded
      const maxPlayers = activeGamesData[0].max_players;
      const countUsers = joinedUsersData.length;
      console.log("Counted Users:", countUsers);
      if (countUsers >= maxPlayers) {
        // send an ephemeral message showing that the max player amount has been reached
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "This game is already full. You cannot join at this time!",
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      // get active game details
      const hostUserId = activeGamesData[0].host_user;
      console.log("hostUserId:", hostUserId);
      console.log("maxPlayers:", maxPlayers);

      // get response token of parent message
      const initialResponseToken = await getResponseToken(db, hostUserId);

      // insert user to joined_users
      await insertJoinedUser(db, gameId, userId);
      console.log("Joined users inserted (join button)!");

      // fetch joined users from this game session
      const joinedUsers = await getJoinedUsers(db, gameId);
      console.log("Joined users selected (join button)!");
      const joinedUsersList = joinedUsers
        .map((user) => `<@${user.username}>`)
        .join("\n");

      // create update message content
      const joinedUsersUpdateParentMessageContent = {
        content: `<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
      };

      // send response to discord
      await res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });

      // update original message
      await updateMessage(
        initialResponseToken,
        joinedUsersUpdateParentMessageContent
      );
    }
    // if clicked button is "Leave" -----------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("leave_button_")) {
      // fetch game ID associated with this button
      const gameId = componentId.replace("leave_button_", "");

      // check if user is already in the game session
      const checkJoinedUsers = await getJoinedUsers(db, gameId);
      const userAlreadyJoined = checkJoinedUsers.some(
        (user) => user.username === userId
      );
      if (!userAlreadyJoined) {
        // send an ephemeral message showing that you are in an active game to leave
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "You haven't joined this game session yet!",
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      // get active game details
      const activeGame = await getActiveGames(db, gameId);
      const hostUserId = activeGame[0].host_user;
      const maxPlayers = activeGame[0].max_players;

      // get response token for parent message
      const initialResponseToken = await getResponseToken(db, hostUserId);

      // remove user from game session
      await deleteJoinedUsers(db, gameId, userId);

      // fetch joined users from this game session
      const joinedUsers = await getJoinedUsers(db, gameId);
      const joinedUsersList = joinedUsers
        .map((user) => `<@${user.username}>`)
        .join("\n");

      // create update message content
      const joinedUsersUpdateParentMessageContent = {
        content: `<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
      };

      // send response to discord
      await res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });

      // update original message
      await updateMessage(
        initialResponseToken,
        joinedUsersUpdateParentMessageContent
      );
    }
    // if clicked button is start_game -----------------------------------------------------------------------------------------
    else if (componentId.startsWith("start_game_button_")) {
      // fetch game ID associated with this game
      const gameId = componentId.replace("start_game_button_", "");

      // get this active game's data
      const activeGameData = await getActiveGames(db, gameId);
      const hostUserId = activeGameData[0].host_user;

      // check if the person who clicks the button is the host
      const userIsHost = activeGameData.some(
        (game) => game.host_user === userId
      );
      // user is host
      if (userIsHost) {
        // fetch joined users data
        const joinedUsersData = await getJoinedUsers(db, gameId);

        // count joined users
        const countUsers = joinedUsersData.length;

        // check if users are less than 4
        if (countUsers < 4) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `The minimum amount of players to start the game is 4. Please make sure more players join your game!`,
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        } else {
          // get response token
          const initialResponseToken = await getResponseToken(db, hostUserId);

          // get message ID
          const messageId = req.body.message.id;

          // create update message content
          const updateMainMessage = {
            content: `The game hosted by <@${hostUserId}> is currently running ...`,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: `show_my_role_${gameId}`,
                    label: "Show my Role",
                    style: 1,
                  },
                ],
              },
            ],
          };

          // update main message
          await updateMessage(initialResponseToken, updateMainMessage);

          // delete follow-up message
          await DeleteFollowUpMessage(initialResponseToken, messageId);

          // get joined users' usernames
          const joinedUsersUserIds = joinedUsersData.map((user) => user.username);

          // shuffle joined users
          const shuffledJoinedUsers = shuffleArray(joinedUsersUserIds);
          console.log("Shuffled Joined Users:", shuffledJoinedUsers);

          // assign the spy role
          const spyUserId = shuffledJoinedUsers[0];
          await assignRoleToUser(db, gameId, spyUserId, 2);

          // assign the mole role
          const moleUserId = shuffledJoinedUsers[1];
          await assignRoleToUser(db, gameId, moleUserId, 3);

          // assign the investigator role to the rest of the users
          for (let i = 2; i < joinedUsersUserIds.length; i++) {
            const investigatorUserId = shuffledJoinedUsers[i];
            await assignRoleToUser(db, gameId, investigatorUserId, 1);
          }
          // ..............................................................................................................................................

          // send response to discord
          return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
          });
        }
      }
      // person who clicked is not the host
      else {
        // send a message showing they are not the host
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `You are not the host of this game. Please refer to <@${hostUserId}>`,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
    }
  }
});

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
