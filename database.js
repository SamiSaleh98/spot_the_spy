import { shuffleArray } from "./utils.js";

// Create active_games, joined_users, and messages if they don't exist
export async function createInitialTables(db) {
  db.run(`
        CREATE TABLE IF NOT EXISTS active_games (
          game_id TEXT PRIMARY KEY,
          host_user TEXT,
          max_players INTEGER,
          message_id TEXT,
          selected_location TEXT,
          FOREIGN KEY (message_id) REFERENCES messages (message_id)
        )
    `);

  db.run(`
        CREATE TABLE IF NOT EXISTS joined_users (
            game_id TEXT,
            username TEXT,
            role_id INTEGER,
            FOREIGN KEY (game_id) REFERENCES active_games (game_id),
            FOREIGN KEY (role_id) REFERENCES roles (role_id)
        )
    `);

  db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY,
            channel_id TEXT,
            host_user TEXT,
            response_token TEXT,
            FOREIGN KEY (host_user) REFERENCES active_games (host_user)
        )
    `);

  db.run(`
    CREATE TABLE IF NOT EXISTS roles (
        role_id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_name TEXT
    )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS active_games_locations (
        game_id TEXT,
        location_name TEXT,
        FOREIGN KEY (game_id) REFERENCES active_games (game_id)
    )
`);

  db.run(`
