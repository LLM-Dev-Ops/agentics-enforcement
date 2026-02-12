/**
 * ExecutionIntent — Declares what the caller wants to execute.
 *
 * Canonical schema #1 of 6. Defined in the Contract Context (ADR-001).
 * This file MUST have zero imports from outside src/contracts/.
 */
import { z } from 'zod';

export const ExecutionIntentSchema = z.object({
  id: z.string().min(1),
  caller: z.string().min(1),
  action: z.string().min(1),
  target: z.string().min(1),
  parameters: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
  is_meta_simulation: z.boolean().default(false),
});

export type ExecutionIntent = z.infer<typeof ExecutionIntentSchema>;
