-- Per-day shutdown time override, in minutes-of-day (e.g. 1200 = 8:00 PM).
-- NULL means no per-day override — fall back to the global `shutdownMin` setting.
ALTER TABLE day_note ADD COLUMN shutdown_min INTEGER;
