ALTER TABLE task ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task ADD COLUMN completed_at TEXT;
ALTER TABLE task ADD COLUMN archived_at TEXT;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY archived
      ORDER BY
        done ASC,
        CASE WHEN due_at IS NULL THEN 1 ELSE 0 END ASC,
        due_at ASC,
        id ASC
    ) - 1 AS position
  FROM task
)
UPDATE task
SET sort = (SELECT position FROM ranked WHERE ranked.id = task.id);

CREATE INDEX idx_task_archived_sort ON task(archived, sort);
CREATE INDEX idx_task_archived_at ON task(archived, archived_at);

CREATE TABLE subtask (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  estimate_min INTEGER NOT NULL CHECK (estimate_min BETWEEN 15 AND 1440),
  done INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_subtask_task_id_sort ON subtask(task_id, sort);

ALTER TABLE day_block
  ADD COLUMN subtask_id INTEGER REFERENCES subtask(id) ON DELETE SET NULL;

CREATE INDEX idx_day_block_subtask_id ON day_block(subtask_id);

DELETE FROM setting WHERE key = 'loopUntilBlockEnd';
INSERT INTO setting (key, value)
VALUES ('repeatMode', 'off')
ON CONFLICT(key) DO NOTHING;
