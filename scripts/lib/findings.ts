/**
 * Finding collection for dependency-name-resolution-check.
 *
 * The check is a single-shot CLI, so the rule modules share one collector rather
 * than threading a sink through every resolution rule.
 */

export type Severity = 'block' | 'warn';

export interface Finding {
  severity: Severity;
  rule: string;
  file: string;
  line: number;
  dep: string;
  detail: string;
  candidates?: string[];
}

/** File/line/name of the declaration a rule is currently resolving. */
export interface Where {
  file: string;
  line: number;
  dep: string;
}

const collected: Finding[] = [];

export const counters = { skippedNetworkRules: 0, dependenciesChecked: 0 };

export function report(finding: Finding): void {
  collected.push(finding);
}

export function allFindings(): readonly Finding[] {
  return collected;
}
