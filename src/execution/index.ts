/**
 * Execution domain — barrel export.
 * DDD-002: Execution Authority bounded context.
 */

// Value Objects
export type { ExecutionId } from './execution-id.js';
export { executionIdEquals } from './execution-id.js';
export type { ExecutionStatus } from './execution-status.js';
export { canTransition, InvalidTransitionError } from './execution-status.js';
export type { RootSpanMeta } from './root-span-meta.js';
export type { AcceptanceResponse, RejectionResponse, AcceptResult } from './acceptance-response.js';

// Aggregate Root
export type { Execution } from './execution.js';
export { transitionExecution } from './execution.js';

// Domain Events
export { createExecutionAccepted, createExecutionRejected } from './execution-events.js';

// Repository
export type { ExecutionRepository } from './execution-repository.js';
export { InMemoryExecutionRepository } from './execution-repository.js';

// Domain Service
export { ExecutionAcceptanceService } from './execution-acceptance-service.js';
