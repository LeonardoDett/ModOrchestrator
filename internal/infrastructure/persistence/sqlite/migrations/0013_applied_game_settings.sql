-- What the app last wrote into a game settings file (D142): one record per
-- instance and feature module ("saves": the key that points the game at the
-- save folder of the active profile). Applied state, the evidence that
-- tells a value the app wrote from one written outside it.
CREATE TABLE applied_game_settings (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    owner       TEXT NOT NULL,
    body_json   TEXT NOT NULL,
    PRIMARY KEY (instance_id, owner)
);
