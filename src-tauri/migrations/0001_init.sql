CREATE TABLE task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  important INTEGER NOT NULL DEFAULT 0,
  urgent INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  estimate_min INTEGER,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE day_block (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  task_id INTEGER REFERENCES task(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deep','shallow','ritual','break')),
  start_min INTEGER NOT NULL,
  duration_min INTEGER NOT NULL,
  pomodoros INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_min INTEGER NOT NULL,
  weekdays INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE template_block (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES template(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deep','shallow','ritual','break')),
  start_min INTEGER NOT NULL,
  duration_min INTEGER NOT NULL,
  pomodoros INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ritual (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ritual_log (
  day TEXT NOT NULL,
  ritual_id INTEGER NOT NULL REFERENCES ritual(id) ON DELETE CASCADE,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ritual_id)
);

CREATE TABLE pomodoro_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER REFERENCES day_block(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('focus','rest')),
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE day_note (
  day TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE distraction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE track (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  duration_sec INTEGER
);

CREATE TABLE setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_day_block_day ON day_block(day);
CREATE INDEX idx_day_block_day_sort ON day_block(day, sort);
CREATE INDEX idx_day_block_task_id ON day_block(task_id);
CREATE INDEX idx_template_block_template_id_sort ON template_block(template_id, sort);
CREATE INDEX idx_ritual_log_day ON ritual_log(day);
CREATE INDEX idx_distraction_day ON distraction(day);
CREATE INDEX idx_pomodoro_session_block_id ON pomodoro_session(block_id);
CREATE INDEX idx_pomodoro_session_started_at ON pomodoro_session(started_at);
CREATE INDEX idx_task_archived_done ON task(archived, done);
