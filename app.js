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
  updateFollowUpMessage,
  createMessage,
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
              description: `**<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!**\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
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

    // role command ---------------------------------------------------------------------------------------------------------------------------------------------------------------
    else if (name === "role") {
      // fetch the role chosen by the user
      const roleChoice = data.options[0].value;

      switch (roleChoice) {
        case "role_spy":
          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "",
              flags: InteractionResponseFlags.EPHEMERAL,
              embeds: [
                {
                  type: "rich",
                  title: `**The Spy role**`,
                  description: `At the start of the game the spy will get a list of 10 possible locations and – when gaming with 8 people or more – the names of the other spies. A spy can win when they either guess the secret location or survive until there’s only one investigator left. Tread carefully and don’t raise any suspicions!`,
                  color: 0xff00bb,
                },
              ],
            },
          });
          break;
        case "role_mole":
          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "",
              flags: InteractionResponseFlags.EPHEMERAL,
              embeds: [
                {
                  type: "rich",
                  title: `**The Mole role**`,
                  description: `At the start of the game a mole will receive a list of 3 locations as well as a gun with one single bullet, but they don’t get any intel on the other players. The mole’s goal is to help the spy (or spies) in figuring out the secret location. When the mole feels like a player is getting too close to voting a spy out – or when the mole gets voted out -  they may choose to use their one bullet and kill the investigator. Try and figure out who the spy is early on and the mole may pull all the focus on themselves!`,
                  color: 0xff00bb,
                },
              ],
            },
          });
          break;
        case "role_investigator":
          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "",
              flags: InteractionResponseFlags.EPHEMERAL,
              embeds: [
                {
                  type: "rich",
                  title: `**The Investigator role**`,
                  description: `When the game starts, every investigator will receive the secret location, but they don’t know anything about the other players. By asking questions about the location will confirm the other players’ roles and might reveal the spy. An investigator can win the game by spotting the spy, while keeping the location a secret!`,
                  color: 0xff00bb,
                },
              ],
            },
          });
          break;
      }
    }

    // info command ---------------------------------------------------------------------------------------------------------------------------------------------------
    else if (name === "info") {
      // send info message
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "",
          flags: InteractionResponseFlags.EPHEMERAL,
          embeds: [
            {
              type: "rich",
              title: `**Information about the game**`,
              description: `The following configurations are currently available for Spot the Spy:\n
              5 players - 1 spy and 4 investigators
              6 players - 1 spy, 1 mole and 4 investigators
              7 players - 1 spy, 1 mole and 5 investigators
              8 players - 2 spies, 1 mole and 5 investigators
              9 players - 2 spies, 1 mole and 6 investigators
              10 players - 2 spies, 1 mole and 7 investigators`,
              color: 0xff00bb,
            },
          ],
        },
      });
    }

    // help command ---------------------------------------------------------------------------------------------------------------------------------------------------------------
    else if (name === "help") {
      // send help message
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "If you ever need any help with the game or the bot, please visit us at https://discord.gg/FgY5JPqJ6v \n\nOur devs are here to help you!",
          flags: InteractionResponseFlags.EPHEMERAL,
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
              description: `**<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!**\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
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
      await updateMessageNew(
        req.body.channel.id,
        req.body.message.id,
        joinedUsersUpdateParentMessageContent
      );
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
              description: `**<@${hostUserId}> started a game with a maximum of ${maxPlayers} players!**\n \nPlease join a voice channel to start playing the game!\n \nJoined Players:\n${joinedUsersList}`,
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
      await updateMessageNew(
        req.body.channel.id,
        req.body.message.id,
        joinedUsersUpdateParentMessageContent
      );

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

          // get 1 random user to start asking
          console.log("joined user IDs:", joinedUsersUserIds);
          const shuffledJoinedUsersFirstTurn = await shuffleArray(
            joinedUsersUserIds
          );
          console.log(
            "shuffled joined user IDs:",
            shuffledJoinedUsersFirstTurn
          );
          const randomPlayerToStart = shuffledJoinedUsersFirstTurn[2];
          console.log("Random user IDs:", randomPlayerToStart);

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
                      custom_id: `end_game_button_${gameId}`,
                      label: "End game",
                      style: 4,
                    },
                  ],
                },
              ],
              embeds: [
                {
                  type: "rich",
                  title: "Game running",
                  description: `The game hosted by <@${hostUserId}> is currently running ...\n\n<@${randomPlayerToStart}> will start asking a question!`,
                  color: 0xff00bb,
                },
              ],
            },
          };

          // update main message
          //await updateMessage(initialResponseToken, updateMainMessage);

          // update main message
          await updateMessageNew(
            req.body.channel.id,
            parentMessageId,
            updateMainMessage
          );

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

          // get 1 random user to start asking
          const shuffledJoinedUsersFirstTurn = await shuffleArray(
            joinedUsersUserIds
          );
          const randomPlayerToStart = shuffledJoinedUsersFirstTurn[1];

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
                      custom_id: `end_game_button_${gameId}`,
                      label: "End game",
                      style: 4,
                    },
                  ],
                },
              ],
              embeds: [
                {
                  type: "rich",
                  title: "Game running",
                  description: `The game hosted by <@${hostUserId}> is currently running ...\n\n<@${randomPlayerToStart}> will start asking a question!`,
                  color: 0xff00bb,
                },
              ],
            },
          };

          // update main message
          //await updateMessage(initialResponseToken, updateMainMessage);
          await updateMessageNew(
            req.body.channel.id,
            parentMessageId,
            updateMainMessage
          );

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

          // get 1 random user to start asking
          const shuffledJoinedUsersFirstTurn = await shuffleArray(
            joinedUsersUserIds
          );
          const randomPlayerToStart = shuffledJoinedUsersFirstTurn[3];

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
                      custom_id: `end_game_button_${gameId}`,
                      label: "End game",
                      style: 4,
                    },
                  ],
                },
              ],
              embeds: [
                {
                  type: "rich",
                  title: "Game running",
                  description: `The game hosted by <@${hostUserId}> is currently running ...\n\n<@${randomPlayerToStart}> will start asking a question!`,
                  color: 0xff00bb,
                },
              ],
            },
          };

          // update main message
          //await updateMessage(initialResponseToken, updateMainMessage);
          await updateMessageNew(
            req.body.channel.id,
            parentMessageId,
            updateMainMessage
          );

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

    // cancel game button----------------------------------------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("cancel_game_button_")) {
      // fetch game ID associated with this button
      const gameId = componentId.replace("cancel_game_button_", "");

      // get this active game's data
      const activeGameData = await getActiveGames(db, gameId);
      const hostUserId = activeGameData[0].host_user;
      console.log("hostUserId:", hostUserId);

      // check if the person who clicks the button is the host
      const userIsHost = activeGameData.some(
        (game) => game.host_user === userId
      );
      // user is not host
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

      // user is host
      else {
        // get interaction ID of this interaction (button)
        const interactionId = req.body.id;

        // get interaction token
        const interactionToken = req.body.token;

        // message ID of this message
        const messageId = req.body.message.id;

        // parent message ID (main message)
        const parentMessageId = req.body.message.message_reference.message_id;

        // insert interaction (message) data to database
        await insertMessageData(
          db,
          messageId,
          req.body.channel.id,
          hostUserId,
          interactionToken
        );

        // create follow up message content
        const followUpMessageContent = {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: ``,
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: `cancel_game_agree_button_${gameId}_${messageId}_${parentMessageId}`,
                    style: 3,
                    emoji: {
                      id: null,
                      name: "✔️",
                    },
                  },
                  {
                    type: 2,
                    custom_id: `cancel_game_refuse_button`,
                    style: 4,
                    emoji: {
                      id: null,
                      name: "✖️",
                    },
                  },
                ],
              },
            ],
            embeds: [
              {
                type: "rich",
                title: "Are you sure you want to cancel this game?",
                description: ``,
                color: 0xff00bb,
              },
            ],
          },
        };

        await createMessage(
          interactionId,
          interactionToken,
          followUpMessageContent
        );
      }
    }
    // if clicked button is cancel_game_refuse_button -----------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("cancel_game_refuse_button")) {
      // get response token from original message
      const token = await getResponseToken(db, userId);

      // get this message's ID
      const messageId = req.body.message.id;

      // create upate message content
      const updateMessageContent = {
        data: {
          content: ``,
          flags: InteractionResponseFlags.EPHEMERAL,
          components: [],
          embeds: [
            {
              type: "rich",
              title: "This game has not been canceled!",
              description: ``,
              color: 0xff0000,
            },
          ],
        },
      };

      // update this message
      await updateFollowUpMessage(token, messageId, updateMessageContent);

      // delete message data from database
      await deleteMessageWithToken(db, userId);

      // send response to discord
      return res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });
    }
    // -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    // if clicked button is "cancel game agree" ----------------------------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("cancel_game_agree_button_")) {
      // create combi string with game ID and parent message ID
      const combiString = componentId.replace("cancel_game_agree_button_", "");

      // fetch game ID and parent message ID associated with this game
      const [gameId, parentMessageId, mainMessageId] = combiString.split("_");

      // get this active game's data
      const activeGameData = await getActiveGames(db, gameId);
      const hostUserId = activeGameData[0].host_user;

      // check if the person who clicks the button is the host
      /*const userIsHost = activeGameData.some(
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
      }*/
      // user who clicked "cancel" is host
      //else {
      // fetch response token from parent message ID from the Host User
      /*const responseTokenFromParentMessage = await getResponseToken(
          db,
          hostUserId
        );
        if (!responseTokenFromParentMessage) {
          console.error("No stored response token found from parent message");
          return;
        }*/

      // get response token
      const token = await getResponseToken(db, hostUserId);

      // get this message's ID
      const messageId = req.body.message.id;

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
      await DeleteFollowUpMessageNew(req.body.channel.id, parentMessageId);

      // update main message
      const updateMainMessageContent = {
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
      await updateMessageNew(
        req.body.channel.id,
        mainMessageId,
        updateMainMessageContent
      );

      // create upate message content
      const updateMessageContent = {
        data: {
          content: ``,
          flags: InteractionResponseFlags.EPHEMERAL,
          components: [],
          embeds: [
            {
              type: "rich",
              title: "This game has been canceled successfully!",
              description: ``,
              color: 0x008000,
            },
          ],
        },
      };

      // update this message
      await updateFollowUpMessage(token, messageId, updateMessageContent);

      // Delete the dataset with the message and token after updating the message (it's not needed anymore)
      await deleteMessageWithToken(db, hostUserId);

      // send response to discord
      return res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });
      //}
    }

    // end game button----------------------------------------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("end_game_button_")) {
      // fetch game ID associated with this button
      const gameId = componentId.replace("end_game_button_", "");

      // get this active game's data
      const activeGameData = await getActiveGames(db, gameId);
      const hostUserId = activeGameData[0].host_user;

      // check if the person who clicks the button is the host
      const userIsHost = activeGameData.some(
        (game) => game.host_user === userId
      );
      // user is not host
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

      // user is host
      else {
        // get interaction ID of this interaction (button)
        const interactionId = req.body.id;

        // get interaction token
        const interactionToken = req.body.token;

        // message ID of this message
        const messageId = req.body.message.id;

        // insert interaction (message) data to database
        await insertMessageData(
          db,
          messageId,
          req.body.channel.id,
          hostUserId,
          interactionToken
        );

        // create follow up message content
        const followUpMessageContent = {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: ``,
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: `end_game_agree_button_${gameId}_${messageId}`,
                    style: 3,
                    emoji: {
                      id: null,
                      name: "✔️",
                    },
                  },
                  {
                    type: 2,
                    custom_id: `end_game_refuse_button`,
                    style: 4,
                    emoji: {
                      id: null,
                      name: "✖️",
                    },
                  },
                ],
              },
            ],
            embeds: [
              {
                type: "rich",
                title:
                  "Are you sure that your game is finished and you want to end it?",
                description: ``,
                color: 0xff00bb,
              },
            ],
          },
        };

        await createMessage(
          interactionId,
          interactionToken,
          followUpMessageContent
        );
      }
    }

    // if clicked button is end_game_button_refuse -----------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("end_game_refuse_button")) {
      // get response token from original message
      const token = await getResponseToken(db, userId);

      // get this message's ID
      const messageId = req.body.message.id;

      // create upate message content
      const updateMessageContent = {
        data: {
          content: ``,
          flags: InteractionResponseFlags.EPHEMERAL,
          components: [],
          embeds: [
            {
              type: "rich",
              title: "This game has not been ended!",
              description: ``,
              color: 0xff0000,
            },
          ],
        },
      };

      // update this message
      await updateFollowUpMessage(token, messageId, updateMessageContent);

      // delete message data from database
      await deleteMessageWithToken(db, userId);

      // send response to discord
      return res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });
    }

    // if clicked button is "end game agree" ----------------------------------------------------------------------------------------------------------------------------------
    else if (componentId.startsWith("end_game_agree_button_")) {
      // fetch combi string with the parent message ID and game ID
      const combiString = componentId.replace("end_game_agree_button_", "");

      // extract game ID and parent message ID
      const [gameId, parentMessageId] = combiString.split("_");

      // get this active game's data
      const activeGameData = await getActiveGames(db, gameId);
      const hostUserId = activeGameData[0].host_user;

      // check if the person who clicks the button is the host
      /*const userIsHost = activeGameData.some(
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
      }*/
      // user who clicked "cancel" is host
      //else {
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
              description: `<@${hostUserId}> ended this game.\n\n**GG**\n\nUse the command /start to play again!`,
              color: 0xff00bb,
            },
          ],
        },
      };
      //await updateMessage(responseTokenFromParentMessage, updateParentMessageContent);
      await updateMessageNew(
        req.body.channel.id,
        parentMessageId,
        updateParentMessageContent
      );

      // fetch token from parent message
      const token = await getResponseToken(db, hostUserId);

      // fetch message ID of this message
      const messageId = req.body.message.id;

      // create upate message content
      const updateMessageContent = {
        data: {
          content: ``,
          flags: InteractionResponseFlags.EPHEMERAL,
          components: [],
          embeds: [
            {
              type: "rich",
              title: "This game has been ended successfully!",
              description: ``,
              color: 0x008000,
            },
          ],
        },
      };

      await updateFollowUpMessage(token, messageId, updateMessageContent);

      // Delete the dataset with the message and token after updating the message (it's not needed anymore)
      await deleteMessageWithToken(db, hostUserId);

      // send response to discord
      return res.send({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });
      //}
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
