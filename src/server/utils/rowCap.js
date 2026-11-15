/**
 * @fileoverview The database's row cap, and the guard that makes running into
 * it loud.
 *
 * Supabase answers any read with at most MAX_ROWS rows ("Max rows" in the
 * project's API settings). Past that it does not fail. It returns the first
 * MAX_ROWS rows with an ordinary 200, and a `.limit()` above the cap is quietly
 * lowered to it. A figure computed from such a read is wrong in a way that
 * looks right: the options-range facet counted 1,000 games in a catalogue of
 * 3,064 (found 2026-11-14), and the edge cached it like any true answer.
 *
 * The response does say so, in its Content-Range header, and only there. Every
 * read reports the rows it returned (`0-999/*`); a read that asked for no
 * `limit`, or for more than came back, and still got a full MAX_ROWS rows was
 * cut short. Measured against the live database 2026-11-14:
 *
 *   unpaged select            200  0-999/*      cut short
 *   .limit(2000)              200  0-999/*      cut short
 *   .range(1000, 1999)        200  1000-1999/*  limit=1000, complete page
 *   .range(3000, 3999)        200  3000-3071/*  the last page
 *   past the end              200  * / *        no rows
 *   count, head: true         206  0-999/3072   HEAD: no rows travel
 *
 * guardRowCap() reads that one header on every response and turns a short read
 * into a failed one. Callers then see an ordinary `{ error }`, which is what a
 * read the code cannot stand behind should be (CLAUDE.md: a failed read fails
 * the request). The body is never parsed, so the guard costs a header lookup
 * on a normal response.
 *
 * Kept free of the Supabase client and of error reporting so it can be tested
 * on its own, and so instrument.js can import RowCapError without a cycle.
 */

/**
 * The project's "Max rows" setting. If that setting is ever lowered, lower this
 * with it, or reads between the two values go back to being cut short silently.
 * Raising the setting needs no change here: a read of MAX_ROWS or more rows with
 * no `limit` is refused either way, because it is one table-growth away from
 * being cut short.
 */
export const MAX_ROWS = 1000;

/** The `code` a short read reports in place of PostgREST's own. */
export const ROW_CAP_CODE = 'ROW_CAP_EXCEEDED';

const FIX_HINT = 'Page the read with fetchAllRows() in gamesService.js, or count it '
  + "with { count: 'exact', head: true }.";

/** A read the server cut short. A defect in the code that issued it. */
export class RowCapError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RowCapError';
  }
}

const RETURNED_ROWS = /^(\d+)-(\d+)\//;

/**
 * Decide whether a response is a read the server cut short.
 *
 * @param {{method?: string, url: string, status: number, contentRange: string|null}} response
 * @returns {string|null} what was cut short, or null for a complete read. The
 *   description names the method and path only, never the query string, which
 *   can carry what a visitor typed.
 */
export function truncatedRead({ method = 'GET', url, status, contentRange }) {
  const verb = method.toUpperCase();
  // A count asks with HEAD and reports a range, but no rows travel.
  if (verb === 'HEAD') return null;
  if (status !== 200 && status !== 206) return null;

  const match = RETURNED_ROWS.exec(contentRange ?? '');
  if (!match) return null; // `*/*`: nothing matched

  const first = Number(match[1]);
  const last = Number(match[2]);
  if (last - first + 1 < MAX_ROWS) return null;

  // Only now is the URL worth parsing. `limit` is the top-level parameter;
  // an embedded resource's own limit arrives as `<table>.limit` and is not it.
  const parsed = new URL(url);
  const asked = parsed.searchParams.get('limit');
  if (asked !== null && Number(asked) <= last - first + 1) return null;

  const path = parsed.pathname.replace(/^\/rest\/v1/, '');
  const request = asked === null ? 'with no limit' : `for a limit of ${asked}`;
  return `${verb} ${path} was cut short at rows ${first}-${last} (the ${MAX_ROWS}-row cap), asked ${request}`;
}

/**
 * Wrap a fetch so that a read the server cut short comes back as an error.
 *
 * The replacement is a 500 in PostgREST's error shape, so supabase-js hands it
 * to the caller as `{ error }` with no change on their side. It must not be a
 * thrown error, a 503 or a 520: supabase-js retries all three, three times
 * with backoff, and the answer would be the same each time.
 *
 * @param {typeof fetch} [fetchImpl]
 * @param {{onTruncated?: (error: RowCapError) => void}} [options]
 * @returns {typeof fetch}
 */
export function guardRowCap(fetchImpl = (...args) => globalThis.fetch(...args), { onTruncated } = {}) {
  return async function rowCapGuardedFetch(input, init) {
    const res = await fetchImpl(input, init);

    const finding = truncatedRead({
      method: init?.method ?? input?.method,
      url: typeof input === 'string' ? input : (input?.url ?? String(input)),
      status: res.status,
      contentRange: res.headers.get('content-range'),
    });
    if (!finding) return res;

    // Release the connection the unread body would otherwise hold.
    await res.body?.cancel().catch(() => {});

    const error = new RowCapError(finding);
    try {
      onTruncated?.(error);
    } catch {
      // Reporting must never change what the caller is told.
    }

    return new Response(JSON.stringify({
      code: ROW_CAP_CODE,
      message: finding,
      details: null,
      hint: FIX_HINT,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
