-- =============================================================================
-- Vanilla Slops — schema snapshot
--
-- Captured from the live Supabase database on 2026-08-22 via section 10 of
-- docs/sql-snippets.sql, then converted from the SQL editor's JSON output into
-- runnable DDL.
--
-- WHY THIS FILE EXISTS
--
-- The DDL was deliberately removed from this repo in favour of the live
-- database being the source of truth. That is a reasonable decision right up
-- until the live database is the ONLY copy — and Supabase's Free plan has no
-- automated backups, so it was. `npm run db:backup` exports rows; it does not
-- export any of this. slop-scraper can regenerate every row given hours.
-- Nothing regenerates the view definitions, the trigger wiring, or the grants.
--
-- It contains no rows and no secrets, which is why it is safe in a public repo.
--
-- TO REGENERATE: run section 10 of docs/sql-snippets.sql and reconvert.
-- Take a fresh one after any change to a view, trigger, index or grant.
--
-- RESTORE ORDER is the order below: extensions, tables, constraints, indexes,
-- functions, triggers, views, then access control.
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), used by launch_options.id
-- levenshtein_less_equal(), used by fuzzy_game_titles() in section 5. Installed
-- into `extensions` rather than `public`, which is Supabase's default and the
-- reason that function sets an explicit search_path.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;


-- =============================================================================
-- 2. TABLES
--
-- Reconstructed from information_schema.columns. Constraints follow in
-- section 3 rather than inline, so this file restores in dependency order.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.games (
  app_id                 bigint NOT NULL,
  title                  text NOT NULL,
  developer              text,
  publisher              text,
  release_date           text,
  engine                 text,
  total_options_count    integer DEFAULT 0 NOT NULL,
  created_at             timestamp with time zone DEFAULT now() NOT NULL,
  updated_at             timestamp with time zone DEFAULT now() NOT NULL,
  engine_detail          text,
  engine_source          text,
  duplicate_of           bigint
);

CREATE TABLE IF NOT EXISTS public.launch_options (
  id                     uuid DEFAULT gen_random_uuid() NOT NULL,
  command                text NOT NULL,
  description            text,
  source                 text DEFAULT 'Community'::text NOT NULL,
  upvotes                integer DEFAULT 0 NOT NULL,
  downvotes              integer DEFAULT 0 NOT NULL,
  verified               boolean DEFAULT false NOT NULL,
  created_at             timestamp with time zone DEFAULT now() NOT NULL,
  risk_level             text DEFAULT 'experimental'::text NOT NULL,
  categories             text[] DEFAULT '{}'::text[] NOT NULL,
  engine_compatibility   text[] DEFAULT '{}'::text[] NOT NULL,
  source_url             text,
  last_verified_at       timestamp with time zone,
  verification_method    text,
  usage_example          text,
  effect                 text
);

CREATE TABLE IF NOT EXISTS public.game_launch_options (
  game_app_id            bigint NOT NULL,
  launch_option_id       uuid NOT NULL
);


-- =============================================================================
-- 3. CONSTRAINTS — primary keys, foreign keys, uniques, checks
-- =============================================================================

ALTER TABLE public.game_launch_options ADD CONSTRAINT game_launch_options_game_app_id_fkey FOREIGN KEY (game_app_id) REFERENCES games(app_id) ON DELETE CASCADE;
ALTER TABLE public.game_launch_options ADD CONSTRAINT game_launch_options_launch_option_id_fkey FOREIGN KEY (launch_option_id) REFERENCES launch_options(id) ON DELETE CASCADE;
ALTER TABLE public.game_launch_options ADD CONSTRAINT game_launch_options_pkey PRIMARY KEY (game_app_id, launch_option_id);
ALTER TABLE public.games ADD CONSTRAINT games_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES games(app_id);
ALTER TABLE public.games ADD CONSTRAINT games_duplicate_of_not_self CHECK (((duplicate_of IS NULL) OR (duplicate_of <> app_id)));
ALTER TABLE public.games ADD CONSTRAINT games_pkey PRIMARY KEY (app_id);
ALTER TABLE public.launch_options ADD CONSTRAINT launch_options_command_key UNIQUE (command);
ALTER TABLE public.launch_options ADD CONSTRAINT launch_options_pkey PRIMARY KEY (id);
ALTER TABLE public.launch_options ADD CONSTRAINT launch_options_risk_level_check CHECK ((risk_level = ANY (ARRAY['safe'::text, 'caution'::text, 'experimental'::text])));


