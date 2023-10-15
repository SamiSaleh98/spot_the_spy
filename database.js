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
            response_token TEXT
        )
    `);
}

// get active game
export async function getActiveGames(db) {
  return new Promise((resolve, reject) => {
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
export async function insertMessageData(db, messageId, responseToken) {
  db.run(
    "INSERT INTO messages (message_id, response_token) VALUES (?, ?)",
    [messageId, responseToken],
    (err) => {
      if (err) {
        console.error("Error inserting message data:", err);
      } else {
        console.log("Message data inserted successfully!");
      }
    }
  );
}

// get response token from message ID
export async function getResponseToken(db, messageId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT response_token FROM messages WHERE message_id = ?",
      [messageId],
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
