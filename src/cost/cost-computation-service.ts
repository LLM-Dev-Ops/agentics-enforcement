/**
 * CostComputationService — Sole authority for cost calculations.
 * DDD-004 / ADR-007: Only this service may compute costs or resolve CostReferences.
 *
 * calculateCost() returns an opaque CostReference (ref_id + computed_at).
 * resolveCostReference() returns a full CostDetail with breakdown.
 */
import type { CostReference } from '../contracts/index.js';
import type { CostParameters } from './cost-computation.js';
import { createCostComputation, completeCostComputation } from './cost-computation.js';
import type { CostComputationRepository } from './cost-computation-repository.js';
import { createRawCostValue, type CurrencyCode, type CostLineItem } from './raw-cost-value.js';
import type { EventBus } from '../domain/events/event-bus.js';
import {
  createCostComputationCompletedEvent,
  createCostReferenceResolvedEvent,
} from './cost-events.js';

export interface CostDetail {
  readonly ref_id: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly breakdown: readonly CostLineItem[];
  readonly computed_at: string;
  readonly model_version: string;
}

export class CostReferenceNotFoundError extends Error {
  override readonly name = 'CostReferenceNotFoundError';
  constructor(public readonly refId: string) {
    super(`Cost reference not found: ${refId}`);
  }
}

export class CostComputationService {
  private static readonly MODEL_VERSION = '1.0.0';
  private static readonly BASE_RATE = 0.01;

  constructor(
    private readonly repository: CostComputationRepository,
    private readonly eventBus?: EventBus,
  ) {}

  /**
   * Compute cost and return an opaque CostReference.
   * The raw cost value stays internal — only ref_id + computed_at are returned.
   */
  calculateCost(params: CostParameters, requestedBy: string): CostReference {
    // 1. Create aggregate in pending state
    const computation = createCostComputation(params, requestedBy);

    // 2. Compute raw cost value (internal formula)
    const amount = params.quantity * CostComputationService.BASE_RATE;
    const breakdown: CostLineItem[] = [
      {
        category: params.resource_type,
        amount,
        unit: `per_${params.tier}`,
      },
    ];
    const rawResult = createRawCostValue(
      amount,
      'USD',
      breakdown,
      CostComputationService.MODEL_VERSION,
    );

    // 3. Complete computation
    completeCostComputation(computation, rawResult);

    // 4. Persist
    this.repository.save(computation);

    // 5. Emit event (ref_id only — NO raw values)
    if (this.eventBus) {
      this.eventBus.emit(
        createCostComputationCompletedEvent(computation.ref_id, computation.execution_id),
      );
    }

    // 6. Return opaque handle
    return {
      ref_id: computation.ref_id,
      computed_at: computation.computed_at!,
    };
  }

  /**
   * Resolve a CostReference to its full CostDetail.
   * Only this service may dereference a CostReference.
   */
  resolveCostReference(ref: CostReference): CostDetail {
    const computation = this.repository.findByRefId(ref.ref_id);
    if (!computation || !computation.raw_result) {
      throw new CostReferenceNotFoundError(ref.ref_id);
    }

    if (this.eventBus) {
      this.eventBus.emit(
        createCostReferenceResolvedEvent(ref.ref_id, 'CostComputationService'),
      );
    }

    return {
      ref_id: computation.ref_id,
      amount: computation.raw_result.amount,
      currency: computation.raw_result.currency,
      breakdown: computation.raw_result.breakdown,
      computed_at: computation.computed_at!,
      model_version: computation.raw_result.model_version,
    };
  }
}
