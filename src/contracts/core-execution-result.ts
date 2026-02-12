/**
 * CoreExecutionResult — Standardized result envelope from any Core.
 *
 * Canonical schema #3 of 6. Defined in the Contract Context (ADR-001).
 * This file MUST have zero imports from outside src/contracts/.
 */
import { z } from 'zod';
import { EvidenceSummarySchema } from './evidence-summary.js';
import { CostReferenceSchema } from './cost-reference.js';

export const ResultStatus = z.enum(['success', 'failure', 'partial']);
export type ResultStatus = z.infer<typeof ResultStatus>;

export const CoreExecutionResultSchema = z.object({
  core_name: z.string().min(1),
  execution_id: z.string().min(1),
  status: ResultStatus,
  evidence: EvidenceSummarySchema,
  cost_ref: CostReferenceSchema.nullable(),
  outputs: z.record(z.unknown()),
});
export type CoreExecutionResult = z.infer<typeof CoreExecutionResultSchema>;
