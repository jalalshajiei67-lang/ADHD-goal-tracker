-- PriorityPulse schema. Run once in the Supabase SQL editor.

CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  push_subscription     JSONB,
  timezone              TEXT NOT NULL DEFAULT 'UTC',
  nightly_hour          INT  NOT NULL DEFAULT 21 CHECK (nightly_hour BETWEEN 0 AND 23),
  checkin_start_hour    INT  NOT NULL DEFAULT 8  CHECK (checkin_start_hour BETWEEN 0 AND 23),
  checkin_end_hour      INT  NOT NULL DEFAULT 20 CHECK (checkin_end_hour BETWEEN 1 AND 24),
  checkin_interval_min  INT  NOT NULL DEFAULT 30 CHECK (checkin_interval_min IN (15, 30, 60)),
  next_checkin_at       TIMESTAMPTZ,
  last_nightly_date     DATE,
  focus_until           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (checkin_start_hour < checkin_end_hour)
);

CREATE TABLE goal_days (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_date         DATE NOT NULL,
  nudge_sent_at     TIMESTAMPTZ,
  congrats_sent_at  TIMESTAMPTZ,
  summary_sent_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, goal_date)
);

CREATE TABLE goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_day_id   UUID NOT NULL REFERENCES goal_days(id) ON DELETE CASCADE,
  priority      INT  NOT NULL CHECK (priority BETWEEN 1 AND 5),
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  completed_at  TIMESTAMPTZ,
  carried_from  UUID REFERENCES goals(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goals_day_priority_uniq UNIQUE (goal_day_id, priority) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id       UUID REFERENCES goals(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  response      TEXT CHECK (response IN ('done', 'not_yet', 'snooze'))
);

CREATE INDEX idx_checkins_goal  ON checkins(goal_id, sent_at DESC);
CREATE INDEX idx_checkins_user  ON checkins(user_id, sent_at DESC);
CREATE INDEX idx_goal_days_user ON goal_days(user_id, goal_date DESC);

-- All access goes through the server with the service-role key, which bypasses RLS.
-- Enabling RLS with no policies locks out the public anon key entirely.
ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins  ENABLE ROW LEVEL SECURITY;

-- Replace a day's goal list in one transaction.
-- p_goals: ordered JSON array of {"id": uuid|null, "title": text}. Array order = priority.
-- Completed goals cannot be renamed or deleted; incomplete goals missing from the list are deleted.
CREATE FUNCTION save_goals(p_user UUID, p_date DATE, p_goals JSONB)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_day  UUID;
  v_item JSONB;
  v_pos  INT := 0;
  v_ids  UUID[];
BEGIN
  IF jsonb_array_length(p_goals) > 5 THEN
    RAISE EXCEPTION 'max 5 goals per day';
  END IF;

  INSERT INTO goal_days (user_id, goal_date) VALUES (p_user, p_date)
  ON CONFLICT (user_id, goal_date) DO UPDATE SET goal_date = EXCLUDED.goal_date
  RETURNING id INTO v_day;

  SELECT coalesce(array_agg((g->>'id')::uuid), '{}')
    INTO v_ids
    FROM jsonb_array_elements(p_goals) g
   WHERE g->>'id' IS NOT NULL;

  DELETE FROM goals
   WHERE goal_day_id = v_day AND completed_at IS NULL AND NOT (id = ANY (v_ids));

  -- Priorities may collide mid-loop; the unique constraint is deferred to commit.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_goals) LOOP
    v_pos := v_pos + 1;
    IF v_item->>'id' IS NULL THEN
      INSERT INTO goals (goal_day_id, priority, title)
      VALUES (v_day, v_pos, trim(v_item->>'title'));
    ELSE
      UPDATE goals
         SET priority = v_pos,
             title = CASE WHEN completed_at IS NULL THEN trim(v_item->>'title') ELSE title END
       WHERE id = (v_item->>'id')::uuid AND goal_day_id = v_day;
    END IF;
  END LOOP;

  -- Completed goals the client left out keep existing, appended after the list.
  UPDATE goals g SET priority = v_pos + s.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY priority) AS rn
        FROM goals
       WHERE goal_day_id = v_day AND NOT (id = ANY (v_ids)) AND completed_at IS NOT NULL
    ) s
   WHERE g.id = s.id;
END;
$$;

-- Copy a goal onto another day at the lowest priority.
-- Returns 'added', 'exists' (already carried there), 'full' or 'not_found'.
CREATE FUNCTION carry_goal(p_user UUID, p_goal UUID, p_date DATE)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_day   UUID;
  v_title TEXT;
  v_next  INT;
BEGIN
  SELECT g.title INTO v_title
    FROM goals g JOIN goal_days d ON d.id = g.goal_day_id
   WHERE g.id = p_goal AND d.user_id = p_user;
  IF v_title IS NULL THEN RETURN 'not_found'; END IF;

  INSERT INTO goal_days (user_id, goal_date) VALUES (p_user, p_date)
  ON CONFLICT (user_id, goal_date) DO UPDATE SET goal_date = EXCLUDED.goal_date
  RETURNING id INTO v_day;

  IF EXISTS (SELECT 1 FROM goals WHERE goal_day_id = v_day AND carried_from = p_goal) THEN
    RETURN 'exists';
  END IF;

  SELECT coalesce(max(priority), 0) + 1 INTO v_next FROM goals WHERE goal_day_id = v_day;
  IF v_next > 5 THEN RETURN 'full'; END IF;

  INSERT INTO goals (goal_day_id, priority, title, carried_from)
  VALUES (v_day, v_next, v_title, p_goal);
  RETURN 'added';
END;
$$;

-- RPCs are only for the server (service role), not the public API key.
REVOKE EXECUTE ON FUNCTION save_goals(UUID, DATE, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION carry_goal(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
