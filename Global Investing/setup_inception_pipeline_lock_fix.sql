/* ============================================================
   GAMMAPACE - INTRADAY INCEPTION (sno=10) LOCK-TIMEOUT FIX
   ============================================================

   RUN THIS FILE ONCE IN THE SUPABASE SQL EDITOR
   (project: mushchoxbywxcpfmgavj -> SQL Editor -> paste -> RUN).
   Same procedure as setup_run_mapping_sqls.sql / supabase_gamma_engine.sql.
   Every step is idempotent - running it again is harmless.

   ------------------------------------------------------------
   SYMPTOM  (reported from Intraday_Inception.html)
     Error: Supabase RPC error: 500 -
       {"code":"55P03","details":null,"hint":null,
        "message":"canceling statement due to lock timeout"}

   ROOT CAUSE
     public.run_mapping_sql(p_title, p_sno) executes the WHOLE sno=10 script
     in ONE transaction.  That script starts with

         Truncate table inception_stock_intraday;   -- ACCESS EXCLUSIVE lock

     and the lock is held until the call returns (the same script also
     INSERTs into inception_stock_intraday_hist and can UPDATE
     gammapace_buy_sell_rules).  setup_run_mapping_sqls.sql sets

         ALTER FUNCTION public.run_mapping_sql(text, integer)
             SET lock_timeout = '10s';

     so as soon as a SECOND caller starts while a first run still holds that
     lock - a second browser tab / a phone / the "Retry" link / a manual run -
     the second TRUNCATE waits 10s and is cancelled with

         55P03  canceling statement due to lock timeout

     Reproduced 2026-09-28: the RPC returned the error after ~11.3s
     (10s lock wait + ~1s of work before the blocked statement), and the page
     refreshed every 3s, so the error reappeared continuously.
     Evidence in inception_stock_intraday_hist: successful runs land 3s apart
     (10 rows per timestamp) with occasional gaps when a run had to wait -
     i.e. several clients were driving the same ETL.

   ------------------------------------------------------------
   WHAT THIS SCRIPT DOES
     1. Gives run_mapping_sql a 60s lock timeout (statement timeout stays
        120s), so a queued run WAITS for the other run instead of failing.
     2. Prepends a transaction-level advisory lock to the sno=10 script:

            SELECT pg_advisory_xact_lock(100010);

        Advisory locks never conflict with ordinary table locks, so
        concurrent Inception runs now queue on one cheap lock and execute
        strictly one after another.  The lock is released automatically when
        the call's transaction ends (commit or rollback).
        Key 100010 = "Inception pipeline, mapping sno=10".
     3. Adds an index that keeps report reads over the append-only history
        table cheap.
     4. Prints verification output.

   NOTE  setup_run_mapping_sqls.sql also sets lock_timeout='10s'.  If that
   file is ever re-run, section 1 here is undone - just run this file again
   (or change section 4 of setup_run_mapping_sqls.sql to '60s').
   ============================================================ */


/* ------------------------------------------------------------
   1. FUNCTION-LEVEL TIMEOUTS
   ------------------------------------------------------------ */
ALTER FUNCTION public.run_mapping_sql(text, integer) SET lock_timeout = '60s';
ALTER FUNCTION public.run_mapping_sql(text, integer) SET statement_timeout = '120s';


/* ------------------------------------------------------------
   2. SERIALISE THE INCEPTION PIPELINE (mapping sno = 10)
      The guard makes this safe to re-run: the prefix is added once.
   ------------------------------------------------------------ */
UPDATE gammapace_internal_mapping
   SET sql = 'SELECT pg_advisory_xact_lock(100010);  /* serialise the Inception pipeline (sno=10) */'
             || chr(10) || sql
 WHERE sno = 10
   AND title = 'Intraday Inception stocks'
   AND sql NOT LIKE '%pg_advisory_xact_lock(100010)%';


/* ------------------------------------------------------------
   3. INDEX SUPPORT (recommended)
      inception_stock_intraday_hist is append-only (10 rows per run).
   ------------------------------------------------------------ */
CREATE INDEX IF NOT EXISTS idx_inception_stock_intraday_hist_ts
    ON public.inception_stock_intraday_hist (analysis_timestamp DESC);


/* ------------------------------------------------------------
   4. VERIFY
   ------------------------------------------------------------ */
-- 4a. Function-level timeouts: expect {statement_timeout=120s,lock_timeout=60s}
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'run_mapping_sql';

-- 4b. The sno=10 script must now start with the advisory lock
SELECT sno,
       title,
       left(btrim(sql), 60)              AS script_head,
       position('pg_advisory_xact_lock' in sql) > 0 AS has_advisory_lock
  FROM gammapace_internal_mapping
 WHERE sno = 10;
