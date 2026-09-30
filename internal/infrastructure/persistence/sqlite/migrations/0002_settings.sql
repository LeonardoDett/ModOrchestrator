-- Settings: explicit values only. An absent row means the catalog default
-- (core/13); scope_id is empty for app-scoped settings.
CREATE TABLE settings (
    scope      TEXT NOT NULL,
    scope_id   TEXT NOT NULL DEFAULT '',
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope, scope_id, key)
);
