/**
 * PolicyDecision — Result of policy evaluation (allow/deny + rationale).
 *
 * Canonical schema #5 of 6. Defined in the Contract Context (ADR-001).
 * This file MUST have zero imports from outside src/contracts/.
 */
import { z } from 'zod';

export const PolicyDecisionSchema = z.object({
  decision: z.enum(['allow', 'deny']),
  rationale: z.string(),
  rule_id: z.string().nullable(),
  evaluated_at: z.string().datetime(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
