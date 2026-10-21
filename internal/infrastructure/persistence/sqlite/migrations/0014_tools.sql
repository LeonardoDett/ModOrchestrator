-- External tools of an instance (D146): what the user registered to start
-- from the app, in the order of the list. Desired state the user owns; the
-- body is the tool as JSON (executable, arguments, folder, environment,
-- icon, exclusive, deploy before, known tool it came from).
CREATE TABLE tools (
    instance_id TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    id          TEXT NOT NULL,
    position    INTEGER NOT NULL,
    body_json   TEXT NOT NULL,
    PRIMARY KEY (instance_id, id)
);
