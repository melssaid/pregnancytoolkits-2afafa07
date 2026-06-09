import { describe, it, expect, beforeEach } from 'vitest';
import { getQuotaState, canAfford, consumeQuota, setTier, clearAdminBypass, syncFromServer, syncCouponBonuses, applyCouponTier } from '../quotaManager';
import { resolveWeight, TOOL_WEIGHT_REGISTRY, QUOTA_TIERS } from '../types';

const STORAGE_KEY = 'smart_quota_v2';
const ADMIN_KEY = 'smart_admin_bypass';

const FREE_LIMIT = 8;
const PREMIUM_LIMIT = 75;

beforeEach(() => {
  localStorage.clear();
});

describe('quotaManager', () => {
  it('defaults to free tier with 8 limit', () => {
    const state = getQuotaState();
    expect(state.tier).toBe('free');
    expect(state.limit).toBe(FREE_LIMIT);
    expect(state.remaining).toBe(FREE_LIMIT);
    expect(state.used).toBe(0);
    expect(state.isExhausted).toBe(false);
  });

  it('consumes quota with weight 1', () => {
    consumeQuota(1);
    const state = getQuotaState();
    expect(state.used).toBe(1);
    expect(state.remaining).toBe(FREE_LIMIT - 1);
  });

  it('consumes quota with weight 2 (high-value tool)', () => {
    consumeQuota(2);
    const state = getQuotaState();
    expect(state.used).toBe(2);
    expect(state.remaining).toBe(FREE_LIMIT - 2);
  });

  it('exhausts free quota at 8', () => {
    for (let i = 0; i < FREE_LIMIT; i++) consumeQuota(1);
    const state = getQuotaState();
    expect(state.isExhausted).toBe(true);
    expect(state.remaining).toBe(0);
    expect(canAfford(1)).toBe(false);
  });

  it('free user cannot afford weight-2 when only 1 remaining', () => {
    for (let i = 0; i < FREE_LIMIT - 1; i++) consumeQuota(1);
    expect(canAfford(1)).toBe(true);
    expect(canAfford(2)).toBe(false);
  });

  it('premium tier has 75 limit', () => {
    setTier('premium');
    const state = getQuotaState();
    expect(state.tier).toBe('premium');
    expect(state.limit).toBe(PREMIUM_LIMIT);
    expect(state.remaining).toBe(PREMIUM_LIMIT);
  });

  it('exhausts premium quota at 75', () => {
    setTier('premium');
    for (let i = 0; i < PREMIUM_LIMIT; i++) consumeQuota(1);
    const state = getQuotaState();
    expect(state.isExhausted).toBe(true);
    expect(state.remaining).toBe(0);
  });

  it('isNearLimit triggers when remaining <= 2', () => {
    for (let i = 0; i < FREE_LIMIT - 2; i++) consumeQuota(1);
    const state = getQuotaState();
    expect(state.isNearLimit).toBe(true);
    expect(state.remaining).toBe(2);
  });

  it('admin bypass grants 999 limit', () => {
    localStorage.setItem(ADMIN_KEY, 'true');
    const state = getQuotaState();
    expect(state.adminBypass).toBe(true);
    expect(state.limit).toBe(999);
    expect(canAfford(1)).toBe(true);
    clearAdminBypass();
    expect(getQuotaState().adminBypass).toBe(false);
  });

  it('resets when month changes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      monthKey: '2020-01',
      used: 99,
      tier: 'free',
    }));
    const state = getQuotaState();
    expect(state.used).toBe(0);
    expect(state.remaining).toBe(FREE_LIMIT);
  });

  it('does not double-deduct on sequential calls', () => {
    consumeQuota(1);
    consumeQuota(1);
    const state = getQuotaState();
    expect(state.used).toBe(2);
  });

  it('syncs coupon-backed server limit into local quota state', () => {
    // Server returns: tier=premium, limit=135 (75 base + 60 coupon)
    syncFromServer(3, 'premium', PREMIUM_LIMIT + 60);
    const state = getQuotaState();
    expect(state.used).toBe(3);
    expect(state.tier).toBe('premium');
    expect(state.limit).toBe(PREMIUM_LIMIT + 60);
    expect(state.remaining).toBe(PREMIUM_LIMIT + 60 - 3);
  });

  it('removes coupon override when server returns default premium limit', () => {
    syncFromServer(1, 'premium', PREMIUM_LIMIT + 60);
    syncFromServer(2, 'premium', PREMIUM_LIMIT);
    const state = getQuotaState();
    expect(state.limit).toBe(PREMIUM_LIMIT);
    expect(state.remaining).toBe(PREMIUM_LIMIT - 2);
  });

  it('weight-2 tool exhausts free quota faster', () => {
    for (let i = 0; i < 3; i++) consumeQuota(2); // 6 used
    expect(canAfford(2)).toBe(true); // 2 remaining → can still afford weight 2
    consumeQuota(2); // 8 used
    expect(canAfford(1)).toBe(false);
    expect(getQuotaState().isExhausted).toBe(true);
  });
});

