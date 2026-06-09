// Edge function: check-quota
// Server-authoritative AI quota lookup based on device fingerprint.
// Reads from ai_usage_logs (last 30 days) — survives app data clearing.
// Adds active coupon bonus points on top of base tier limit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-fingerprint, x-local-user-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  device_fingerprint: string;
  client_id: string;
  tier?: 'free' | 'premium';
}

const TIER_LIMITS = {
  free: 10,
  premium: 60,
};

const WINDOW_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { device_fingerprint, client_id, tier = 'free' } = body;

    if (!device_fingerprint || typeof device_fingerprint !== 'string' || device_fingerprint.length < 10 || device_fingerprint.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Invalid device_fingerprint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!client_id || typeof client_id !== 'string' || client_id.length < 5 || client_id.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Invalid client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (tier !== 'free' && tier !== 'premium') {
      return new Response(
        JSON.stringify({ error: 'Invalid tier' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Usage from ai_usage_logs (last 30 days)
    const { data: usageData, error: usageError } = await supabase.rpc('get_quota_usage', {
      _device_fingerprint: device_fingerprint,
      _client_id: client_id,
      _window_days: WINDOW_DAYS,
    });

    if (usageError) {
      console.error('[check-quota] RPC error:', usageError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch usage', details: usageError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const points_used = usageData?.[0]?.points_used ?? 0;
    const period_start = usageData?.[0]?.period_start ?? new Date().toISOString();
    const call_count = Number(usageData?.[0]?.call_count ?? 0);

    // ── Sum ALL active coupon bonuses for this device/user ──
    let couponBonus = 0;
    const activeCoupons: Array<{ couponId: string; code: string; durationType: string; expiresAt: string; bonusPoints: number }> = [];
    try {
      const { data: claims } = await supabase
        .from('coupon_claims')
        .select('coupon_id, expires_at, coupons(code, duration_type, bonus_points)')
        .or(`device_fingerprint.eq.${device_fingerprint},user_id.eq.${client_id}`)
        .gt('expires_at', new Date().toISOString());

      if (claims && claims.length > 0) {
        for (const claim of claims as any[]) {
          const bp = Number(claim.coupons?.bonus_points || 0);
          if (bp > 0) {
            couponBonus += bp;
            activeCoupons.push({
              couponId: claim.coupon_id,
              code: claim.coupons?.code || '',
              durationType: claim.coupons?.duration_type || '',
              expiresAt: claim.expires_at,
              bonusPoints: bp,
            });
          }
        }
      }
    } catch (e) {
      console.error('[check-quota] Coupon lookup failed:', e);
    }

    // Effective tier: if any active coupon exists, treat as premium
    const effectiveTier = couponBonus > 0 ? 'premium' : tier;
    const baseLimit = TIER_LIMITS[effectiveTier];
    const limit = baseLimit + couponBonus;
    const remaining = Math.max(0, limit - points_used);

    // Upsert quota state
    await supabase
      .from('ai_quota_state')
      .upsert(
        {
          device_fingerprint,
          client_id,
          points_used,
          period_start,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'device_fingerprint' }
      );

    return new Response(
      JSON.stringify({
        used: points_used,
        limit,
        remaining,
        tier: effectiveTier,
        base_limit: baseLimit,
        coupon_bonus: couponBonus,
        active_coupons: activeCoupons,
        period_start,
        call_count,
        is_exhausted: points_used >= limit,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[check-quota] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