-- =============================================================================
-- 4. INDEXES
--
-- The gin_trgm_ops indexes on title, developer and publisher are what make
-- ilike search fast. Losing them does not break correctness, it breaks
-- performance — the kind of regression that gets misdiagnosed for a week.
-- =============================================================================

CREATE UNIQUE INDEX game_launch_options_pkey ON public.game_launch_options USING btree (game_app_id, launch_option_id);
CREATE INDEX idx_glo_game ON public.game_launch_options USING btree (game_app_id);
CREATE INDEX idx_glo_option ON public.game_launch_options USING btree (launch_option_id);
CREATE UNIQUE INDEX games_pkey ON public.games USING btree (app_id);
CREATE INDEX idx_games_developer ON public.games USING btree (developer);
CREATE INDEX idx_games_title_compact ON public.games USING btree (regexp_replace(lower(title), '[^[:alnum:]]+'::text, ''::text, 'g'::text) text_pattern_ops);
CREATE INDEX idx_games_developer_trgm ON public.games USING gin (developer gin_trgm_ops);
CREATE INDEX idx_games_duplicate_of ON public.games USING btree (duplicate_of) WHERE (duplicate_of IS NOT NULL);
CREATE INDEX idx_games_engine ON public.games USING btree (engine);
CREATE INDEX idx_games_options ON public.games USING btree (total_options_count);
CREATE INDEX idx_games_publisher_trgm ON public.games USING gin (publisher gin_trgm_ops);
CREATE INDEX idx_games_title_trgm ON public.games USING gin (title gin_trgm_ops);
CREATE INDEX idx_launch_options_categories ON public.launch_options USING gin (categories);
CREATE INDEX idx_launch_options_last_verified_at ON public.launch_options USING btree (last_verified_at);
CREATE INDEX idx_launch_options_risk_level ON public.launch_options USING btree (risk_level);
CREATE UNIQUE INDEX launch_options_command_key ON public.launch_options USING btree (command);
CREATE UNIQUE INDEX launch_options_pkey ON public.launch_options USING btree (id);


