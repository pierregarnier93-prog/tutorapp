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

  if (body.type === "lesson_confirmed") {
    emailData = {
      from: "TutorApp <noreply@tutorapp.online>",
      to: [body.studentEmail],
      subject: `✅ Cours confirmé — merci ${body.studentName || ""} !`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#0ABFA3">✅ Cours confirmé !</h2>
          <p>Merci d'avoir confirmé que le cours avec <strong>${body.teacherName}</strong> a bien eu lieu.</p>
          <p>Le paiement a été capturé. L'enseignant sera rémunéré sous 48h.</p>
          <br/>
          <a href="https://www.tutorapp.online"
             style="background:#5B4FE8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
            Voir mon historique →
          </a>
          <br/><br/>
          <p style="color:#6B7280;font-size:13px">L'équipe TutorApp · tutorapp.online</p>
        </div>
      `,
    };
  }

  if (body.type === "new_offer_received") {
    const lang = body.lang || "en";
    const subjects: Record<string, Record<string, string>> = {
      fr: {
        subject_line: `🎉 Offre reçue pour ${body.subject} — ${body.teacherName} propose ${body.netPrice} AED`,
        h2: `Bonne nouvelle ${body.studentName || ""} !`,
        p1: `<strong>${body.teacherName}</strong> a répondu à ton annonce pour <strong>${body.subject}</strong>.`,
        p2: `Tarif proposé : <strong>${body.netPrice} AED</strong> (tu paieras <strong>${Math.round((body.netPrice||0)*1.06)} AED</strong> après le cours).`,
        cta: "Voir l'offre →",
        p3: "Tu as d'autres offres en attente — compare et choisis le meilleur prof pour ton enfant.",
      },
      ar: {
        subject_line: `🎉 عرض جديد لـ ${body.subject} — ${body.teacherName} يقترح ${body.netPrice} AED`,
        h2: `خبر سار ${body.studentName || ""} !`,
        p1: `<strong>${body.teacherName}</strong> ردّ على إعلانك لـ <strong>${body.subject}</strong>.`,
        p2: `السعر المقترح: <strong>${body.netPrice} AED</strong> (ستدفع <strong>${Math.round((body.netPrice||0)*1.06)} AED</strong> بعد الحصة).`,
        cta: "عرض العرض ←",
        p3: "لديك عروض أخرى — قارن واختر الأفضل.",
      },
      en: {
        subject_line: `🎉 New offer for ${body.subject} — ${body.teacherName} proposes ${body.netPrice} AED`,
        h2: `Great news ${body.studentName || ""} !`,
        p1: `<strong>${body.teacherName}</strong> replied to your request for <strong>${body.subject}</strong>.`,
        p2: `Proposed rate: <strong>${body.netPrice} AED</strong> (you'll pay <strong>${Math.round((body.netPrice||0)*1.06)} AED</strong> after the lesson).`,
        cta: "View offer →",
        p3: "You may have more offers coming — compare and pick the best tutor.",
      },
    };
    const s = subjects[lang] || subjects.en;
    emailData = {
      from: "TutorApp <noreply@tutorapp.online>",
      to: [body.studentEmail],
      subject: s.subject_line,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#5B4FE8">${s.h2}</h2>
          <p>${s.p1}</p>
          <p>${s.p2}</p>
          <p style="color:#6B7280;font-size:13px">${s.p3}</p>
          <br/>
          <a href="https://www.tutorapp.online"
             style="background:#5B4FE8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
            ${s.cta}
          </a>
          <br/><br/>
          <p style="color:#6B7280;font-size:13px">TutorApp · tutorapp.online</p>
        </div>
      `,
    };
  }

  if (body.type === "booking_confirmed") {
    const lang = body.lang || "en";
    const t: Record<string, Record<string, string>> = {
      fr: {
        subject_line: `📅 Réservation confirmée — ${body.subject} avec ${body.teacherName}`,
        h2: "Votre réservation est confirmée ! 🎉",
        p1: `Votre cours de <strong>${body.subject}</strong> avec <strong>${body.teacherName}</strong> est bien réservé.`,
        price_label: "Montant autorisé (prélevé après le cours) :",
        jitsi_label: "Lien visioconférence :",
        jitsi_btn: "🎥 Rejoindre le cours",
        note: "⚠️ Vous ne serez débité qu'après avoir confirmé que le cours a eu lieu.",
        cta: "Voir ma réservation →",
      },
      ar: {
        subject_line: `📅 تأكيد الحجز — ${body.subject} مع ${body.teacherName}`,
        h2: "تم تأكيد حجزك ! 🎉",
        p1: `تم حجز حصة <strong>${body.subject}</strong> مع <strong>${body.teacherName}</strong>.`,
        price_label: "المبلغ المعتمد (يُخصم بعد الحصة) :",
        jitsi_label: "رابط الفيديو :",
        jitsi_btn: "🎥 الانضمام للحصة",
        note: "⚠️ لن يُخصم منك المبلغ إلا بعد تأكيدك أن الحصة قد انتهت.",
        cta: "عرض الحجز ←",
      },
      en: {
        subject_line: `📅 Booking confirmed — ${body.subject} with ${body.teacherName}`,
        h2: "Your booking is confirmed! 🎉",
        p1: `Your <strong>${body.subject}</strong> lesson with <strong>${body.teacherName}</strong> is booked.`,
        price_label: "Authorized amount (charged after lesson):",
        jitsi_label: "Video link:",
        jitsi_btn: "🎥 Join lesson",
        note: "⚠️ You will only be charged after confirming the lesson took place.",
        cta: "View my booking →",
      },
    };
    const s = t[lang] || t.en;
    emailData = {
      from: "TutorApp <noreply@tutorapp.online>",
      to: [body.studentEmail],
      subject: s.subject_line,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#0ABFA3">${s.h2}</h2>
          <p>${s.p1}</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="border-bottom:1px solid #E2E8F0">
              <td style="padding:10px 0;color:#6B7280;font-size:14px">${s.price_label}</td>
              <td style="padding:10px 0;font-weight:900;color:#5B4FE8;font-size:16px;text-align:right">${body.grossPrice} AED</td>
            </tr>
            ${body.jitsiLink ? `
            <tr>
              <td style="padding:10px 0;color:#6B7280;font-size:14px">${s.jitsi_label}</td>
              <td style="padding:10px 0;text-align:right">
                <a href="${body.jitsiLink}" style="color:#5B4FE8;font-weight:700;font-size:13px">${body.jitsiLink}</a>
              </td>
            </tr>` : ""}
          </table>
          ${body.jitsiLink ? `
          <a href="${body.jitsiLink}"
             style="display:inline-block;background:#0ABFA3;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-bottom:16px">
            ${s.jitsi_btn}
          </a><br/>` : ""}
          <p style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px;font-size:13px;color:#92400E">${s.note}</p>
          <br/>
          <a href="https://www.tutorapp.online"
             style="background:#5B4FE8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
            ${s.cta}
          </a>
          <br/><br/>
          <p style="color:#6B7280;font-size:13px">TutorApp · tutorapp.online</p>
        </div>
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
