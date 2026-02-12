/**
 * CostReference — Opaque cost handle. Never raw numbers outside CostOps.
 *
 * Canonical schema #6 of 6. Defined in the Contract Context (ADR-001).
 * This file MUST have zero imports from outside src/contracts/.
 */
import { z } from 'zod';

export const CostReferenceSchema = z.object({
  ref_id: z.string().min(1),
  computed_at: z.string().datetime(),
});
export type CostReference = z.infer<typeof CostReferenceSchema>;
