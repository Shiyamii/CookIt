import { z } from 'zod';

// Zod probes `new Function()` to speed up validation; the CSP forbids eval, so every page load
// would report a violation. Validation works the same without it. This module must be imported
// before anything that builds schemas (@cookit/shared): the probe runs on first use.
z.config({ jitless: true });
