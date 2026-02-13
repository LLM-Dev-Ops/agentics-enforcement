/**
 * ExecutionAcceptanceService — Mints execution IDs and creates Execution aggregates.
 * DDD-002: Domain Service  |  ADR-004: Sole minting authority
 *
 * This is the ONLY place in the entire fleet where execution_ids are created.
 *
 * accept() flow:
 *   1. Validate intent has required fields (lightweight — full enforcement already ran).
 *   2. Validate execution context (simulation_resolution, repo_name REQUIRED).
 *   3. Mint ExecutionId.
 *   4. Create root span metadata (atomically with ID).
 *   5. Create Execution aggregate in 'accepted' state.
 *   6. Register in repository.
 *   7. Emit ExecutionAccepted event.
 *   8. Return AcceptanceResponse.
 *
 * reject() flow:
 *   1. Emit ExecutionRejected event.
 *   2. Return RejectionResponse. No ID minted.
 */
import type { ExecutionIntent } from '../contracts/index.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import { mintExecutionId } from './execution-id.js';
import { createRootSpanMeta } from './root-span-meta.js';
import { createExecution } from './execution.js';
import type { AcceptanceResponse, RejectionResponse } from './acceptance-response.js';
import type { ExecutionRepository } from './execution-repository.js';
import type { EventBus } from '../domain/events/event-bus.js';
import { createExecutionAccepted, createExecutionRejected } from './execution-events.js';

export interface AcceptOptions {
  simulation_resolution: string;
  repo_name: string;
}

export class ExecutionAcceptanceService {
  constructor(
    private readonly repository: ExecutionRepository,
    private readonly eventBus: EventBus,
  ) {}

  accept(
    intent: ExecutionIntent,
    options: AcceptOptions,
    enforcementDecision?: EnforcementDecision | null,
  ): AcceptanceResponse {
    // Step 1: Lightweight structural check (full enforcement already ran at CLI gate).
    const validationError = this.validateMinimalFields(intent);
    if (validationError) {
      throw new Error(`Cannot accept intent: ${validationError}`);
    }

    // Step 2: Validate strict execution context fields
    if (!options.simulation_resolution) {
      throw new Error(
        `Cannot accept intent: simulation_resolution is required (intent_id: ${intent.id})`,
      );
    }
    if (!options.repo_name) {
      throw new Error(
        `Cannot accept intent: repo_name is required (intent_id: ${intent.id})`,
      );
    }

    // Step 3: Mint execution_id — THE SINGLE MINTING POINT (ADR-004)
    const executionId = mintExecutionId();

    // Step 4: Create root span metadata (atomic with ID)
    const rootSpan = createRootSpanMeta(
      executionId.value,
      intent.id,
      intent.caller,
    );

    // Step 5: Create Execution aggregate in 'accepted' state with strict context
    const execution = createExecution(
      executionId,
      intent,
      rootSpan,
      options.simulation_resolution,
      options.repo_name,
      enforcementDecision ?? null,
    );

    // Step 6: Register
    this.repository.save(execution);

    // Step 7: Emit ExecutionAccepted
    this.eventBus.emit(
      createExecutionAccepted(executionId.value, intent.id, rootSpan.span_id),
    );

    // Step 8: Return AcceptanceResponse
    return {
      execution_id: executionId.value,
      root_span_id: rootSpan.span_id,
      accepted: true,
      simulation_resolution: options.simulation_resolution,
      repo_name: options.repo_name,
    };
  }

  reject(intent: ExecutionIntent, reason: string): RejectionResponse {
    // No ID minted. No execution created.
    this.eventBus.emit(
      createExecutionRejected(intent.id, reason),
    );

    return {
      accepted: false,
      intent_id: intent.id,
      reason,
    };
  }

  private validateMinimalFields(intent: ExecutionIntent): string | null {
    if (!intent.id) return 'intent.id is required';
    if (!intent.caller) return 'intent.caller is required';
    if (!intent.action) return 'intent.action is required';
    if (!intent.target) return 'intent.target is required';
    return null;
  }
}
