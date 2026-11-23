// The desktop app's CSP forbids `eval`; zod would probe for it (harmlessly, but the probe is
// reported as a CSP violation). Jitless mode skips the probe. Imported first by every entry.
import { z } from 'zod';

z.config({ jitless: true });