-- =============================================================================
-- 5. FUNCTIONS — project-owned only
--
-- The ~31 pg_trgm functions returned by 10c are provided by the extension and
-- are omitted here, as are fuzzystrmatch's; CREATE EXTENSION in section 1
-- restores both sets.
--
-- game_suggestions() is the typeahead's PRIMARY pass, replacing the PostgREST
-- or-filter it used to issue. The reason it exists is its title arm: it matches
-- the punctuation-stripped title anchored to the start, so `stalker` reaches
-- S.T.A.L.K.E.R. and `fear` reaches F.E.A.R., neither of which plain ilike can
-- see. Anchoring is what keeps that from also matching 'art' inside 'War
-- Thunder'; the >= 3 length gate is what keeps 'c++' from compacting to 'c' and
-- matching every title beginning with that letter. Its supporting index is
-- idx_games_title_compact in section 4.
--
-- fuzzy_game_titles() backs the typeahead's "Did you mean…?" tier. It is
-- consulted only when game_suggestions() above returns nothing, which is why it
-- can afford a sequential scan. Two arms: a trigram word similarity for a typo
-- inside a long title, and an edit distance for the transpositions trigrams are
-- blind to. It carried a third — a punctuation-insensitive substring — until
-- game_suggestions() took that match into the primary pass, at which point
-- everything the unanchored version could still add was landing mid-word
-- ('test' matching '10 Minutes Till Dawn'). Measured at roughly 55-60 ms over
-- roughly 2,850 published games on 2026-08-22; re-measure past ~25,000 rows, where the fix is
-- an expression index on the normalised title plus the `<%` operator. Its
-- EXECUTE grant is in section 8 — without it PostgREST answers 404 for the rpc
-- path rather than a permission error.
--
-- rls_auto_enable() is a Supabase-managed event trigger that enables row level
-- security on every new table created in the public schema. It is why RLS was
-- already on when the access-control lockdown was applied. New tables therefore
-- arrive locked and need an explicit policy or grant to be readable.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.game_suggestions(q text, lim integer DEFAULT 30)
 RETURNS TABLE(value text, kind text, rank integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  WITH needle AS (
    SELECT
      lower(coalesce(q, '')) AS raw,
      -- escaped for LIKE: backslash first, or it would double the escapes it
      -- just introduced
      replace(replace(replace(lower(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') AS raw_like,
      regexp_replace(lower(coalesce(q, '')), '[^[:alnum:]]+', '', 'g') AS compact
  ),
  hits AS (
    SELECT g.title AS value, 'title'::text AS kind,
           CASE
             -- 0: the title starts with what was typed, punctuation aside
             WHEN length(n.compact) >= 3
              AND regexp_replace(lower(g.title), '[^[:alnum:]]+', '', 'g') LIKE n.compact || '%'
               THEN 0
             -- 1: a literal match at the very start
             WHEN lower(g.title) LIKE n.raw_like || '%' THEN 1
             -- 2: a literal match somewhere inside
             ELSE 2
           END AS rank
    FROM public.public_games g CROSS JOIN needle n
    WHERE g.title IS NOT NULL AND n.raw <> ''
      AND (
        lower(g.title) LIKE '%' || n.raw_like || '%'
        OR (length(n.compact) >= 3
            AND regexp_replace(lower(g.title), '[^[:alnum:]]+', '', 'g') LIKE n.compact || '%')
      )

    UNION ALL

    SELECT g.developer, 'developer'::text,
           CASE WHEN lower(g.developer) LIKE n.raw_like || '%' THEN 1 ELSE 2 END
    FROM public.public_games g CROSS JOIN needle n
    WHERE g.developer IS NOT NULL AND n.raw <> ''
      AND lower(g.developer) LIKE '%' || n.raw_like || '%'

    UNION ALL

    SELECT g.publisher, 'publisher'::text,
           CASE WHEN lower(g.publisher) LIKE n.raw_like || '%' THEN 1 ELSE 2 END
    FROM public.public_games g CROSS JOIN needle n
    WHERE g.publisher IS NOT NULL AND n.raw <> ''
      AND lower(g.publisher) LIKE '%' || n.raw_like || '%'
  ),
  -- One row per distinct spelling per kind. The caller folds harder than this
  -- (case, punctuation and padding all collapse there); this only keeps the
  -- result set from carrying one row per GAME for a studio with 40 of them.
  deduped AS (
    SELECT DISTINCT ON (kind, lower(value)) value, kind, rank
    FROM hits
    ORDER BY kind, lower(value), rank
  )
  SELECT d.value, d.kind, d.rank
  FROM deduped d
  ORDER BY d.rank, length(d.value), d.value
  LIMIT GREATEST(coalesce(lim, 30), 1)
$function$

CREATE OR REPLACE FUNCTION public.fuzzy_game_titles(q text, lim integer DEFAULT 5)
 RETURNS TABLE(title text, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  WITH needle AS (
    SELECT
      btrim(regexp_replace(lower(coalesce(q, '')), '[^[:alnum:]]+', ' ', 'g')) AS spaced,
      regexp_replace(lower(coalesce(q, '')), '[^[:alnum:]]+', '', 'g')          AS compact
  ),
  bounded AS (
    SELECT spaced, compact,
           CASE WHEN length(compact) >= 6 THEN 2 ELSE 1 END AS max_dist
    FROM needle
  ),
  matched AS (
    SELECT DISTINCT ON (t.compact)
           g.title,
           GREATEST(
             -- arm 1: trigram word similarity
             word_similarity(n.spaced, t.spaced),
             -- arm 2: edit distance, normalised by the NEEDLE rather than by
             -- the title. Dividing by the title length rewards longer titles
             -- for the same number of edits: 'portla' is two edits from both
             -- 'portal' and 'portal2', and title-normalising scored Portal 2
             -- (2/7) above Portal (2/6). Needle-normalising makes every row at
             -- the same distance tie, so the ORDER BY's shorter-title tiebreak
             -- decides — which is the answer a person would give.
             CASE WHEN d.dist <= n.max_dist
                  THEN 1.0 - d.dist::real / GREATEST(length(n.compact), 1)
                  ELSE 0 END
           )::real AS score,
           t.compact
    FROM public.public_games g
    CROSS JOIN bounded n
    CROSS JOIN LATERAL (
      SELECT btrim(regexp_replace(lower(g.title), '[^[:alnum:]]+', ' ', 'g')) AS spaced,
             regexp_replace(lower(g.title), '[^[:alnum:]]+', '', 'g')          AS compact
    ) t
    CROSS JOIN LATERAL (
      SELECT levenshtein_less_equal(n.compact, t.compact, n.max_dist) AS dist
    ) d
    WHERE g.title IS NOT NULL
      -- Under three characters there is no such thing as a confident guess:
      -- 'ha' is within one edit of a great many titles.
      AND length(n.compact) >= 3
      AND t.compact <> ''
      AND (
        word_similarity(n.spaced, t.spaced) >= 0.6
        OR d.dist <= n.max_dist
      )
    -- DISTINCT ON collapses titles differing only in punctuation, spacing or
    -- case, keeping the best-scoring spelling of each.
    ORDER BY t.compact, score DESC
  )
  SELECT m.title, m.score
  FROM matched m
  ORDER BY m.score DESC, length(m.title), m.title
  LIMIT GREATEST(coalesce(lim, 5), 1)
$function$

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$

CREATE OR REPLACE FUNCTION public.sync_options_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    update games
    set total_options_count = total_options_count + 1,
        updated_at          = now()
    where app_id = new.game_app_id;
  elsif tg_op = 'DELETE' then
    update games
    set total_options_count = greatest(total_options_count - 1, 0),
        updated_at          = now()
    where app_id = old.game_app_id;
  end if;
  return null;
end;
$function$

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$



-- =============================================================================
-- 6. TRIGGERS
--
-- These are the wiring. The functions in section 5 are inert without them, and
-- the failure mode if they are missing is silent: total_options_count simply
-- stops moving and every count on the site slowly becomes a lie.
--
-- Note what trg_sync_options_count does NOT cover: it fires on INSERT and
-- DELETE only, and sync_options_count() handles only those two branches. An
-- UPDATE that moved a junction row from one game_app_id to another would leave
-- both games' counts wrong, with nothing raised. That is not a bug today —
-- nothing issues such an UPDATE — but it is the reason the drift check in
-- section 3 of sql-snippets.sql exists, and why total_options_count must never
-- be written by hand: the trigger owns that column.
-- =============================================================================

CREATE TRIGGER trg_sync_options_count AFTER INSERT OR DELETE ON game_launch_options FOR EACH ROW EXECUTE FUNCTION sync_options_count();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- =============================================================================
-- 7. VIEWS
--
-- public_launch_options is the project's editorial rule expressed as SQL: an
-- option is publishable only if it is linked to at least one game AND carries
-- either a verification_method or a source_url. public_games hides rows that
-- are duplicates of another app_id.
-- =============================================================================

CREATE OR REPLACE VIEW public.public_games AS
 SELECT app_id,
    title,
    developer,
    publisher,
    release_date,
    engine,
    total_options_count,
    created_at,
    updated_at,
    engine_detail,
    engine_source,
    duplicate_of
   FROM games
  WHERE duplicate_of IS NULL;

CREATE OR REPLACE VIEW public.public_launch_options AS
 SELECT id,
    command,
    description,
    source,
    upvotes,
    downvotes,
    verified,
    created_at,
    risk_level,
    categories,
    engine_compatibility,
    source_url,
    last_verified_at,
    verification_method,
    usage_example,
    effect
   FROM launch_options lo
  WHERE (EXISTS ( SELECT 1
           FROM game_launch_options g
          WHERE g.launch_option_id = lo.id)) AND (NULLIF(TRIM(BOTH FROM COALESCE(verification_method, ''::text)), ''::text) IS NOT NULL OR NULLIF(TRIM(BOTH FROM COALESCE(source_url, ''::text)), ''::text) IS NOT NULL);


-- security_invoker is NOT part of pg_get_viewdef output, so it must be set
-- separately or the views silently revert to executing as the caller — which
-- would break them, because anon no longer holds SELECT on the base tables.

ALTER VIEW public.public_games SET (security_invoker = off);
ALTER VIEW public.public_launch_options SET (security_invoker = off);


-- =============================================================================
-- 8. ACCESS CONTROL — the state as of 2026-08-22
--
-- Captured immediately after the least-privilege lockdown in section 9 of
-- sql-snippets.sql. anon and authenticated can read the two curated views and
-- nothing else; the base tables are closed to them entirely.
--
-- RLS is enabled on all three base tables with NO policies. The three
-- permissive "public read" policies that previously granted USING(true) to
-- {public} were dropped, so a future accidental GRANT yields zero rows rather
-- than reopening the catalogue.
--
-- Do NOT add FORCE ROW LEVEL SECURITY. The views run with owner rights
-- (security_invoker=off) and the owner's RLS exemption is what lets them read.
--
-- -----------------------------------------------------------------------------
-- ON THE SUPABASE ADVISOR WARNING "Security Definer View" (CRITICAL)
--
-- Supabase's linter flags both views because security_invoker=off makes them
-- execute with the view owner's privileges rather than the caller's. The
-- warning is accurate about the property and correct as a general rule. It is a
-- false positive for this database, and the reasoning should outlive whoever
-- remembers setting it.
--
-- The linter's actual concern is that a definer view lets user A read user B's
-- rows by bypassing per-user RLS. This project has no accounts, no auth, no
-- per-user data and no user-scoped policies. There is no B.
--
-- More to the point, this setting is what CLOSES the hole rather than opening
-- one. The sequence:
--
--   - The view's WHERE clause IS the security boundary. public_launch_options
--     exists to withhold options with no provenance; public_games withholds
--     duplicate rows.
--   - anon was therefore revoked from all three base tables.
--   - With security_invoker=ON the view would execute as anon, which now holds
--     no SELECT on those tables, so the views would return permission denied.
--   - Satisfying the linter means granting anon SELECT on the raw tables again
--     and re-expressing the editorial rule as RLS policies — putting the same
--     rule in two places and reopening direct access to the base tables.
--
-- That trade is worse. One rule, one place, and the raw tables stay shut.
--
-- WHEN THIS STOPS BEING TRUE: the day this project grows accounts. If per-user
-- RLS is ever added to the base tables, these two views will bypass it
-- silently. At that point switch to security_invoker=on plus policies, and
-- accept the duplication.
--
-- A middle option if the warning is unwelcome but the design is not: reassign
-- the views to a role that can read only these three tables, instead of
-- postgres. Definer semantics are only as dangerous as the definer, and a
-- least-privileged owner shrinks the blast radius without changing behaviour.
-- -----------------------------------------------------------------------------
-- =============================================================================

REVOKE SELECT ON public.games               FROM anon, authenticated;
REVOKE SELECT ON public.launch_options      FROM anon, authenticated;
REVOKE SELECT ON public.game_launch_options FROM anon, authenticated;

GRANT SELECT ON public.public_games          TO anon, authenticated;
GRANT SELECT ON public.public_launch_options TO anon, authenticated;

-- The typeahead's "Did you mean…?" tier is reached through PostgREST as
-- /rest/v1/rpc/fuzzy_game_titles. Without EXECUTE, PostgREST answers 404 for
-- the path rather than a permission error, which reads as "the function does
-- not exist" and sends you looking in the wrong place.
GRANT EXECUTE ON FUNCTION public.fuzzy_game_titles(text, int)
  TO anon, authenticated, service_role;

ALTER TABLE public.games               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_options      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_launch_options ENABLE ROW LEVEL SECURITY;

-- Verified state at capture time (from 10g):

--   game_launch_options      table  anon=False auth=False svc=True  rls=True  forced=False
--   games                    table  anon=False auth=False svc=True  rls=True  forced=False
--   launch_options           table  anon=False auth=False svc=True  rls=True  forced=False
--   public_games             view   anon=True  auth=True  svc=True  rls=False forced=False
--   public_launch_options    view   anon=True  auth=True  svc=True  rls=False forced=False
