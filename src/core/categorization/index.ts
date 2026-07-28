export {
  fingerprint,
  fingerprintLabel,
  tokenizeDescription,
  countPendingSameFingerprint,
  pendingLinesSameFingerprint,
} from './fingerprint';
export {
  indexRulesByFingerprint,
  resolveRule,
  categoryByLineFromRules,
  type CategorizationRuleLike,
} from './apply-rules';
