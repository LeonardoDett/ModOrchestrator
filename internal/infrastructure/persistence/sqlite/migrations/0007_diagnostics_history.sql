-- F9: diagnostics delivery state, notifications and the history projection
-- (core/10). Diagnostics themselves are calculated and never stored.

-- Suppressed diagnostics: by key or by code ("não mostrar este tipo").
CREATE TABLE diagnostic_suppressions (
    key        TEXT NOT NULL DEFAULT '',
    code       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (key, code)
);

-- Diagnostics present at the last evaluation of an instance and since when
-- (a warning notifies once when it appears; "novo desde a última visita").
CREATE TABLE diagnostic_presence (
    instance_id TEXT NOT NULL,
    key         TEXT NOT NULL,
    code        TEXT NOT NULL,
    severity    TEXT NOT NULL,
    first_seen  TEXT NOT NULL,
    PRIMARY KEY (instance_id, key)
);

CREATE TABLE notifications (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    ref          TEXT NOT NULL,
    code         TEXT NOT NULL,
    params_json  TEXT NOT NULL,
    subject_kind TEXT NOT NULL DEFAULT '',
    subject_id   TEXT NOT NULL DEFAULT '',
    instance_id  TEXT NOT NULL DEFAULT '',
    severity     TEXT NOT NULL DEFAULT '',
    count        INTEGER NOT NULL,
    state        TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE INDEX notifications_ref_idx ON notifications(ref, updated_at DESC);
CREATE INDEX notifications_updated_idx ON notifications(updated_at DESC);

-- History filters by game: every event records the instance it is about,
-- resolved when it is stored (the mod or profile may be gone later).
ALTER TABLE events ADD COLUMN instance_id TEXT NOT NULL DEFAULT '';

UPDATE events SET instance_id = COALESCE(
    CASE WHEN subject_kind = 'instance' THEN subject_id END,
    json_extract(payload_json, '$.instance'),
    (SELECT instance_id FROM mods WHERE mods.id = events.subject_id AND events.subject_kind = 'mod'),
    (SELECT instance_id FROM profiles WHERE profiles.id = events.subject_id AND events.subject_kind = 'profile'),
    (SELECT subject_id FROM operations WHERE operations.id = events.operation_id AND operations.subject_kind = 'instance'),
    '');

CREATE INDEX events_instance_idx ON events(instance_id, seq);
CREATE INDEX events_occurred_idx ON events(occurred_at);
