-- The executable of a user game lives in its entry manifest (D117, D136).
-- Instances of user entries no longer keep a copy; the column stays for
-- instances from before D117 that were not migrated to an entry.
UPDATE game_instances SET executable = '' WHERE game LIKE 'user.%';
