-- Plugin rules, groups and group assignments of an instance (F11, core/08
-- §6, D026). One document per instance, like instance_rules: the aggregate
-- is always read and written whole. Plugin states, the load order and
-- index locks live in the profile document.
CREATE TABLE instance_plugin_rules (
    instance_id TEXT PRIMARY KEY REFERENCES game_instances(id) ON DELETE CASCADE,
    data_json   TEXT NOT NULL
);
