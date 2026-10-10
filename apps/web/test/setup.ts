import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The 1 s default is too short for a form submit when the runner is busy; a passing wait still returns at once.
configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);