describe('TOOL_WEIGHT_REGISTRY', () => {
  it('bump-photos has weight 5 (multimodal vision)', () => {
    expect(TOOL_WEIGHT_REGISTRY['bump-photos']).toBe(5);
  });

  it('high-value tools have weight 2', () => {
    const heavyTools = [
      'pregnancy-plan',
      'weekly-summary',
      'kick-analysis',
      'contraction-analysis',
      'weight-analysis',
      'mental-health',
      'birth-plan',
      'postpartum-recovery',
    ] as const;
    for (const tool of heavyTools) {
      expect(TOOL_WEIGHT_REGISTRY[tool]).toBe(2);
    }
  });

  it('standard tools have weight 2', () => {
    const standardTools = [
      'symptom-analysis', 'pregnancy-assistant',
      'hospital-bag', 'meal-suggestion', 'vitamin-advice',
      'baby-cry-analysis', 'sleep-analysis',
    ] as const;
    for (const tool of standardTools) {
      expect(TOOL_WEIGHT_REGISTRY[tool]).toBe(2);
    }
  });

  it('registry covers every AIToolType', () => {
    const keys = Object.keys(TOOL_WEIGHT_REGISTRY);
    expect(keys.length).toBeGreaterThanOrEqual(30);
    for (const key of keys) {
      expect([0, 1, 2, 5, 7]).toContain(TOOL_WEIGHT_REGISTRY[key as keyof typeof TOOL_WEIGHT_REGISTRY]);
    }
  });
});

describe('resolveWeight', () => {
  it('resolves bump-photos to weight 5 from toolType', () => {
    expect(resolveWeight('bump-photos')).toBe(5);
  });

  it('resolves heavy tool to weight 2 from toolType', () => {
    expect(resolveWeight('pregnancy-plan')).toBe(2);
    expect(resolveWeight('kick-analysis')).toBe(2);
  });

  it('resolves standard tool to weight 2 from toolType', () => {
    expect(resolveWeight('symptom-analysis')).toBe(2);
  });

  it('resolves weight from section when no toolType', () => {
    expect(resolveWeight(undefined, 'bump-photos')).toBe(5);
    expect(resolveWeight(undefined, 'kick-analysis')).toBe(2);
  });

  it('resolves weight from section for standard sections', () => {
    expect(resolveWeight(undefined, 'symptoms')).toBe(2);
  });

  it('defaults to 1 for unknown inputs', () => {
    expect(resolveWeight(undefined, undefined)).toBe(1);
  });
});

describe('QUOTA_TIERS', () => {
  it('free tier has 8 monthly analyses', () => {
    expect(QUOTA_TIERS.free.monthly).toBe(8);
  });
  it('premium tier has 75 monthly analyses', () => {
    expect(QUOTA_TIERS.premium.monthly).toBe(75);
  });
});

