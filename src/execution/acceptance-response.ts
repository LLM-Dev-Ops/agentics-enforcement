/**
 * AcceptanceResponse / RejectionResponse — Return types from ruvector accept endpoint.
 * DDD-002: Value Objects
 */

export interface AcceptanceResponse {
  readonly execution_id: string;
  readonly root_span_id: string;
  readonly accepted: true;
}

export interface RejectionResponse {
  readonly accepted: false;
  readonly intent_id: string;
  readonly reason: string;
}

export type AcceptResult = AcceptanceResponse | RejectionResponse;
