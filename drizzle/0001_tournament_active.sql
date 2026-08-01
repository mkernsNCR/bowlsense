-- Compatibility marker: fresh databases receive tournaments.active from 0000.
-- Legacy pre-migration databases are reconciled by the worker's guarded
-- PRAGMA check, avoiding a duplicate-column failure when they already have it.
SELECT 1;
