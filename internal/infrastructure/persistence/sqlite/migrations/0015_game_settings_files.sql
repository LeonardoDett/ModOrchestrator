-- The game_settings feature (LV8): settings files of the game kept per
-- profile and the INI tweaks of the mods.
--
-- What the app last put in a whole settings file (applied state): whose
-- copy is in the game and the shared file waiting while it is.
CREATE TABLE applied_game_setting_files (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    path        TEXT NOT NULL COLLATE NOCASE,
    body_json   TEXT NOT NULL,
    PRIMARY KEY (instance_id, path)
);

-- The copy of a settings file each profile keeps (desired state).
CREATE TABLE profile_game_settings (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    path       TEXT NOT NULL COLLATE NOCASE,
    present    INTEGER NOT NULL,
    content    BLOB,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, path)
);

-- The INI tweaks of a mod the user turned on (desired state).
CREATE TABLE ini_tweak_choices (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    mod_id      TEXT NOT NULL,
    path        TEXT NOT NULL,
    PRIMARY KEY (instance_id, mod_id, path)
);
