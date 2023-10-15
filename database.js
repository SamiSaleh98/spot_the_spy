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