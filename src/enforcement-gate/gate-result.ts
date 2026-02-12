/**
 * GateResult — Value object returned by EnforcementGate.evaluate().
 * ADR-003: CLI Enforcement Gate
 */
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { ExecutionIntent } from '../contracts/index.js';

export interface GateResult {
  readonly allowed: boolean;
  readonly decision: EnforcementDecision;
  readonly intent: ExecutionIntent;
}
