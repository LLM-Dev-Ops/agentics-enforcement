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
 *   2. Validate execution context fields (simulation_resolution, repo_name REQUIRED).
 *   3. On parse failure → reject with 400.
 *   4. Run enforcement gate (ADR-003).
 *   5. On enforcement block → reject with 403.
 *   6. On enforcement allow → delegate to ExecutionAcceptanceService.accept().
 *   7. Return AcceptanceResponse with 201.
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

    // Step 2b: Validate required execution context fields from request body metadata
    const simulation_resolution = this.extractStringField(req.body, 'simulation_resolution');
    const repo_name = this.extractStringField(req.body, 'repo_name');

    if (!simulation_resolution) {
      return {
        status: 400,
        body: { error: 'simulation_resolution is required in execution context' },
      };
    }
    if (!repo_name) {
      return {
        status: 400,
        body: { error: 'repo_name is required in execution context' },
      };
    }

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

    // Step 5: Allowed → delegate to acceptance service with decision + context attached
    const acceptance = this.acceptanceService.accept(
      intent,
      { simulation_resolution, repo_name },
      gateResult.decision,
    );

    // Step 6: Return 201
    return {
      status: 201,
      body: acceptance,
    };
  }

  private extractStringField(body: unknown, field: string): string | undefined {
    if (body && typeof body === 'object' && field in body) {
      const value = (body as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }
}
