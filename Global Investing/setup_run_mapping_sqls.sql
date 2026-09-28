-- =====================================================================
--  GammaPace — setup_run_mapping_sqls.sql
--  Installs / REPAIRS  public.run_mapping_sql(title, sno)
--
--  WHY THIS FILE EXISTS
--  --------------------
--  The deployed public.run_mapping_sql(text, integer) executes the
--  stored script but returns "[]" instead of the rows of the final
--  SELECT — for EVERY sno, not just one.  Verified 2026-09-28:
--
--    sno=8  ("Time Now", whole script = "select now();")
--           -> HTTP 200, body []
--    sno=10 ("Intraday Inception stocks", 24.7s, table rewritten)
--           -> HTTP 200, body []
--    sno=6  ("Intraday Trend Analyis", 10s)
--           -> HTTP 200, body []
--
--  so the report pages had no way to obtain rows.  The version below
--  splits the script safely (line/block comments, single- and
--  double-quoted text, dollar-quoted bodies), executes every statement
--  in order, and returns the rows of the last row-returning statement
--  as a jsonb array — which is what the pages already expect.
--
--  RUN ONCE in the Supabase SQL Editor.  Safe to re-run (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Statement splitter
--    Comments are DISCARDED (so the leading keyword of each statement is
--    detectable) but never inside string literals / quoted identifiers.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gp_split_statements(p_sql text)
RETURNS SETOF text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  i           int := 1;
  n           int := length(p_sql);
  cur         text := '';
  ch          text;
  two         text;
  dollar_tag  text := NULL;
  st          int := 0;   -- 0 normal, 1 line cmt, 2 block cmt, 3 '', 4 "", 5 $$
  block_depth int := 0;
BEGIN
  IF p_sql IS NULL THEN
    RETURN;
  END IF;

  WHILE i <= n LOOP
    ch  := substr(p_sql, i, 1);
    two := substr(p_sql, i, 2);

    -- ---- inside a -- line comment: skip to end of line ----
    IF st = 1 THEN
      IF ch = E'\n' THEN
        cur := cur || ' ';
        st  := 0;
      END IF;
      i := i + 1;
      CONTINUE;

    -- ---- inside a /* */ block comment: skip, honouring nesting ----
    ELSIF st = 2 THEN
      IF two = '/*' THEN
        block_depth := block_depth + 1;
        i := i + 2;
        CONTINUE;
      ELSIF two = '*/' THEN
        block_depth := block_depth - 1;
        i := i + 2;
        IF block_depth <= 0 THEN
          st  := 0;
          cur := cur || ' ';
        END IF;
        CONTINUE;
      END IF;
      i := i + 1;
      CONTINUE;

    -- ---- inside a 'single quoted' literal ('' escapes a quote) ----
    ELSIF st = 3 THEN
      IF two = '''''' THEN
        cur := cur || '''''';
        i := i + 2;
        CONTINUE;
      ELSIF ch = '''' THEN
        cur := cur || ch;
        st  := 0;
        i := i + 1;
        CONTINUE;
      END IF;
      cur := cur || ch;
      i := i + 1;
      CONTINUE;

    -- ---- inside a "quoted identifier" ("" escapes a quote) ----
    ELSIF st = 4 THEN
      IF two = '""' THEN
        cur := cur || '""';
        i := i + 2;
        CONTINUE;
      ELSIF ch = '"' THEN
        cur := cur || ch;
        st  := 0;
        i := i + 1;
        CONTINUE;
      END IF;
      cur := cur || ch;
      i := i + 1;
      CONTINUE;

    -- ---- inside a $tag$ ... $tag$ dollar-quoted body ----
    ELSIF st = 5 THEN
      IF substr(p_sql, i, length(dollar_tag)) = dollar_tag THEN
        cur := cur || substr(p_sql, i, length(dollar_tag));
        i    := i + length(dollar_tag);
        st   := 0;
        CONTINUE;
      END IF;
      cur := cur || ch;
      i := i + 1;
      CONTINUE;
    END IF;

    -- ================= scanning in the normal state =================
    IF two = '--' THEN
      st := 1;
      i  := i + 1;

    ELSIF two = '/*' THEN
      st          := 2;
      block_depth := 1;
      i           := i + 2;

    ELSIF ch = '''' THEN
      cur := cur || ch;
      st  := 3;
      i   := i + 1;

    ELSIF ch = '"' THEN
      cur := cur || ch;
      st  := 4;
      i   := i + 1;

    ELSIF ch = '$' THEN
      IF substr(p_sql, i) ~ '^\$[A-Za-z_][A-Za-z_0-9]*\$' THEN
        dollar_tag := substr(p_sql, i);
      ELSIF substr(p_sql, i, 2) = '$$' THEN
        dollar_tag := '$$';
      ELSE
        dollar_tag := NULL;
      END IF;
      cur := cur || ch;
      IF dollar_tag IS NOT NULL THEN
        st := 5;
      END IF;
      i  := i + 1;

    ELSIF ch = ';' THEN
      IF btrim(cur) <> '' THEN
        RETURN NEXT btrim(cur);
      END IF;
      cur := '';
      i   := i + 1;

    ELSE
      cur := cur || ch;
      i   := i + 1;
    END IF;
  END LOOP;

  IF btrim(cur) <> '' THEN
    RETURN NEXT btrim(cur);
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.gp_split_statements(text) IS
  'Split a SQL script into statements, ignoring comments and semicolons inside quotes/dollar-quotes.';


-- ---------------------------------------------------------------------
-- 2. The repaired runner
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_mapping_sql(p_title text, p_sno integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout     = '60s'
SET statement_timeout = '300s'
AS $fn$
DECLARE
  v_sql          text;
  v_stmt         text;
  v_rows         jsonb := '[]'::jsonb;
  v_keyword      text;
  v_stmt_count   int := 0;
BEGIN
  SELECT m.sql INTO v_sql
  FROM public.gammapace_internal_mapping m
  WHERE m.title = p_title
    AND m.sno   = p_sno;

  IF v_sql IS NULL OR btrim(v_sql) = '' THEN
    RAISE EXCEPTION 'No SQL found in gammapace_internal_mapping for title=% and sno=%',
      p_title, p_sno USING ERRCODE = 'P0001';
  END IF;

  FOR v_stmt IN SELECT public.gp_split_statements(v_sql) LOOP
    v_stmt_count := v_stmt_count + 1;
    v_keyword    := upper(substr(ltrim(v_stmt), 1, 12));

    IF v_keyword LIKE 'SELECT%' OR v_keyword LIKE 'WITH%'
       OR v_keyword LIKE 'VALUES%' OR v_keyword LIKE 'TABLE%' THEN

      -- Row-returning statement: keep its rows as the result.
      BEGIN
        EXECUTE 'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM ('
                || v_stmt || ') t'
          INTO v_rows;
      EXCEPTION WHEN OTHERS THEN
        -- e.g. a data-modifying CTE that cannot be sub-queried:
        -- fall back to running it as a plain command.
        EXECUTE v_stmt;
      END;

    ELSE
      -- TRUNCATE / INSERT / UPDATE / DELETE / CREATE / DDL
      EXECUTE v_stmt;
    END IF;
  END LOOP;

  IF v_stmt_count = 0 THEN
    RAISE EXCEPTION 'The script for title=% and sno=% contained no statements.',
      p_title, p_sno USING ERRCODE = 'P0001';
  END IF;

  RETURN v_rows;
END;
$fn$;

COMMENT ON FUNCTION public.run_mapping_sql(text, integer) IS
  'Executes the stored script statement-by-statement and returns the rows of its final SELECT as jsonb.';


-- ---------------------------------------------------------------------
-- 3. Grants (the pages call this with the anon key)
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.run_mapping_sql(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_split_statements(text)          TO anon, authenticated;
