-- Deploy engine (F7, core/04, D035, D078). The placeholder manifest table of
-- F3 never had rows written; it is replaced by a header plus one row per
-- entry, so a deploy of one mod rewrites only the entries it changed and
-- the status reads only the header.
DROP TABLE deployment_manifests;

CREATE TABLE deployment_manifests (
    instance_id  TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    profile_id   TEXT NOT NULL,
    -- '' after a complete purge; 'partial:...' after an incomplete run.
    fingerprint  TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    applied_at   TEXT NOT NULL,
    entry_count  INTEGER NOT NULL
);

CREATE TABLE deployment_entries (
    instance_id     TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,
    location_key    TEXT NOT NULL,
    target          TEXT NOT NULL,
    path            TEXT NOT NULL,
    mod_id          TEXT NOT NULL DEFAULT '',
    installation_id TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT '',
    method          TEXT NOT NULL DEFAULT '',
    backup_path     TEXT NOT NULL DEFAULT '',
    evidence_json   TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (instance_id, kind, location_key)
);

-- The plan of a running deploy/purge (INV-DEP-03). Written before the first
-- filesystem change, deleted in the transaction that saves the manifest.
CREATE TABLE deployment_journals (
    instance_id  TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL,
    kind         TEXT NOT NULL,
    profile_id   TEXT NOT NULL,
    fingerprint  TEXT NOT NULL,
    started_at   TEXT NOT NULL
);

CREATE TABLE deployment_journal_actions (
    instance_id TEXT NOT NULL REFERENCES deployment_journals(instance_id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    action_json TEXT NOT NULL,
    state       TEXT NOT NULL,
    PRIMARY KEY (instance_id, idx)
);

-- What the adapter last wrote to the game's load order file (D040, F11).
CREATE TABLE applied_load_orders (
    instance_id TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    body_json   TEXT NOT NULL
);
