import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// The dashboard secret is named `Stripe_secret_key`; env lookups are
// case-sensitive on Linux, so accept either spelling.
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? Deno.env.get("Stripe_secret_key")!;

const stripe = new Stripe(STRIPE_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const REFERRAL_COUPON_ID = "REFERRAL50";

const iso = (unix: number | null | undefined) =>
  unix ? new Date(unix * 1000).toISOString() : null;

async function upsertSubscription(sub: Stripe.Subscription) {
  const teacherId = sub.metadata?.teacher_id;
  if (!teacherId) return;

  await supabase.from("subscriptions").upsert({
    teacher_id: teacherId,
    status: sub.status,
    plan: sub.metadata?.plan || "monthly",
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    trial_ends_at: iso(sub.trial_end),
    current_period_end: iso(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "teacher_id" });
}

// Rewards the referrer once the referee's subscription actually starts.
async function grantReferralReward(sub: Stripe.Subscription) {
  const refereeId = sub.metadata?.teacher_id;
  const referrerId = sub.metadata?.referrer_id;
  const codeUsed = sub.metadata?.referral_code;
  if (!refereeId || !referrerId || !codeUsed) return;

  const { data: existing } = await supabase
    .from("referrals").select("id").eq("referee_id", refereeId).maybeSingle();
  if (existing) return;

  await supabase.from("referrals").insert({
    referrer_id: referrerId, referee_id: refereeId, code_used: codeUsed, rewarded: true,
  });

  await supabase.from("profiles").update({ referred_by: codeUsed }).eq("id", refereeId);

  const { data: referrer } = await supabase
    .from("profiles").select("referral_count, referral_credits").eq("id", referrerId).single();

  await supabase.from("profiles").update({
    referral_count: (referrer?.referral_count || 0) + 1,
    referral_credits: (referrer?.referral_credits || 0) + 1,
  }).eq("id", referrerId);

  // Discount the referrer's next invoice
  const { data: referrerSub } = await supabase
    .from("subscriptions").select("stripe_subscription_id")
    .eq("teacher_id", referrerId).maybeSingle();

  if (referrerSub?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.update(referrerSub.stripe_subscription_id, {
        coupon: REFERRAL_COUPON_ID,
      });
    } catch (e) {
      console.error("Failed to apply referrer coupon:", e);
    }
  }
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        await grantReferralReward(sub);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subId = typeof invoice.subscription === "string"
            ? invoice.subscription : invoice.subscription.id;
          await supabase.from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
