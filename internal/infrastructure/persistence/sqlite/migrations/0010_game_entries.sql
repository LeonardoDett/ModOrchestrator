-- Games described by the user (D117): one manifest per game, the same
-- document that is exported to a file. The registry mirrors this table.
CREATE TABLE game_entries (
    id            TEXT PRIMARY KEY,
    manifest_json TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
