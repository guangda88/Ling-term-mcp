/**
 * L7/L10 Layer Module Barrel Export
 * Cross-session memory bridge, trust anchor, and operation gate.
 */

export {
  L7Bridge,
  l7Bridge,
  type L7MemoryEntry,
  type L7Message,
  type L7ExtractedInfo,
  type L7ProcessResult,
  type L7Stats,
} from './l7_bridge.js';

export {
  detectIdentityDrift,
  detectIdentityDriftMulti,
  verifyClaim,
  getTrustScore,
  isValidMember,
  getClaimPatterns,
  getIdentityDriftPatterns,
  type DriftResult,
  type ClaimPattern,
  type VerifyClaimResult,
  type TrustScoreResult,
} from './l10_trust_anchor.js';

export {
  isProtected as isProtectedFile,
  requiresSource,
  checkWrite,
  getProtectedPatterns,
  getRequireSourcePatterns,
  type GateCheckResult,
  type WriteIntent,
} from './l10_operation_gate.js';
