/**
 * POST /v1/executions/accept — HTTP handler for the ruvector acceptance endpoint.
 * ADR-004: The sole entry point for execution_id minting.
 * ADR-003: Enforcement gate runs before acceptance.
 *
 * This is a framework-agnostic handler. It receives a parsed request body
 * and returns a structured response. Adapter code (Express, Fastify, etc.)
 * wraps this handler for the specific HTTP framework.
 *
 * Flow:
 *   1. Parse/validate the request body as ExecutionIntent (via Zod).
 *   2. On parse failure → reject with 400.
 *   3. Run enforcement gate (ADR-003).
 *   4. On enforcement block → reject with 403.
 *   5. On enforcement allow → delegate to ExecutionAcceptanceService.accept().
 *   6. Return AcceptanceResponse with 201.
 */
import { ExecutionIntentSchema, type ExecutionIntent } from '../contracts/index.js';
import { ExecutionAcceptanceService } from '../execution/execution-acceptance-service.js';
import type { AcceptResult } from '../execution/acceptance-response.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { EnforcementGate } from '../enforcement-gate/enforcement-gate.js';

export interface HandlerRequest {
  body: unknown;
}

export interface EnforcementBlockedResponse {
  readonly accepted: false;
  readonly intent_id: string;
  readonly reason: string;
  readonly enforcement_decision: EnforcementDecision;
}

export interface HandlerResponse {
  status: number;
  body: AcceptResult | EnforcementBlockedResponse | { error: string; details?: unknown };
}

export class AcceptHandler {
  constructor(
    private readonly acceptanceService: ExecutionAcceptanceService,
    private readonly enforcementGate: EnforcementGate,
  ) {}

  handle(req: HandlerRequest): HandlerResponse {
    // Step 1: Parse the request body as ExecutionIntent
    const parseResult = ExecutionIntentSchema.safeParse(req.body);

    if (!parseResult.success) {
      // Step 2: Parse failure → 400
      const intent = req.body as Partial<ExecutionIntent> | undefined;
      const intentId = (intent && typeof intent === 'object' && 'id' in intent)
        ? String(intent.id)
        : '(unknown)';

      const rejection = this.acceptanceService.reject(
        { id: intentId, caller: '', action: '', target: '', parameters: {}, metadata: {}, is_meta_simulation: false },
        `Invalid ExecutionIntent: ${parseResult.error.issues.map((i) => i.message).join('; ')}`,
      );

      return {
        status: 400,
        body: rejection,
      };
    }

    const intent = parseResult.data;

    // Step 3: Enforcement gate — ADR-003
    const gateResult = this.enforcementGate.evaluate(intent);

    if (!gateResult.allowed) {
      // Step 4: Enforcement blocked → 403 (fail closed)
      return {
        status: 403,
        body: {
          accepted: false,
          intent_id: intent.id,
          reason: gateResult.decision.block_reason?.message ?? 'Blocked by enforcement gate',
          enforcement_decision: gateResult.decision,
        },
      };
    }

    // Step 5: Allowed → delegate to acceptance service with decision attached
    try {
      const acceptance = this.acceptanceService.accept(intent, gateResult.decision);

      // Step 6: Return 201
      return {
        status: 201,
        body: acceptance,
      };
    } catch (err) {
      return {
        status: 500,
        body: { error: err instanceof Error ? err.message : 'Internal error' },
      };
    }
  }
}
