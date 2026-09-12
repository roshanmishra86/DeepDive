-- Migration 0009: Add GTD template metadata and template block tag
ALTER TABLE template ADD COLUMN category TEXT NOT NULL DEFAULT 'work';
ALTER TABLE template ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE template ADD COLUMN favourite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE template ADD COLUMN last_used_at TEXT;
ALTER TABLE template ADD COLUMN destination TEXT NOT NULL DEFAULT 'inbox';
ALTER TABLE template ADD COLUMN icon TEXT NOT NULL DEFAULT 'target';

ALTER TABLE template_block ADD COLUMN tag TEXT NOT NULL DEFAULT '';

-- Update existing Maker Day seed to have GTD attributes
UPDATE template SET
  category = 'work',
  tags = 'Deep Work,Work',
  favourite = 1,
  icon = 'target',
  destination = 'inbox'
WHERE name = 'Maker Day';

UPDATE template_block SET tag = 'Setup' WHERE title = 'Morning pages';
UPDATE template_block SET tag = 'Deep Work' WHERE title = 'Deep block — main project';
UPDATE template_block SET tag = 'Break' WHERE title = 'Walk & reset';
UPDATE template_block SET tag = 'Deep Work' WHERE title = 'Deep block — secondary';
UPDATE template_block SET tag = 'Productivity' WHERE title = 'Shut Down Ritual';
