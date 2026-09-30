-- Game instances (D026, core/11): one row per managed installation. Targets
-- keep the order the adapter declared them (the first is the default one).
CREATE TABLE game_instances (
    id               TEXT PRIMARY KEY,
    game             TEXT NOT NULL,
    adapter          TEXT NOT NULL,
    adapter_version  TEXT NOT NULL DEFAULT '',
    display_name     TEXT NOT NULL,
    root             TEXT NOT NULL,
    staging          TEXT NOT NULL,
    archive_store    TEXT NOT NULL,
    backup_store     TEXT NOT NULL,
    preferred_method TEXT NOT NULL,
    store            TEXT NOT NULL DEFAULT '',
    executable       TEXT NOT NULL DEFAULT '',
    hidden           INTEGER NOT NULL DEFAULT 0,
    updated_at       TEXT NOT NULL
);

CREATE TABLE instance_targets (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    target_id   TEXT NOT NULL,
    path        TEXT NOT NULL,
    PRIMARY KEY (instance_id, target_id)
);

-- Profiles are stored as one document: the aggregate is always read and
-- written whole (profile.Data), and F5 owns its internal shape.
CREATE TABLE profiles (
    id          TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    data_json   TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX profiles_instance_idx ON profiles(instance_id);

-- Exactly one active profile per instance (INV-ORD-01, D037).
CREATE TABLE active_profiles (
    instance_id TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE profile_snapshots (
    id         TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data_json  TEXT NOT NULL
);

CREATE INDEX profile_snapshots_profile_idx ON profile_snapshots(profile_id, created_at);

-- Small application-level facts outside the settings catalog (active
-- instance, hidden games).
CREATE TABLE app_state (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Applied state of the deploy engine. Until F7 nothing writes it; the games
-- service only asks whether an instance has something deployed (a row with a
-- fingerprint; a purge leaves an empty fingerprint).
CREATE TABLE deployment_manifests (
    instance_id TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    body_json   TEXT NOT NULL,
    applied_at  TEXT NOT NULL
);
