import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLANS = {
  monthly: { amount: 14900, interval: "month" as const, label: "TutorApp Tutor — Monthly" },
  yearly: { amount: 99900, interval: "year" as const, label: "TutorApp Tutor — Yearly" },
};

const REFERRAL_COUPON_ID = "REFERRAL50";
const TRIAL_DAYS = 14;

async function ensureReferralCoupon() {
  try {
    return await stripe.coupons.retrieve(REFERRAL_COUPON_ID);
  } catch {
    return await stripe.coupons.create({
      id: REFERRAL_COUPON_ID,
      percent_off: 50,
      duration: "once",
      name: "Referral reward — 50% off",
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan, referralCode, successUrl, cancelUrl } = await req.json();
    const selected = PLANS[plan as keyof typeof PLANS];
    if (!selected) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, referred_by")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (existing && ["active", "trialing"].includes(existing.status)) {
      return new Response(JSON.stringify({ error: "Subscription already active" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let customerId = existing?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        name: profile.full_name || undefined,
        metadata: { teacher_id: user.id },
      });
      customerId = customer.id;
    }

    // A referral code is only honoured once, and never one's own
    let validReferrerId: string | null = null;
    if (referralCode && !profile.referred_by) {
      const { data: referrer } = await supabase
        .from("profiles")
        .select("id")
        .eq("referral_code", referralCode.trim().toUpperCase())
        .maybeSingle();
      if (referrer && referrer.id !== user.id) validReferrerId = referrer.id;
    }

    const discounts = [];
    if (validReferrerId) {
      await ensureReferralCoupon();
      discounts.push({ coupon: REFERRAL_COUPON_ID });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "aed",
          product_data: { name: selected.label },
          unit_amount: selected.amount,
          recurring: { interval: selected.interval },
        },
        quantity: 1,
      }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: {
          teacher_id: user.id,
          plan,
          referrer_id: validReferrerId || "",
          referral_code: validReferrerId ? referralCode.trim().toUpperCase() : "",
        },
      },
      ...(discounts.length ? { discounts } : {}),
      success_url: successUrl || `${req.headers.get("origin")}/?sub=success`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/?sub=cancelled`,
      metadata: { teacher_id: user.id, plan },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-subscription error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