CREATE TABLE IF NOT EXISTS active_games_locations_mole (
    game_id TEXT,
    location_name TEXT,
    FOREIGN KEY (game_id) REFERENCES active_games (game_id)
)
`);
}

// get active game (optional parameter gameID => either get all active games, or an active with a specified game ID)
export async function getActiveGames(db, gameId = null) {
  return new Promise((resolve, reject) => {
    if (!gameId) {
      db.all("SELECT * FROM active_games", [], (err, rows) => {
        if (err) {
          console.error("Error fetching active games:", err);
          reject(err);
        } else {
          const games = rows.map((row) => ({
            game_id: row.game_id,
            host_user: row.host_user,
            max_players: row.max_players,
            message_id: row.message_id,
          }));
          console.log("Select from getActiveGames successful!");
          resolve(games);
        }
      });
    } else {
      db.all(
        "SELECT * FROM active_games WHERE game_id = ?",
        [gameId],
        (err, rows) => {
          if (err) {
            console.error("Error fetching active games:", err);
            reject(err);
          } else {
            const games = rows.map((row) => ({
              game_id: row.game_id,
              host_user: row.host_user,
              max_players: row.max_players,
              message_id: row.message_id,
            }));
            console.log("Select from getActiveGames successful!");
            resolve(games);
          }
        }
      );
    }
  });
}

// insert active game to active_games
export async function insertActiveGame(
  db,
  gameId,
  hostUserId,
  maxPlayers,
  messageId
) {
  db.run(
    "INSERT INTO active_games (game_id, host_user, max_players, message_id) VALUES (?, ?, ?, ?)",
    [gameId, hostUserId, maxPlayers, messageId],
    (err) => {
      if (err) {
        console.error("Error inserting game data:", err);
      } else {
        console.log("Game data inserted successfully!");
      }
    }
  );
}

// insert message data to messages
export async function insertMessageData(
  db,
  messageId,
  hostUserId,
  responseToken
) {
  db.run(
    "INSERT INTO messages (message_id, host_user, response_token) VALUES (?, ?, ?)",
    [messageId, hostUserId, responseToken],
    (err) => {
      if (err) {
        console.error("Error inserting message data:", err);
      } else {
        console.log("Message data inserted successfully!");
      }
    }
  );
}

// get response token from message ID and Hostuser ID
export async function getResponseToken(db, hostUserId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT response_token FROM messages WHERE host_user = ?",
      [hostUserId],
      (err, row) => {
        if (err) {
          console.error("Error retrieving response token:", err);
          reject(err);
        } else if (row) {
          resolve(row.response_token);
        } else {
          resolve(null);
          console.log("No response token found for this message ID");
        }
      }
    );
  });
}

// delete active game from active_games
export async function deleteActiveGame(db, gameId, hostUserId) {
  db.run(
    "DELETE FROM active_games WHERE game_id = ? AND host_user = ?",
    [gameId, hostUserId],
    (err) => {
      if (err) {
        console.error("Error deleting active game", err);
      } else {
        console.log("Deleting from active_games successfull!");
      }
    }
  );
}

// delete message with token from messages table
export async function deleteMessageWithToken(db, hostUserId) {
  db.run("DELETE FROM messages WHERE host_user = ?", [hostUserId], (err) => {
    if (err) {
      console.error("Error deleting message dataset!", err);
    } else {
      console.log("Delete from messages successfull!");
    }
  });
}

// insert joined user to the joined_users table
export async function insertJoinedUser(db, gameId, userId) {
  db.run(
    "INSERT INTO joined_users (game_id, username) VALUES (?, ?)",
    [gameId, userId],
    (err) => {
      if (err) {
        console.error("Error inserting joined user:", err);
      } else {
        console.log("Inserting joined user successfull habibi!!!");
      }
    }
  );
}

// get joined users from joined_users table
export async function getJoinedUsers(db, gameId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT username FROM joined_users WHERE game_id = ?",
      [gameId],
      (err, rows) => {
        if (err) {
          console.error("Error fetched joined users:", err);
          reject(err);
        } else {
          const users = rows.map((row) => ({
            username: row.username,
          }));
          console.log("Select joined users successfull!");
          resolve(users);
        }
      }
    );
  });
}

// delete joined users after canceling game
export async function deleteJoinedUsers(db, gameId, userId = null) {
  if (!userId) {
    db.run("DELETE FROM joined_users WHERE game_id = ?", [gameId], (err) => {
      if (err) {
        console.error("Error deleting joined users:", err);
      } else {
        console.log("Delete joined users successfull!");
      }
    });
  } else {
    db.run(
      "DELETE FROM joined_users WHERE game_id = ? AND username = ?",
      [gameId, userId],
      (err) => {
        if (err) {
          console.error("Error deleting joined user:", err);
        } else {
          console.log("Delete joined user successfull!");
        }
      }
    );
  }
}

// get message ID
export async function GetMessageId(db, hostUserId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT message_id FROM messages WHERE host_user = ?",
      [hostUserId],
      (err, row) => {
        if (err) {
          console.error("Error retrieving message ID:", err);
          reject(err);
        } else if (row) {
          resolve(row.message_id);
        } else {
          resolve(null);
          console.log("No message ID found for this User");
        }
      }
    );
  });
}

export async function assignRoleToUser(db, gameId, userId, roleId) {
  db.run(
    "UPDATE joined_users SET role_id = ? WHERE game_id = ? AND username = ?",
    [roleId, gameId, userId],
    (err) => {
      if (err) {
        console.error("Error updating joined users:", err);
      } else {
        console.log("Updating joined users with the role ID successfull!");
      }
    }
  );
}

export async function getUserRole(db, gameId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT role_name FROM roles INNER JOIN joined_users ON roles.role_id = joined_users.role_id WHERE joined_users.game_id = ? AND joined_users.username = ?",
      [gameId, userId],
      (err, row) => {
        if (err) {
          console.error("Error retrieving role name:", err);
          reject(err);
        } else if (row) {
          console.log("fetching role_name successfull");
          resolve(row.role_name);
        } else {
          resolve(null);
          console.log("No role name found!");
        }
      }
    );
  });
}

// insert locations into database (active_games_locations)
export async function insertLocations(db, gameId, locations) {
  locations.forEach(async (location) => {
    try {
      await db.run(
        "INSERT INTO active_games_locations (game_id, location_name) VALUES (?, ?)",
        [gameId, location]
      );
    } catch (err) {
      console.error("Error inserting locations:", err);
    }
  });
}

// assign 1 location to the active game
export async function assignLocationToGame(db, gameId, locations) {
  const shuffledLocations = await shuffleArray(locations);
  const selectedLocation = shuffledLocations[0];

  db.run(
    "UPDATE active_games SET selected_location = ? WHERE game_id = ?",
    [selectedLocation, gameId],
    (err) => {
      if (err) {
        console.error("Error assigning random location:", err);
      } else {
        console.log("Assigning random location successfull!");
      }
    }
  );
}

// get locations
export async function getLocations(db, gameId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT location_name FROM active_games_locations WHERE game_id = ?",
      [gameId],
      (err, rows) => {
        if (err) {
          console.error("Error fetching location names:", err);
          reject(err);
        } else {
          const locations = rows.map((row) => ({
            location_name: row.location_name,
          }));
          console.log("Fetching locations successfull!");
          resolve(locations);
        }
      }
    );
  });
}

// get selected location
export async function getSelectedLocation(db, gameId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT selected_location FROM active_games WHERE game_id = ?",
      [gameId],
      (err, row) => {
        if (err) {
          console.error("Error selecting selected location:", err);
          reject(err);
        } else if (row) {
          console.log("Selecting selected role successfull");
          resolve(row.selected_location);
        } else {
          console.log("No selected location assigned yet!");
          resolve(null);
        }
      }
    );
  });
}

// delete locations from the locations table
export async function deleteLocations(db, gameId) {
  db.run(
    "DELETE FROM active_games_locations WHERE game_id = ?",
    [gameId],
    (err) => {
      if (err) {
        console.error("Error deleting locations:", err);
      } else {
        console.log("Deleting locations successfull!");
      }
    }
  );
}

// insert mole locations into database (active_games_locations_mole)
/*export async function insertMoleLocations(db, gameId, locations) {
  if (Symbol.iterator in Object(locations)) {
  for (const location of locations) {
    try {
      await db.run(
        "INSERT INTO active_games_locations_mole (game_id, location_name) VALUES (?, ?)",
        [gameId, location]
      );
    } catch (err) {
      console.error("Error inserting mole locations:", err);
    }
  }
}
}*/
export async function insertMoleLocations(db, gameId, locations) {
  locations.forEach(async (location) => {
    try {
      await db.run(
        "INSERT INTO active_games_locations_mole (game_id, location_name) VALUES (?, ?)",
        [gameId, location]
      );
    } catch (err) {
      console.error("Error inserting mole locations:", err);
    }
  });
}

// get 3 random locations for the mole
export async function get3RandomLocations(db, gameId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT location_name FROM active_games_locations WHERE game_id = ? ORDER BY RANDOM() LIMIT 3",
      [gameId],
      (err, rows) => {
        if (err) {
          console.error("Error fetching mole location names:", err);
          reject(err);
        } else {
          const locations = rows.map((row) => ({
            location_name: row.location_name,
          }));
          console.log("Fetching mole locations successfull!");
          resolve(locations);
        }
      }
    );
  });
}

// get mole locations
export async function getMoleLocations(db, gameId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT location_name FROM active_games_locations_mole WHERE game_id = ?",
      [gameId],
      (err, rows) => {
        if (err) {
          console.error("Error fetching mole location names:", err);
          reject(err);
        } else {
          const locations = rows.map((row) => ({
            location_name: row.location_name,
          }));
          console.log("Fetching mole locations successfull!");
          resolve(locations);
        }
      }
    );
  });
}

// delete locations from the mole locations table
export async function deleteMoleLocations(db, gameId) {
  db.run(
    "DELETE FROM active_games_locations_mole WHERE game_id = ?",
    [gameId],
    (err) => {
      if (err) {
        console.error("Error deleting mole locations:", err);
      } else {
        console.log("Deleting mole locations successfull!");
      }
    }
  );
}

// get the username of the second spy
export async function getSecondSpy(db, gameId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT username FROM joined_users WHERE game_id = ? AND role_id = 2 and username <> ?",
      [gameId, userId],
      (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(row.username);
        } else {
          resolve(null);
        }
      }
    );
  });
}
