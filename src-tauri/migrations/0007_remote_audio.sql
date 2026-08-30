ALTER TABLE track ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'local'
  CHECK (source_kind IN ('builtin', 'local', 'radio', 'archive'));
ALTER TABLE track ADD COLUMN source_id TEXT;
ALTER TABLE track ADD COLUMN playback_url TEXT;
ALTER TABLE track ADD COLUMN creator TEXT;
ALTER TABLE track ADD COLUMN artwork_url TEXT;
ALTER TABLE track ADD COLUMN source_page_url TEXT;
ALTER TABLE track ADD COLUMN country TEXT;
ALTER TABLE track ADD COLUMN codec TEXT;
ALTER TABLE track ADD COLUMN bitrate INTEGER;
ALTER TABLE track ADD COLUMN license_url TEXT;
ALTER TABLE track ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';

UPDATE track SET source_kind = CASE
  WHEN path LIKE 'builtin:%' THEN 'builtin'
  ELSE 'local'
END;

CREATE UNIQUE INDEX track_remote_source_unique
  ON track(source_kind, source_id)
  WHERE source_kind IN ('radio', 'archive');

CREATE TRIGGER track_remote_source_required_insert
BEFORE INSERT ON track
WHEN NEW.source_kind IN ('radio', 'archive') AND (NEW.source_id IS NULL OR NEW.playback_url IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'remote tracks require source_id and playback_url');
END;

CREATE TRIGGER track_remote_source_required_update
BEFORE UPDATE OF source_kind, source_id, playback_url ON track
WHEN NEW.source_kind IN ('radio', 'archive') AND (NEW.source_id IS NULL OR NEW.playback_url IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'remote tracks require source_id and playback_url');
END;
