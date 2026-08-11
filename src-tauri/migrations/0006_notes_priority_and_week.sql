-- Real priority column, backfilled from the Eisenhower quadrant once. From here
-- on priority is edited independently and cross-quadrant drags must not touch it.
ALTER TABLE task ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('high','medium','low'));

UPDATE task SET priority = CASE
  WHEN important = 1 AND urgent = 1 THEN 'high'
  WHEN important = 1 OR  urgent = 1 THEN 'medium'
  ELSE 'low' END;

-- Full ISO instant, same convention as task.due_at.
ALTER TABLE subtask ADD COLUMN due_at TEXT;

CREATE INDEX idx_subtask_due_at ON subtask(due_at);

-- Nullable; NULL = never edited. Must be written in the same UPDATE as `note`,
-- never separately, or "Last edited" stops being true.
ALTER TABLE day_block ADD COLUMN note_updated_at TEXT;

-- NOTE: the plan also listed `CREATE INDEX idx_day_block_day ON day_block(day)`
-- for listBlocksForRange. 0001_init.sql already creates that exact index
-- (line 95), so re-creating it here would abort the migration.

INSERT INTO setting (key, value) VALUES ('weeklyGoalMin', '1200')
  ON CONFLICT(key) DO NOTHING;
