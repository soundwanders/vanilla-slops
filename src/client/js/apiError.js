/**
 * @fileoverview What a visitor is told when a request to the API fails.
 *
 * The sentence is chosen from the HTTP status, never copied from the response
 * body. The body is whatever answered, and that is not always this site's API:
 * Vercel's firewall answers a refused request with a 20 KB HTML challenge
 * page, and the old code printed all of it under "Failed to Load Games". The
 * API's own errors fared no better: their `error` is an object, so they
 * printed "[object Object]" (both found 2026-11-14).
 */

export const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Please wait a minute and try again.';
export const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again in a moment.';
export const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';
export const REFUSED_MESSAGE = 'The request could not be completed.';

// The longest sentence the API writes for a visitor is well under this. The
// cap is what keeps a stray payload from becoming a wall of text.
const MAX_API_SENTENCE = 200;

/**
 * A request that failed in a way a visitor can be told about. `message` is
 * always one of the sentences above or the API's own, so it is safe to show.
 * `status` is the HTTP status, or 0 when no response arrived at all.
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * The sentence this API wrote for the visitor, if the body holds one. The API
 * answers `{ error: { code, message } }`; two older paths answer
 * `{ error: "..." }`.
 *
 * @param {string} body - raw response text
 * @returns {string} the sentence, or '' when there is none worth showing
 */
function apiSentence(body) {
  try {
    const error = JSON.parse(body)?.error;
    const sentence = typeof error === 'string' ? error : error?.message;
    return typeof sentence === 'string' && sentence.length <= MAX_API_SENTENCE ? sentence : '';
  } catch {
    return '';
  }
}

/**
 * Choose the sentence for a response that was not a success.
 *
 * Only a 4xx may speak in the API's own words: those are written for the
 * person who made the request ("Invalid game ID"). A 5xx never does, because
 * what a failing server says about itself is not for the page.
 *
 * @param {number} status - HTTP status of the response
 * @param {string} [body=''] - raw response text
 * @returns {string}
 */
export function messageForStatus(status, body = '') {
  if (status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  return apiSentence(body) || REFUSED_MESSAGE;
}

/**
 * Whether asking again could get a different answer. A dropped connection or
 * a failing server can recover; a refusal will be refused again, and a retry
 * of a rate-limited request only adds to the count that caused it.
 *
 * @param {ApiError} error
 * @returns {boolean}
 */
export function isRetryable(error) {
  return error.status === 0 || error.status >= 500;
}

/**
 * The text to put on the page for any error a load can throw. An ApiError
 * already carries a sentence written for the visitor. Anything else is a
 * defect in this code, and its message ("x is undefined") is for the console.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function visitorMessage(error) {
  return error instanceof ApiError ? error.message : SERVER_ERROR_MESSAGE;
}
