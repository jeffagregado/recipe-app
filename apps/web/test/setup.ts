import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The 1 s default is too short when the runner is busy: with one core shared by 16 busy threads, Save stayed disabled for
// up to 1.3 s after a save had answered. A passing wait still returns at once.
configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);
