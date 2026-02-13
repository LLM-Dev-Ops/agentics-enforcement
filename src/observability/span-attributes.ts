/**
 * Type-specific required attributes for each SpanType.
 * DDD-005: Value Objects
 */

export interface ExecutionRootAttributes {
  readonly execution_id: string;
  readonly caller: string;
  readonly intent_id: string;
}

export interface ContractValidationAttributes {
  readonly intent_id: string;
  readonly schema_version: string;
  readonly result: 'pass' | 'fail' | 'policy_denied';
}

export interface CoreAttributes {
  readonly core_name: string;
  readonly execution_id: string;
  readonly delegated_repos: readonly string[];
  readonly simulation_resolution?: string;
}

export interface RepoAttributes {
  readonly repo_name: string;
  readonly core_parent: string;
  readonly execution_id: string;
  readonly simulation_resolution?: string;
}

export interface AgentAttributes {
  readonly agent_id: string;
  readonly repo_parent: string;
  readonly execution_id: string;
}

/** Discriminated union of all type-specific attributes. */
export type SpanAttributes =
  | ExecutionRootAttributes
  | ContractValidationAttributes
  | CoreAttributes
  | RepoAttributes
  | AgentAttributes;
