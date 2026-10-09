export type FavoriteResult = { ok: true } | { ok: false; reason: 'session-expired' | 'not-found' | 'failed' }

/** A confirmed delete redirects, so the only value that reaches the caller is a failure. */
export type DeleteResult = { ok: false; reason: 'session-expired' | 'failed' }
