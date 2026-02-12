// ── Simulation Engine (ADR-005) ─────────────────────────────────────────
export type { CoreDelegate } from './core-delegate.js';
export { InMemoryStubDelegate } from './core-delegate.js';
export type { CoreResolver } from './core-resolver.js';
export { MapCoreResolver } from './core-resolver.js';
export type { CoreStep } from './graph-walker.js';
export { extractCoreSteps, GraphCycleError } from './graph-walker.js';
export type { DispatchResult, DispatchOutcome } from './dispatch-result.js';
export { determineOutcome, createDispatchResult } from './dispatch-result.js';
export { SimulationEngine, UnresolvedCoreError, RepoAssignmentViolationError, GraphHierarchyViolationError } from './simulation-engine.js';
export type { HierarchyViolationType, HierarchyViolation, GraphHierarchyValidationResult } from './graph-hierarchy-validator.js';
export { validateGraphHierarchy } from './graph-hierarchy-validator.js';
export type { CoreName, RepoName } from './core-repo-assignments.js';
export {
  CORE_NAMES,
  REPO_NAMES,
  CORE_REPO_ASSIGNMENTS,
  isRepoAssignedToCore,
  getAssignedRepos,
  getAssignedCore,
} from './core-repo-assignments.js';
export type { RepoViolation } from './repo-guard.js';
export { validateRepoAssignments } from './repo-guard.js';
export {
  createDispatchStartedEvent,
  createCoreDelegationStartedEvent,
  createCoreDelegationCompletedEvent,
  createDispatchCompletedEvent,
  createDispatchFailedEvent,
} from './simulation-engine-events.js';
