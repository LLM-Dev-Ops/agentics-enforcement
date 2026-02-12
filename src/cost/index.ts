// ── Cost Domain (DDD-004, ADR-007) ──────────────────────────────────────
// PUBLIC exports — safe to expose outside CostOps
export type { CostParameters, ComputationStatus, CostComputation } from './cost-computation.js';
export { InvalidComputationTransitionError } from './cost-computation.js';
export type { CostDetail } from './cost-computation-service.js';
export { CostComputationService, CostReferenceNotFoundError } from './cost-computation-service.js';
export type { CostComputationRepository } from './cost-computation-repository.js';
export { InMemoryCostComputationRepository } from './cost-computation-repository.js';
export {
  createCostComputationCompletedEvent,
  createCostReferenceResolvedEvent,
} from './cost-events.js';

// INTERNAL — NOT exported: RawCostValue, CostLineItem, CurrencyCode, createRawCostValue
// These types are internal to CostOps per ADR-007 opacity rule.
