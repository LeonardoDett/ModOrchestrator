-- Decisions about external changes that outlive a scan (F8, core/09 §4,
-- D046): a generated file the user chose to leave unmanaged is never
-- listed as unexpected again. The divergences themselves are calculated
-- and never stored.
CREATE TABLE external_unmanaged (
    instance_id  TEXT NOT NULL REFERENCES game_instances(id) ON DELETE CASCADE,
    location_key TEXT NOT NULL,
    target       TEXT NOT NULL,
    path         TEXT NOT NULL,
    decided_at   TEXT NOT NULL,
    PRIMARY KEY (instance_id, location_key)
);
