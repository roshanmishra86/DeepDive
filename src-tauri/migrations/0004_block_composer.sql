-- Block composer fields: one-line intent note, repeat cadence, optional
-- linked track, and a per-block "no notifications" flag.
ALTER TABLE day_block ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE day_block ADD COLUMN repeat TEXT NOT NULL DEFAULT 'once' CHECK (repeat IN ('once','daily','weekdays'));
ALTER TABLE day_block ADD COLUMN track_id INTEGER REFERENCES track(id) ON DELETE SET NULL;
ALTER TABLE day_block ADD COLUMN quiet INTEGER NOT NULL DEFAULT 0;
