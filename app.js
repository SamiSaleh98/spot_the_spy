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
  updateMessageNew,
  sendFollowUpMessage,
  DeleteFollowUpMessage,
  DeleteFollowUpMessageNew,
  shuffleArray,
  getRandomLocations,
  getMessageData,
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
  getUserRole,
  insertLocations,
  insertMoleLocations,
  getLocations,
  assignLocationToGame,
  getSelectedLocation,
  deleteLocations,
  get3RandomLocations,
  deleteMoleLocations,
  getMoleLocations,
  getSecondSpy,
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

      console.log("Host has NO active games!");
      // create game ID based on timestamp and a number
      const gameId = generateUniqueGameId();

      // insert game data into the active_games table
      await insertActiveGame(db, gameId, hostUserId, maxPlayers);
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
          content: ``,
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
          embeds: [
            {
              type: "rich",
              title: "Game started",
              description: `<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
              color: 0xff00bb,
              image: {
                url: "https://i.imgur.com/HX5mdZw.png",
                height: 500,
                width: 500,
              },
            },
          ],
        },
      });


      // get response token
      const responseToken = req.body.token;

      // create follow up message
      const startGameFollowUp = {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "",
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
                {
                  type: 2,
                  custom_id: `cancel_game_button_${gameId}`,
                  label: "Cancel game",
                  style: 4,
                },
              ],
            },
          ],
          embeds: [
            {
              type: "rich",
              title: "",
              description: `<@${hostUserId}> can start or cancel the game whenever they want here!`,
              color: 0xff00bb,
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

      // delete locations from this game
      await deleteLocations(db, gameId);

      // delete mole locations from this game
      await deleteMoleLocations(db, gameId);

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
            content: "",
            flags: InteractionResponseFlags.EPHEMERAL,
            embeds: [
              {
                type: "rich",
                title: "You have already joined this game!",
                description: "",
                color: 0x008000,
              },
            ],
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
            content: "",
            flags: InteractionResponseFlags.EPHEMERAL,
            embeds: [
              {
                type: "rich",
                title:
                  "This game is already full. You cannot join at this time!",
                description: "",
                color: 0xff0000,
              },
            ],
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
        data: {
          content: ``,
          embeds: [
            {
              type: "rich",
              title: "Game started",
              description: `<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
              color: 0xff00bb,
              image: {
                url: "https://i.imgur.com/HX5mdZw.png",
                height: 500,
                width: 500,
              },
            },
          ],
        },
      };

      // update original message
      /*await updateMessage(
        initialResponseToken,
        joinedUsersUpdateParentMessageContent
      );*/

      // update original message
      await updateMessageNew(req.body.channel.id, req.body.message.id, joinedUsersUpdateParentMessageContent);
      console.log("updating message successful");

      // send response to discord
      return res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });
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
            content: "",
            flags: InteractionResponseFlags.EPHEMERAL,
            embeds: [
              {
                type: "rich",
                title: "You haven't joined this game session yet!",
                description: "",
                color: 0xff0000,
              },
            ],
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
        data: {
          content: ``,
          embeds: [
            {
              type: "rich",
              title: "Game started",
              description: `<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
              color: 0xff00bb,
              image: {
                url: "https://i.imgur.com/HX5mdZw.png",
                height: 500,
                width: 500,
              },
            },
          ],
        },
      };

      // update original message
      await updateMessageNew(req.body.channel.id, req.body.message.id, joinedUsersUpdateParentMessageContent);

      // send response to discord
      return res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });
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
              content: ``,
              flags: InteractionResponseFlags.EPHEMERAL,
              embeds: [
                {
                  type: "rich",
                  title:
                    "The minimum amount of players to start the game is 4.",
                  description: "Please make sure more players join your game!",
                  color: 0xff0000,
                },
              ],
            },
          });
        }
        // 4 or 5 players --> 1 spy and no mole
        else if (countUsers > 3 && countUsers < 6) {
          // get joined users' usernames
          const joinedUsersUserIds = joinedUsersData.map(
            (user) => user.username
          );

          // shuffle joined users
          const shuffledJoinedUsers = await shuffleArray(joinedUsersUserIds);

          // assign the spy role
          const spyUserId = shuffledJoinedUsers[0];
          await assignRoleToUser(db, gameId, spyUserId, 2);

          // assign the investigator role to the rest of the users
          for (let i = 1; i < joinedUsersUserIds.length; i++) {
            const investigatorUserId = shuffledJoinedUsers[i];
            await assignRoleToUser(db, gameId, investigatorUserId, 1);
          }

          // fetch random locations from pastebin
          const randomLocations = await getRandomLocations();
          //console.log("Random locations:", randomLocations);

          // insert these locations to the database
          if (randomLocations) {
            await insertLocations(db, gameId, randomLocations);
            await assignLocationToGame(db, gameId, randomLocations);
            console.log("Location assigned!");
          }

          // get message ID of parent message
          const parentMessageId = req.body.message.message_reference.message_id;

          // get message ID
          const messageId = req.body.message.id;

          // create update message content
          const updateMainMessage = {
            data: {
              content: ``,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      custom_id: `show_my_role_button_${gameId}`,
                      label: "Show my Role",
                      style: 1,
                    },
                    {
                      type: 2,
                      custom_id: `cancel_game_2_button_${gameId}`,
                      label: "Cancel game",
                      style: 4,
                    },
                  ],
                },
              ],
              embeds: [
                {
                  type: "rich",
                  title: "Game running",
                  description: `The game hosted by <@${hostUserId}> is currently running ...`,
                  color: 0xff00bb,
                },
              ],
            },
          };

          // update main message
          //await updateMessage(initialResponseToken, updateMainMessage);

          // update main message
          await updateMessageNew(req.body.channel.id, parentMessageId, updateMainMessage);

          // delete follow-up message
          //await DeleteFollowUpMessage(initialResponseToken, messageId);

          // delelte follow-up message
          await DeleteFollowUpMessageNew(req.body.channel.id, messageId);

          // send response to discord
          return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
          });
        }

        // 6 or 7 players --> 1 spy and 1 mole
        else if (countUsers > 5 && countUsers < 8) {
          // get joined users' usernames
          const joinedUsersUserIds = joinedUsersData.map(
            (user) => user.username
          );

          // shuffle joined users
          const shuffledJoinedUsers = await shuffleArray(joinedUsersUserIds);

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

          // fetch random locations from pastebin
          const randomLocations = await getRandomLocations();
          //console.log("Random locations:", randomLocations);

          // insert these locations to the database
          if (randomLocations) {
            await insertLocations(db, gameId, randomLocations);
            const moleLocationsList = await get3RandomLocations(db, gameId);
            const moleLocations = moleLocationsList.map(
              (location) => location.location_name
            );
            await insertMoleLocations(db, gameId, moleLocations);
            await assignLocationToGame(db, gameId, moleLocations);
            console.log("Location assigned!");
          }

          // get response token
          const initialResponseToken = await getResponseToken(db, hostUserId);

          // get message ID of parent message
          const parentMessageId = req.body.message.message_reference.message_id;

          // get message ID
          const messageId = req.body.message.id;

          // create update message content
          const updateMainMessage = {
            data: {
              content: ``,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      custom_id: `show_my_role_button_${gameId}`,
                      label: "Show my Role",
                      style: 1,
                    },
                    {
                      type: 2,
                      custom_id: `cancel_game_2_button_${gameId}`,
                      label: "Cancel game",
                      style: 4,
                    },
                  ],
                },
              ],
              embeds: [
                {
                  type: "rich",
                  title: "Game running",
                  description: `The game hosted by <@${hostUserId}> is currently running ...`,
                  color: 0xff00bb,
                },
              ],
            },
          };

          // update main message
          //await updateMessage(initialResponseToken, updateMainMessage);
          await updateMessageNew(req.body.channel.id, parentMessageId, updateMainMessage);

          // delete follow-up message
          //await DeleteFollowUpMessage(initialResponseToken, messageId);
          await DeleteFollowUpMessageNew(req.body.channel.id, messageId);

          // send response to discord
          return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
          });
        }
        // 8 or more players --> 2 spies and 1 mole
        else if (countUsers > 7) {
          // get joined users' usernames
          const joinedUsersUserIds = joinedUsersData.map(
            (user) => user.username
          );

          // shuffle joined users
          const shuffledJoinedUsers = await shuffleArray(joinedUsersUserIds);

          // assign the first spy role
          const spy1UserId = shuffledJoinedUsers[0];
          await assignRoleToUser(db, gameId, spy1UserId, 2);

          // assign the seconde spy role
          const spy2UserId = shuffledJoinedUsers[1];
          await assignRoleToUser(db, gameId, spy2UserId, 2);

          // assign the mole role
          const moleUserId = shuffledJoinedUsers[2];
          await assignRoleToUser(db, gameId, moleUserId, 3);

          // assign the investigator role to the rest of the users
          for (let i = 3; i < joinedUsersUserIds.length; i++) {
            const investigatorUserId = shuffledJoinedUsers[i];
            await assignRoleToUser(db, gameId, investigatorUserId, 1);
          }

          // fetch random locations from pastebin
          const randomLocations = await getRandomLocations();
          //console.log("Random locations:", randomLocations);

          // insert these locations to the database
          if (randomLocations) {
            await insertLocations(db, gameId, randomLocations);
            const moleLocationsList = await get3RandomLocations(db, gameId);
            const moleLocations = moleLocationsList.map(
              (location) => location.location_name
            );
            await insertMoleLocations(db, gameId, moleLocations);
            await assignLocationToGame(db, gameId, moleLocations);
            console.log("Location assigned!");
          }

          // get response token
          const initialResponseToken = await getResponseToken(db, hostUserId);

          // get message ID of parent message
          const parentMessageId = req.body.message.message_reference.message_id;

          // get message ID
          const messageId = req.body.message.id;

          // create update message content
          const updateMainMessage = {
            data: {
              content: ``,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      custom_id: `show_my_role_button_${gameId}`,
                      label: "Show my Role",
                      style: 1,
                    },
                    {
                      type: 2,
                      custom_id: `cancel_game_2_button_${gameId}`,
                      label: "Cancel game",
                      style: 4,
                    },
                  ],
                },
              ],
              embeds: [
                {
                  type: "rich",
                  title: "Game running",
                  description: `The game hosted by <@${hostUserId}> is currently running ...`,
                  color: 0xff00bb,
                },
              ],
            },
          };

          // update main message
          //await updateMessage(initialResponseToken, updateMainMessage);
          await updateMessageNew(req.body.channel.id, parentMessageId, updateMainMessage);

          // delete follow-up message
          //await DeleteFollowUpMessage(initialResponseToken, messageId);
          await DeleteFollowUpMessageNew(req.body.channel.id, messageId);

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
            content: ``,
            flags: InteractionResponseFlags.EPHEMERAL,
            embeds: [
              {
                type: "rich",
                title: "You are not the host of this game.",
                description: `Please refer to <@${hostUserId}>`,
                color: 0xff0000,
              },
            ],
          },
        });
      }
    }

    // if clicked button is "cancel game" ----------------------------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("cancel_game_button_")) {
      // fetch game ID associated with this game
      const gameId = componentId.replace("cancel_game_button_", "");

      // get this active game's data
      const activeGameData = await getActiveGames(db, gameId);
      const hostUserId = activeGameData[0].host_user;

      // check if the person who clicks the button is the host
      const userIsHost = activeGameData.some(
        (game) => game.host_user === userId
      );
      if (!userIsHost) {
        // send a message saying you are not the host to cancel
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: ``,
            flags: InteractionResponseFlags.EPHEMERAL,
            embeds: [
              {
                type: "rich",
                title: "You are not the host of this game!",
                description: `Please refer to <@${hostUserId}>`,
                color: 0xff0000,
              },
            ],
          },
        });
      }
      // user who clicked "cancel" is host
      else {
        // fetch response token from parent message ID from the Host User
        /*const responseTokenFromParentMessage = await getResponseToken(
          db,
          hostUserId
        );
        if (!responseTokenFromParentMessage) {
          console.error("No stored response token found from parent message");
          return;
        }*/

        // delete active game from database table active_games
        await deleteActiveGame(db, gameId, hostUserId);
        console.log("Active game deleted!");

        // delete joined users from this game
        await deleteJoinedUsers(db, gameId);
        console.log("Joined users deleted!");

        // delete locations from this game
        await deleteLocations(db, gameId);

        // delete mole locations from this game
        await deleteMoleLocations(db, gameId);

        // delete follow-up message
        //await DeleteFollowUpMessage(responseTokenFromParentMessage, req.body.message.id);
        await DeleteFollowUpMessageNew(req.body.channel.id, req.body.message.id);

        // update parent message
        const updateParentMessageContent = {
          data: {
            content: "",
            components: [],
            embeds: [
              {
                type: "rich",
                title: "Game canceled",
                description: `<@${hostUserId}> canceled this game. Use the command /start to start a new one!`,
                color: 0xff00bb,
              },
            ],
          },
        };
        //await updateMessage(responseTokenFromParentMessage, updateParentMessageContent);
        await updateMessageNew(req.body.channel.id, req.body.message.message_reference.message_id, updateParentMessageContent);

        // Delete the dataset with the message and token after updating the message (it's not needed anymore)
        //await deleteMessageWithToken(db, hostUserId);

        // send response to discord
        return res.send({
          type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
        });
      }
    }

    // if clicked button is "cancel game 2" ----------------------------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("cancel_game_2_button_")) {
      // fetch game ID associated with this game
      const gameId = componentId.replace("cancel_game_2_button_", "");

      // get this active game's data
      const activeGameData = await getActiveGames(db, gameId);
      const hostUserId = activeGameData[0].host_user;

      // check if the person who clicks the button is the host
      const userIsHost = activeGameData.some(
        (game) => game.host_user === userId
      );
      if (!userIsHost) {
        // send a message saying you are not the host to cancel
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: ``,
            flags: InteractionResponseFlags.EPHEMERAL,
            embeds: [
              {
                type: "rich",
                title: "You are not the host of this game!",
                description: `Please refer to <@${hostUserId}>`,
                color: 0xff0000,
              },
            ],
          },
        });
      }
      // user who clicked "cancel" is host
      else {
        // fetch response token from parent message ID from the Host User
        /*const responseTokenFromParentMessage = await getResponseToken(
          db,
          hostUserId
        );
        if (!responseTokenFromParentMessage) {
          console.error("No stored response token found from parent message");
          return;
        }*/

        // delete active game from database table active_games
        await deleteActiveGame(db, gameId, hostUserId);
        console.log("Active game deleted!");

        // delete joined users from this game
        await deleteJoinedUsers(db, gameId);
        console.log("Joined users deleted!");

        // delete locations from this game
        await deleteLocations(db, gameId);

        // update message
        const updateParentMessageContent = {
          data: {
            content: ``,
            components: [],
            embeds: [
              {
                type: "rich",
                title: "Game canceled",
                description: `<@${hostUserId}> canceled this game. Use the command /start to start a new one!`,
                color: 0xff00bb,
              },
            ],
          },
        };
        //await updateMessage(responseTokenFromParentMessage, updateParentMessageContent);
        await updateMessageNew(req.body.channel.id, req.body.message.id, updateParentMessageContent);

        // Delete the dataset with the message and token after updating the message (it's not needed anymore)
        //await deleteMessageWithToken(db, hostUserId);

        // send response to discord
        return res.send({
          type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
        });
      }
    }

    // if clicked button is show_my_role ------------------------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("show_my_role_button_")) {
      // fetch game ID associated with this game
      const gameId = componentId.replace("show_my_role_button_", "");

      // fetch joined users data
      const joinedUsersData = await getJoinedUsers(db, gameId);

      // count joined users
      const countUsers = joinedUsersData.length;

      // get role associated with the user who clicked the button
      const userRole = await getUserRole(db, gameId, userId);

      // 4 or 5 players --> no mole
      if (countUsers < 6) {
        // get all locations for spy and mole
        const spyLocations = await getLocations(db, gameId);
        const spyLocationsList = spyLocations
          .map((spyLocation) => `${spyLocation.location_name}`)
          .join("\n");

        // get location assigned for this game
        const assignedLocation = await getSelectedLocation(db, gameId);

        if (userRole) {
          // user is spy
          if (userRole === "Spy") {
            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe list of locations for this game:\n\n${spyLocationsList}\n\nYour objective is to guess the location while you make sure to get rid of the investigators without being too suspicious. You can win by either guessing the location correctly or survive until there is one investigator left in the game.`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/TOujaoQ.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }

          // user is investigator
          else {
            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe secret location is:\n\n**${assignedLocation}**\n\nYour objective is to keep the location as shown above a secret for as long as possible. You can win the game by voting out the spy!`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/sY6HYAk.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }
        } else {
          // send an ephemeral message saying there is no role assigned
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: ``,
              flags: InteractionResponseFlags.EPHEMERAL,
              embeds: [
                {
                  type: "rich",
                  title: "You have no role assigned",
                  description: `You are probably not in this game session`,
                  color: 0xff0000,
                },
              ],
            },
          });
        }

        // 6 of 7 players --> 1 spy and 1 mole
      } else if (countUsers > 5 && countUsers < 8) {
        // get all locations for spy and mole
        const spyLocations = await getLocations(db, gameId);
        const spyLocationsList = spyLocations
          .map((spyLocation) => `${spyLocation.location_name}`)
          .join("\n");
        const moleLocations = await getMoleLocations(db, gameId);
        const moleLocationsList = moleLocations
          .map((moleLocation) => `${moleLocation.location_name}`)
          .join("\n");

        // get location assigned for this game
        const assignedLocation = await getSelectedLocation(db, gameId);

        if (userRole) {
          // user is spy
          if (userRole === "Spy") {
            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe list of locations for this game:\n\n${spyLocationsList}\n\nYour objective is to guess the location while you make sure to get rid of the investigators without being too suspicious. You can win by either guessing the location correctly or survive until there is one investigator left in the game.`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/TOujaoQ.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }
          // user is mole
          else if (userRole === "Mole") {
            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe list of locations for this game:\n\n${moleLocationsList}\n\nYour objective is to help the spy or spies. Don’t be too obvious though!`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/1E2guzC.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }
          // user is investigator
          else {
            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe secret location is:\n\n**${assignedLocation}**\n\nYour objective is to keep the location as shown above a secret for as long as possible. You can win the game by voting out the spy!`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/sY6HYAk.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }
        } else {
          // send an ephemeral message saying there is no role assigned
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: ``,
              flags: InteractionResponseFlags.EPHEMERAL,
              embeds: [
                {
                  type: "rich",
                  title: "You have no role assigned",
                  description: `You are probably not in this game session`,
                  color: 0xff0000,
                },
              ],
              
            },
          });
        }

        // 8 or more players --> 2 spies and 1 mole
      } else if (countUsers > 7) {
        // get all locations for spy and mole
        const spyLocations = await getLocations(db, gameId);
        const spyLocationsList = spyLocations
          .map((spyLocation) => `${spyLocation.location_name}`)
          .join("\n");
        const moleLocations = await getMoleLocations(db, gameId);
        const moleLocationsList = moleLocations
          .map((moleLocation) => `${moleLocation.location_name}`)
          .join("\n");

        // get location assigned for this game
        const assignedLocation = await getSelectedLocation(db, gameId);

        if (userRole) {
          // user is spy
          if (userRole === "Spy") {
            // fetch second spy username
            const secondSpy = await getSecondSpy(db, gameId, userId);

            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe second spy is **<@${secondSpy}>**\n\nThe list of locations for this game:\n\n${spyLocationsList}\n\nYour objective is to guess the location while you make sure to get rid of the investigators without being too suspicious. You can win by either guessing the location correctly or survive until there is one investigator left in the game.`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/TOujaoQ.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }
          // user is mole
          else if (userRole === "Mole") {
            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe list of locations for this game:\n\n${moleLocationsList}\n\nYour objective is to help the spy or spies. Don’t be too obvious though!`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/1E2guzC.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }
          // user is investigator
          else {
            // send an ephemeral message with the role
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: ``,
                flags: InteractionResponseFlags.EPHEMERAL,
                embeds: [
                  {
                    type: "rich",
                    title: `Your role is:`,
                    description: `**${userRole}**.\n\nThe secret location is:\n\n**${assignedLocation}**\n\nYour objective is to keep the location as shown above a secret for as long as possible. You can win the game by voting out the spy!`,
                    color: 0xff00bb,
                    image: {
                      url: "https://i.imgur.com/sY6HYAk.png",
                      height: 500,
                      width: 500,
                    },
                    author: {
                      name: `Spot The Spy`,
                      icon_url: "https://i.imgur.com/HX5mdZw.png",
                    },
                  },
                ],
              },
            });
          }
        } else {
          // send an ephemeral message saying there is no role assigned
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: ``,
              flags: InteractionResponseFlags.EPHEMERAL,
              embeds: [
                {
                  type: "rich",
                  title: "You have no role assigned",
                  description: `You are probably not in this game session`,
                  color: 0xff0000,
                },
              ],
            },
          });
        }
      }
    }
  }
});

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
