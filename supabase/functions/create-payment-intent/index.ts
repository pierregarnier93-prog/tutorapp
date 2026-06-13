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
    const { bookingId, amount } = await req.json();

    if (!bookingId || !amount) {
      return new Response(
        JSON.stringify({ error: "bookingId and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // amount is in AED, Stripe needs the smallest currency unit (fils)
    const amountInFils = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInFils,
      currency: "aed",
      capture_method: "manual",
      metadata: { bookingId },
    });

    // Save the PaymentIntent ID on the booking
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        status: "pending_payment",
      })
      .eq("id", bookingId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
    }

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
