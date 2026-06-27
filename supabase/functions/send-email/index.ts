import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json();
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  let emailData;

  if (body.type === "new_teacher_pending") {
    emailData = {
      from: "TutorApp <noreply@tutorapp.online>",
      to: [body.adminEmail || "pierre.garnier93@gmail.com"],
      subject: `🎓 Nouvel enseignant à valider : ${body.teacherName}`,
      html: `
        <h2>Nouvel enseignant en attente de validation</h2>
        <p><strong>Nom :</strong> ${body.teacherName}</p>
        <p><strong>Email :</strong> ${body.teacherEmail}</p>
        <p><strong>Matières :</strong> ${body.subjects?.join(", ")}</p>
        <p><strong>Cycle :</strong> ${body.cycles?.join(", ")}</p>
        <p><strong>Tarif :</strong> ${body.rate} AED/h</p>
        <br/>
        <a href="https://www.tutorapp.online"
           style="background:#5B4FE8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
          Valider sur TutorApp →
        </a>
      `,
    };
  }

  if (body.type === "teacher_verified") {
    emailData = {
      from: "TutorApp <noreply@tutorapp.online>",
      to: [body.teacherEmail],
      subject: `✅ Votre profil TutorApp est validé !`,
      html: `
        <h2>Félicitations ${body.teacherName} ! 🎉</h2>
        <p>Votre profil enseignant a été vérifié et approuvé par notre équipe.</p>
        <p>Vous pouvez maintenant recevoir des demandes de cours et proposer vos tarifs.</p>
        <br/>
        <a href="https://www.tutorapp.online"
           style="background:#5B4FE8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
          Accéder à mon dashboard →
        </a>
        <br/><br/>
        <p style="color:#6B7280;font-size:13px">L'équipe TutorApp · tutorapp.online</p>
      `,
    };
  }

  if (!emailData) {
    return new Response(JSON.stringify({ error: "Unknown email type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailData),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
