// Create active_games, joined_users, and messages if they don't exist
export async function createInitialTables(db) {
  db.run(`
        CREATE TABLE IF NOT EXISTS active_games (
          game_id TEXT PRIMARY KEY,
          host_user TEXT,
          max_players INTEGER
        )
    `);

  db.run(`
        CREATE TABLE IF NOT EXISTS joined_users (
            game_id TEXT,
            username TEXT,
            FOREIGN KEY (game_id) REFERENCES active_games (game_id)
        )
    `);

  db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            message_id INTEGER PRIMARY KEY,
            host_user TEXT,
            response_token TEXT,
            FOREIGN KEY (host_user) REFERENCES active_games (host_user)
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
        }));
        console.log("Select from getActiveGames successful!");
        resolve(games);
      }
    });
  } else {
    db.all("SELECT * FROM active_games WHERE game_id = ?", [gameId], (err, rows) => {
      if (err) {
        console.error("Error fetching active games:", err);
        reject(err);
      } else {
        const games = rows.map((row) => ({
          game_id: row.game_id,
          host_user: row.host_user,
          max_players: row.max_players,
        }));
        console.log("Select from getActiveGames successful!");
        resolve(games);
      }
    });
  }
  });
}

// insert active game to active_games
export async function insertActiveGame(db, gameId, hostUserId, maxPlayers) {
  db.run(
    "INSERT INTO active_games (game_id, host_user, max_players) VALUES (?, ?, ?)",
    [gameId, hostUserId, maxPlayers],
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
export async function deleteJoinedUsers(db, gameId) {
  db.run("DELETE FROM joined_users WHERE game_id = ?",
  [gameId],
  (err) => {
    if (err) {
      console.error("Error deleting joined users:", err);
    } else {
      console.log("Delete joined users successfull!");
    }
  }
  );
}
