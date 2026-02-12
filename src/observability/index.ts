/**
 * Observability domain — barrel export.
 * DDD-005: Observability bounded context.
 */

// Value Objects
export type { SpanType } from './span-type.js';
export { SPAN_TYPES, isValidSpanType, VALID_CHILD_TYPES } from './span-type.js';
export type { SpanStatus } from './span-status.js';
export { canCloseSpan, InvalidSpanTransitionError } from './span-status.js';
export type {
  ExecutionRootAttributes,
  ContractValidationAttributes,
  CoreAttributes,
  RepoAttributes,
  AgentAttributes,
  SpanAttributes,
} from './span-attributes.js';

// Entity
export type { Span, CreateSpanParams } from './span.js';
export { createSpan, closeSpan } from './span.js';

// Aggregate Root
export type { TreeStatus, SpanTree } from './span-tree.js';
export {
  createSpanTree,
  addSpanToTree,
  completeSpanTree,
  markSpanTreeBroken,
} from './span-tree.js';

// Domain Services
export { SpanFactory } from './span-factory.js';
export type {
  ViolationType,
  TreeViolation,
  TreeValidationResult,
} from './span-tree-validator.js';
export { validateSpanTree } from './span-tree-validator.js';

// Domain Events
export {
  createSpanCreatedEvent,
  createSpanClosedEvent,
  createSpanTreeCompletedEvent,
  createSpanTreeBrokenEvent,
} from './observability-events.js';
