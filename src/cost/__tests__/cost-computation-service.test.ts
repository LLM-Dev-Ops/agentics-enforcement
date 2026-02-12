import { describe, it, expect, beforeEach } from 'vitest';
import { CostComputationService, CostReferenceNotFoundError } from '../cost-computation-service.js';
import { InMemoryCostComputationRepository } from '../cost-computation-repository.js';
import { EventBus } from '../../domain/events/event-bus.js';
import type { CostParameters } from '../cost-computation.js';
import type { DomainEvent } from '../../domain/events/event-bus.js';

function makeParams(overrides: Partial<CostParameters> = {}): CostParameters {
  return {
    resource_type: 'compute',
    quantity: 10,
    tier: 'standard',
    context: {},
    execution_id: 'exec-001',
    ...overrides,
  };
}

describe('CostComputationService', () => {
  let repo: InMemoryCostComputationRepository;
  let eventBus: EventBus;
  let service: CostComputationService;

  beforeEach(() => {
    repo = new InMemoryCostComputationRepository();
    eventBus = new EventBus();
    service = new CostComputationService(repo, eventBus);
  });

  describe('calculateCost', () => {
    it('returns an opaque CostReference with ref_id and computed_at', () => {
      const ref = service.calculateCost(makeParams(), 'Security-Core');
      expect(ref).toHaveProperty('ref_id');
      expect(ref).toHaveProperty('computed_at');
      expect(typeof ref.ref_id).toBe('string');
      expect(typeof ref.computed_at).toBe('string');
    });

    it('returns CostReference with only ref_id and computed_at (no raw values)', () => {
      const ref = service.calculateCost(makeParams(), 'Security-Core');
      const keys = Object.keys(ref);
      expect(keys).toContain('ref_id');
      expect(keys).toContain('computed_at');
      expect(keys).not.toContain('amount');
      expect(keys).not.toContain('currency');
      expect(keys).not.toContain('breakdown');
    });

    it('persists computation to repository', () => {
      const ref = service.calculateCost(makeParams(), 'Security-Core');
      const saved = repo.findByRefId(ref.ref_id);
      expect(saved).not.toBeNull();
      expect(saved!.status).toBe('computed');
    });

    it('emits CostComputationCompleted event', () => {
      const events: DomainEvent[] = [];
      eventBus.subscribe('CostComputationCompleted', (e) => events.push(e));

      const ref = service.calculateCost(makeParams({ execution_id: 'exec-42' }), 'Security-Core');

      expect(events).toHaveLength(1);
      expect(events[0].payload.ref_id).toBe(ref.ref_id);
      expect(events[0].payload.execution_id).toBe('exec-42');
    });

    it('event does not contain raw cost values', () => {
      const events: DomainEvent[] = [];
      eventBus.subscribe('CostComputationCompleted', (e) => events.push(e));

      service.calculateCost(makeParams(), 'Security-Core');

      const payload = events[0].payload;
      expect(payload).not.toHaveProperty('amount');
      expect(payload).not.toHaveProperty('currency');
      expect(payload).not.toHaveProperty('breakdown');
    });

    it('works without event bus', () => {
      const serviceNoEvents = new CostComputationService(repo);
      const ref = serviceNoEvents.calculateCost(makeParams(), 'Security-Core');
      expect(ref.ref_id).toBeTruthy();
    });

    it('computes amount as quantity * base rate', () => {
      const ref = service.calculateCost(makeParams({ quantity: 5 }), 'Security-Core');
      const detail = service.resolveCostReference(ref);
      // BASE_RATE = 0.01, quantity = 5, so amount = 0.05
      expect(detail.amount).toBe(0.05);
    });

    it('generates unique ref_ids for each call', () => {
      const ref1 = service.calculateCost(makeParams(), 'Security-Core');
      const ref2 = service.calculateCost(makeParams(), 'Security-Core');
      expect(ref1.ref_id).not.toBe(ref2.ref_id);
    });
  });

  describe('resolveCostReference', () => {
    it('returns full CostDetail for a valid reference', () => {
      const ref = service.calculateCost(makeParams({ quantity: 10 }), 'Security-Core');
      const detail = service.resolveCostReference(ref);

      expect(detail.ref_id).toBe(ref.ref_id);
      expect(detail.amount).toBe(0.10);
      expect(detail.currency).toBe('USD');
      expect(detail.computed_at).toBe(ref.computed_at);
      expect(detail.model_version).toBe('1.0.0');
    });

    it('returns breakdown with correct category', () => {
      const ref = service.calculateCost(makeParams({ resource_type: 'storage', tier: 'premium' }), 'Data-Core');
      const detail = service.resolveCostReference(ref);

      expect(detail.breakdown).toHaveLength(1);
      expect(detail.breakdown[0].category).toBe('storage');
      expect(detail.breakdown[0].unit).toBe('per_premium');
    });

    it('throws CostReferenceNotFoundError for unknown ref_id', () => {
      expect(() =>
        service.resolveCostReference({ ref_id: 'cost-unknown', computed_at: new Date().toISOString() }),
      ).toThrow(CostReferenceNotFoundError);
    });

    it('CostReferenceNotFoundError includes ref_id', () => {
      try {
        service.resolveCostReference({ ref_id: 'cost-missing', computed_at: new Date().toISOString() });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CostReferenceNotFoundError);
        expect((err as CostReferenceNotFoundError).refId).toBe('cost-missing');
      }
    });

    it('emits CostReferenceResolved event', () => {
      const events: DomainEvent[] = [];
      eventBus.subscribe('CostReferenceResolved', (e) => events.push(e));

      const ref = service.calculateCost(makeParams(), 'Security-Core');
      service.resolveCostReference(ref);

      expect(events).toHaveLength(1);
      expect(events[0].payload.ref_id).toBe(ref.ref_id);
      expect(events[0].payload.resolved_by).toBe('CostComputationService');
    });
  });

  describe('repository queries', () => {
    it('findByExecutionId returns all computations for an execution', () => {
      service.calculateCost(makeParams({ execution_id: 'exec-A' }), 'Security-Core');
      service.calculateCost(makeParams({ execution_id: 'exec-A' }), 'Security-Core');
      service.calculateCost(makeParams({ execution_id: 'exec-B' }), 'Data-Core');

      const results = repo.findByExecutionId('exec-A');
      expect(results).toHaveLength(2);
    });

    it('findByExecutionId returns empty array for unknown execution', () => {
      const results = repo.findByExecutionId('exec-nonexistent');
      expect(results).toHaveLength(0);
    });
  });
});
