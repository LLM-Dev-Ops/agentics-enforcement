/**
 * EvidenceSummary — Audit trail / proof-of-work from execution.
 *
 * Canonical schema #4 of 6. Defined in the Contract Context (ADR-001).
 * This file MUST have zero imports from outside src/contracts/.
 */
import { z } from 'zod';

export const EvidenceEntrySchema = z.object({
  timestamp: z.string().datetime(),
  layer: z.string().min(1),
  action: z.string().min(1),
  detail: z.record(z.unknown()),
});
export type EvidenceEntry = z.infer<typeof EvidenceEntrySchema>;

export const EvidenceSummarySchema = z.object({
  execution_id: z.string().min(1),
  entries: z.array(EvidenceEntrySchema),
});
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;
