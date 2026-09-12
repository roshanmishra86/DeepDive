-- Add GTD inbox groups, energy level, tags, time tracking, and carry-over state to day_block
ALTER TABLE day_block ADD COLUMN inbox_group TEXT NOT NULL DEFAULT 'capture';
ALTER TABLE day_block ADD COLUMN energy TEXT;
ALTER TABLE day_block ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE day_block ADD COLUMN logged_sec INTEGER NOT NULL DEFAULT 0;
ALTER TABLE day_block ADD COLUMN carried_over INTEGER NOT NULL DEFAULT 0;
ALTER TABLE day_block ADD COLUMN imported_from_todo INTEGER NOT NULL DEFAULT 0;

-- Add tags and energy to central task table
ALTER TABLE task ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE task ADD COLUMN energy TEXT;

-- Rapid lookup index for day + inbox group
CREATE INDEX idx_day_block_inbox_group ON day_block(day, inbox_group);
