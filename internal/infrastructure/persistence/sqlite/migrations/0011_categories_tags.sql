-- Category look and tag definitions (D123). Colors are palette ids and icons
-- icon ids; both optional. Tags are defined per instance; mods keep the
-- names they carry in their document.
ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT '';

CREATE TABLE tags (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    name        TEXT NOT NULL COLLATE NOCASE,
    color       TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (instance_id, name)
);
