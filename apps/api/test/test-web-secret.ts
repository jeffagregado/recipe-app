/**
 * The web secret every test API and test web server runs with, set in the process environment so it overrides the env
 * file. Test callers send it with the client IP header, as the web app does, so each test keeps its own rate-limit bucket.
 */
export const TEST_WEB_SECRET = 'test-only-web-secret-not-used-anywhere-real';

/** How the web app names the user's IP to the API: the client IP header, trusted only next to the web secret. */
export const clientHeaders = (address: string) => ({ 'X-Recipe-Web-Secret': TEST_WEB_SECRET, 'X-Recipe-Client-IP': address });
