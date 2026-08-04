INSERT INTO ritual (title, active, sort) VALUES
  ('Morning pages', 1, 0),
  ('Phone in drawer', 1, 1),
  ('Shut down ritual', 1, 2);

INSERT INTO template (name, description, start_min, weekdays) VALUES
  ('Maker Day', '2 long blocks · minimal shallow work', 300, 21);

INSERT INTO template_block (template_id, title, kind, start_min, duration_min, pomodoros, sort)
  SELECT t.id, 'Morning pages', 'ritual', 300, 30, 0, 0
  FROM template t WHERE t.name = 'Maker Day'
  UNION ALL
  SELECT t.id, 'Deep block — main project', 'deep', 330, 90, 3, 1
  FROM template t WHERE t.name = 'Maker Day'
  UNION ALL
  SELECT t.id, 'Walk & reset', 'break', 420, 30, 0, 2
  FROM template t WHERE t.name = 'Maker Day'
  UNION ALL
  SELECT t.id, 'Deep block — secondary', 'deep', 450, 60, 2, 3
  FROM template t WHERE t.name = 'Maker Day'
  UNION ALL
  SELECT t.id, 'Shut Down Ritual', 'ritual', 780, 5, 0, 4
  FROM template t WHERE t.name = 'Maker Day';

INSERT INTO setting (key, value) VALUES
  ('accent', 'green'),
  ('timerStyle', 'ring'),
  ('repeatStyle', 'chip'),
  ('volume', '0.7'),
  ('fadeInSec', '8'),
  ('silenceDuringRest', '1'),
  ('loopUntilBlockEnd', '1');
