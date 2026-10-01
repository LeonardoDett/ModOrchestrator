-- Library (core/02, D064). Archives, mods and installations belong to an
-- instance; deleting the instance deletes its library records.
CREATE TABLE archives (
    id            TEXT PRIMARY KEY,
    instance_id   TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    kind          TEXT NOT NULL,
    size          INTEGER NOT NULL,
    hash          TEXT NOT NULL,
    stored        TEXT NOT NULL DEFAULT '',
    imported_at   TEXT NOT NULL
);

CREATE INDEX archives_hash_idx ON archives(instance_id, hash);

-- A mod is stored as one document (mod.Mod); state is a column so recovery
-- can find mods left installing without decoding every row.
CREATE TABLE mods (
    id          TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    state       TEXT NOT NULL,
    data_json   TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX mods_instance_idx ON mods(instance_id, state);

-- Installations are immutable; files are kept as one JSON list.
CREATE TABLE installations (
    id           TEXT PRIMARY KEY,
    mod_id       TEXT NOT NULL,
    instance_id  TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    installer    TEXT NOT NULL,
    options_json TEXT NOT NULL,
    files_json   TEXT NOT NULL,
    file_count   INTEGER NOT NULL,
    total_size   INTEGER NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE INDEX installations_mod_idx ON installations(mod_id);
CREATE INDEX installations_instance_idx ON installations(instance_id);

CREATE TABLE categories (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    id          TEXT NOT NULL,
    name        TEXT NOT NULL,
    parent      TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (instance_id, id)
);

-- Content intent of an instance (D026): rule and override sets are stored
-- as one document each; F5/F6 own their shape.
CREATE TABLE instance_rules (
    instance_id TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    data_json   TEXT NOT NULL
);

CREATE TABLE instance_overrides (
    instance_id TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    data_json   TEXT NOT NULL
);