// ── Coupon additivity: client-side mirror of check-quota math ──
// Server formula: limit = baseLimit (free=8/premium=75) + sum(active coupon bonus_points)
describe('coupon additivity (client ↔ server parity)', () => {
  const PREMIUM_BASE = PREMIUM_LIMIT;

  it('adds a single coupon bonus on top of premium base limit', () => {
    syncCouponBonuses([
      { couponId: 'SAHAR60', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 60 },
    ]);
    const state = getQuotaState();
    expect(state.tier).toBe('premium');
    expect(state.limit).toBe(PREMIUM_BASE + 60);
    expect(state.remaining).toBe(PREMIUM_BASE + 60);
  });

  it('sums multiple active coupons additively above the base', () => {
    syncCouponBonuses([
      { couponId: 'A', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 60 },
      { couponId: 'B', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 30 },
      { couponId: 'C', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 10 },
    ]);
    expect(getQuotaState().limit).toBe(PREMIUM_BASE + 60 + 30 + 10);
  });

  it('coupon points remain spendable AFTER base premium quota is exhausted', () => {
    syncCouponBonuses([
      { couponId: 'BARAKAT60', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 60 },
    ]);
    for (let i = 0; i < PREMIUM_BASE; i++) consumeQuota(1);
    const mid = getQuotaState();
    expect(mid.used).toBe(PREMIUM_BASE);
    expect(mid.isExhausted).toBe(false);
    expect(mid.remaining).toBe(60);

    for (let i = 0; i < 60; i++) consumeQuota(1);
    const final = getQuotaState();
    expect(final.used).toBe(PREMIUM_BASE + 60);
    expect(final.remaining).toBe(0);
    expect(final.isExhausted).toBe(true);
  });

  it('ignores expired coupons in the active set', () => {
    syncCouponBonuses([
      { couponId: 'EXPIRED', expiresAt: new Date(Date.now() - 1000).toISOString(), bonusPoints: 60 },
      { couponId: 'LIVE', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 30 },
    ]);
    expect(getQuotaState().limit).toBe(PREMIUM_BASE + 30);
  });

  it('replaces previous coupon set on next sync (no double count across syncs)', () => {
    syncCouponBonuses(
      [{ couponId: 'A', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 60 }],
      'period-1'
    );
    expect(getQuotaState().limit).toBe(PREMIUM_BASE + 60);

    syncCouponBonuses(
      [{ couponId: 'B', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 30 }],
      'period-2'
    );
    expect(getQuotaState().limit).toBe(PREMIUM_BASE + 30);
  });

  it('idempotency guard: re-applying same payload+version does NOT re-add', () => {
    const coupons = [
      { couponId: 'X', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 60 },
    ];
    const applied1 = syncCouponBonuses(coupons, 'v-2026-04');
    const applied2 = syncCouponBonuses(coupons, 'v-2026-04');
    expect(applied1).toBe(true);
    expect(applied2).toBe(false);
    expect(getQuotaState().limit).toBe(PREMIUM_BASE + 60);
  });

  it('applyCouponTier accumulates additively across distinct coupon keys', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    applyCouponTier(future, 60, 'COUPON_A');
    applyCouponTier(future, 30, 'COUPON_B');
    const state = getQuotaState();
    expect(state.tier).toBe('premium');
    expect(state.limit).toBe(PREMIUM_BASE + 60 + 30);
  });

  it('mirrors server formula: limit = baseLimit + couponBonus (parity check)', () => {
    const baseLimit = PREMIUM_BASE;
    const couponBonus = 60 + 30;
    const serverLimit = baseLimit + couponBonus;

    syncCouponBonuses([
      { couponId: 'A', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 60 },
      { couponId: 'B', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), bonusPoints: 30 },
    ]);
    expect(getQuotaState().limit).toBe(serverLimit);
  });
});
