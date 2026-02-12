/**
 * Repo Guard — Validates that repos are only invoked by their assigned core.
 *
 * Pure validation function. Checks each repo node in the extracted core steps
 * against the immutable CORE_REPO_ASSIGNMENTS map. Returns violations (empty = valid).
 * Called by SimulationEngine during the validating phase, before any delegation.
 */
import type { CoreStep } from './graph-walker.js';
import { isRepoAssignedToCore } from './core-repo-assignments.js';

export interface RepoViolation {
  readonly coreName: string;
  readonly repoName: string;
  readonly message: string;
}

export class RepoAssignmentViolationError extends Error {
  override readonly name = 'RepoAssignmentViolationError';
  constructor(public readonly violations: readonly RepoViolation[]) {
    super(
      `Repo assignment violation: ${violations.map((v) => v.message).join('; ')}`,
    );
  }
}

/**
 * Validate that all repo nodes in the core steps are assigned to their respective core.
 * Returns an empty array if all assignments are valid.
 */
export function validateRepoAssignments(
  steps: readonly CoreStep[],
): RepoViolation[] {
  const violations: RepoViolation[] = [];

  for (const step of steps) {
    const repoNodes = step.childNodes.filter((n) => n.type === 'repo');
    for (const repo of repoNodes) {
      if (!isRepoAssignedToCore(repo.name, step.coreName)) {
        violations.push({
          coreName: step.coreName,
          repoName: repo.name,
          message: `Core ${step.coreName} cannot call repo ${repo.name}`,
        });
      }
    }
  }

  return violations;
}
