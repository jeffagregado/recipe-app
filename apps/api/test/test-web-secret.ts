/**
 * The web secret every test API and test web server runs with, set in the process environment so it overrides the env
 * file. Test callers send it with the client IP header, as the web app does, so each test keeps its own rate-limit bucket.
 */
export const TEST_WEB_SECRET = 'test-only-web-secret-not-used-anywhere-real';
