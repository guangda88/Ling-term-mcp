/**
 * Pipeline Factory
 * Assembles the default 灵犀 command pipeline.
 * Branch: replaceable, configurable. Trunk unchanged.
 */

import { CommandPipeline } from './command_pipeline.js';
import { identityCheck } from '../middleware/identity.js';
import { lengthCheck } from '../middleware/length.js';
import { patternCheck } from '../middleware/pattern.js';
import { blacklistCheck } from '../middleware/blacklist.js';
import { whitelistCheck } from '../middleware/whitelist.js';
import { redZoneAuth } from '../middleware/redzone.js';
import { commandExecutor } from '../middleware/executor.js';
import { auditLogger } from '../middleware/audit.js';
import { performanceTracker } from '../middleware/perf.js';

export function buildDefaultPipeline(): CommandPipeline {
  return new CommandPipeline()
    .use(identityCheck)
    .use(lengthCheck)
    .use(patternCheck)
    .use(blacklistCheck)
    .use(whitelistCheck)
    .use(redZoneAuth)
    .setForward(commandExecutor)
    .onComplete(auditLogger)
    .onComplete(performanceTracker);
}

export const defaultPipeline = buildDefaultPipeline();
