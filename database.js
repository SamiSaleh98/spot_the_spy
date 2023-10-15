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
        CREATE TABLE IF NOT EXISTS response_token (
            response_id INTEGER PRIMARY KEY,
            token TEXT
        )
    `);
}