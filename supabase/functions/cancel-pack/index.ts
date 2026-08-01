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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { packId } = await req.json();
    if (!packId) {
      return new Response(JSON.stringify({ error: "packId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pack, error } = await supabase
      .from("packs")
      .select("*")
      .eq("id", packId)
      .single();

    if (error || !pack) {
      return new Response(JSON.stringify({ error: "Pack not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pack.status !== "active") {
      return new Response(JSON.stringify({ error: "Pack is not active" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unusedLessons = pack.total_lessons - pack.lessons_done;
    const refundAmountAed = unusedLessons * pack.price_per_lesson_aed;
    const refundAmountCents = Math.round(refundAmountAed * 100);

    // Refund unused lessons via Stripe
    if (pack.stripe_payment_intent_id && refundAmountCents > 0) {
      const pi = await stripe.paymentIntents.retrieve(pack.stripe_payment_intent_id);
      const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
      if (chargeId) {
        await stripe.refunds.create({ charge: chargeId, amount: refundAmountCents });
      }
    }

    await supabase.from("packs").update({ status: "cancelled" }).eq("id", packId);

    return new Response(JSON.stringify({ success: true, refundedAed: refundAmountAed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
