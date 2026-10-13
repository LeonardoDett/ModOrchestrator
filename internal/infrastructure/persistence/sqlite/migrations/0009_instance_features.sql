-- Optional features the user turned on or off for an instance (D115). A
-- feature with no row keeps its default. What is in effect is calculated
-- from the game definition and these rows, never stored.
CREATE TABLE instance_features (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    feature     TEXT NOT NULL,
    enabled     INTEGER NOT NULL,
    PRIMARY KEY (instance_id, feature)
);
