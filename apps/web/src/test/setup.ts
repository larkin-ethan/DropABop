// Runs before every frontend test: adds DOM matchers (toBeInTheDocument, …) and unmounts components between tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
