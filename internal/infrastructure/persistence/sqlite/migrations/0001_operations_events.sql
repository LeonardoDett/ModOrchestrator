-- Operations: long-running, traceable executions.
CREATE TABLE operations (
    id               TEXT PRIMARY KEY,
    kind             TEXT NOT NULL,
    status           TEXT NOT NULL,
    subject_kind     TEXT NOT NULL DEFAULT '',
    subject_id       TEXT NOT NULL DEFAULT '',
    steps_json       TEXT NOT NULL,
    current_step     TEXT NOT NULL DEFAULT '',
    progress_current INTEGER NOT NULL DEFAULT 0,
    progress_total   INTEGER NOT NULL DEFAULT 0,
    error_json       TEXT,
    created_at       TEXT NOT NULL,
    started_at       TEXT,
    finished_at      TEXT,
    updated_at       TEXT NOT NULL
);

CREATE INDEX operations_status_idx ON operations(status);
CREATE INDEX operations_created_idx ON operations(created_at DESC);

-- Events: append-only record of facts. operation_id is nullable because
-- future modules may emit events that are not tied to an operation.
CREATE TABLE events (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    id           TEXT NOT NULL UNIQUE,
    type         TEXT NOT NULL,
    occurred_at  TEXT NOT NULL,
    operation_id TEXT REFERENCES operations(id) ON DELETE CASCADE,
    subject_kind TEXT NOT NULL DEFAULT '',
    subject_id   TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL
);

CREATE INDEX events_operation_idx ON events(operation_id, seq);
CREATE INDEX events_subject_idx ON events(subject_kind, subject_id, seq);
