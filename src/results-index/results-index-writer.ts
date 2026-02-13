/**
 * ResultsIndexWriter — Strict writer for agentics-results-index.
 *
 * Contract enforcement:
 *   - RESULTS_INDEX_URL is REQUIRED (throws if missing).
 *   - Payload is validated against ResultPacketSchema from @agentics/contracts.
 *   - Response is awaited.
 *   - Non-OK response → throws (NO silent .catch() or swallowed errors).
 *   - Execution-engine MUST fail loudly on write failure.
 */
import { ResultPacketSchema } from '../contracts/index.js';
import { SchemaRegistry, ContractValidationError } from '../services/schema-registry.js';

export class ResultsIndexUrlMissingError extends Error {
  override readonly name = 'ResultsIndexUrlMissingError';
  constructor() {
    super(
      'RESULTS_INDEX_URL is required. Cannot write to agentics-results-index without a configured URL.',
    );
  }
}

export class ResultsIndexWriteError extends Error {
  override readonly name = 'ResultsIndexWriteError';
  constructor(
    public readonly execution_id: string,
    public readonly statusCode: number,
    public readonly statusText: string,
    public readonly responseBody?: string,
  ) {
    super(
      `Failed to write to results-index (execution_id: ${execution_id}): ` +
      `HTTP ${statusCode} ${statusText}` +
      (responseBody ? ` — ${responseBody}` : ''),
    );
  }
}

export class ResultsIndexWriter {
  private readonly url: string;
  private readonly schemaRegistry: SchemaRegistry;

  constructor(url?: string) {
    const resolvedUrl = url ?? process.env.RESULTS_INDEX_URL;
    if (!resolvedUrl) {
      throw new ResultsIndexUrlMissingError();
    }
    this.url = resolvedUrl;
    this.schemaRegistry = new SchemaRegistry();
  }

  /**
   * Write a result packet to agentics-results-index.
   *
   * 1. Validates payload against ResultPacketSchema.
   * 2. POSTs to RESULTS_INDEX_URL.
   * 3. Awaits response.
   * 4. Throws if response is not OK.
   *
   * NO silent error swallowing. Failures MUST propagate.
   */
  async write(payload: unknown, execution_id: string): Promise<void> {
    // Step 1: Validate payload against contracts schema
    const parseResult = ResultPacketSchema.safeParse(payload);
    if (!parseResult.success) {
      throw new ContractValidationError(
        'ResultPacket',
        'unknown',
        parseResult.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          expected: issue.code,
          actual: 'invalid',
          message: issue.message,
        })),
        execution_id,
      );
    }

    // Step 2: POST to results-index
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parseResult.data),
    });

    // Step 3: Await and check response
    if (!response.ok) {
      let responseBody: string | undefined;
      try {
        responseBody = await response.text();
      } catch {
        // If reading body fails, proceed with the status code error
      }
      // Step 4: Throw on failure — DO NOT continue execution
      throw new ResultsIndexWriteError(
        execution_id,
        response.status,
        response.statusText,
        responseBody,
      );
    }
  }
}
