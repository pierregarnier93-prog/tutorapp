import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          teacher_id: { type: "string" },
          score: { type: "integer" },
          reason_en: { type: "string" },
          reason_fr: { type: "string" },
          reason_ar: { type: "string" },
        },
        required: ["teacher_id", "score", "reason_en", "reason_fr", "reason_ar"],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
};

const SYSTEM = `You match students to private tutors on a Gulf-region marketplace.

You receive a student request and a list of available tutors. Rank the tutors by how well they fit THIS specific student, and return the top 5.

Weigh, in rough order of importance:
- Subject and curriculum match (a tutor who has taught this exact curriculum matters more than a generalist)
- Whether the tutor's background addresses the student's stated difficulties
- Language of instruction compatibility
- Track record (rating and number of lessons) — but a strong specialist with few reviews can outrank a generalist with many
- Level/cycle appropriateness (teaching a 7-year-old is a different skill from teaching an exam candidate)

Score 0-100. Only return tutors genuinely worth showing — if only three fit, return three.

For each match write a short reason (max 15 words) addressed to the parent, naming the concrete thing that makes this tutor right for their child. Write it in English, French and Arabic. Never invent qualifications a tutor does not list.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "requestId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: request } = await supabase
      .from("requests").select("*").eq("id", requestId).single();

    if (!request) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: teachers } = await supabase
      .from("profiles")
      .select("id, full_name, teaching_bio, teaching_subjects, teaching_curricula, teaching_langs, teaching_cycles, teaching_rate, rating, rating_count, verified, permit_verified")
      .eq("role", "teacher")
      .eq("verified", true)
      .limit(40);

    if (!teachers?.length) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      student_request: {
        subject: request.subject,
        curriculum: request.curriculum,
        level: request.level,
        language_of_instruction: request.instr_lang,
        duration_minutes: request.duration_min,
        difficulties_described: request.message || "(not specified)",
      },
      available_tutors: teachers.map(t => ({
        teacher_id: t.id,
        name: t.full_name,
        bio: t.teaching_bio || "",
        subjects: t.teaching_subjects || [],
        curricula: t.teaching_curricula || [],
        languages: t.teaching_langs || [],
        cycles: t.teaching_cycles || [],
        hourly_rate_aed: t.teaching_rate,
        rating: t.rating || null,
        lessons_taught: t.rating_count || 0,
        uae_permit_verified: !!t.permit_verified,
      })),
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: MATCH_SCHEMA } },
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic API error:", err);
      return new Response(JSON.stringify({ error: "Matching failed", matches: [] }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completion = await res.json();

    if (completion.stop_reason === "refusal") {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const textBlock = completion.content?.find((b: any) => b.type === "text");
    const parsed = JSON.parse(textBlock.text);

    // Re-attach profile data so the client renders from trusted DB values, not model output
    const byId = new Map(teachers.map(t => [t.id, t]));
    const matches = (parsed.matches || [])
      .filter((m: any) => byId.has(m.teacher_id))
      .slice(0, 5)
      .map((m: any) => ({ ...byId.get(m.teacher_id), match_score: m.score, match_reason: { en: m.reason_en, fr: m.reason_fr, ar: m.reason_ar } }));

    return new Response(JSON.stringify({ matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-match error:", error);
    return new Response(JSON.stringify({ error: error.message, matches: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
