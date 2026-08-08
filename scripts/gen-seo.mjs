// Generates static landing pages into dist/ after the Vite build.
//
// The app itself is a single-route SPA, so Google can only ever index one page
// of it. These are real HTML documents with their own URL, title and copy —
// crawlable without running any JavaScript — each linking back into the app.
//
// Volume is deliberately restrained. Every combination of subject, curriculum,
// city and exam would run to several hundred near-identical pages, which reads
// as doorway spam; each page here is built from copy unique to its city,
// subject or exam.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, CITIES, SUBJECTS, CURRICULA, EXAMS, RATE_MIN, RATE_MAX } from "./catalog.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const urls = [];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = (items) => items.slice(0, -1).join(", ") + " and " + items[items.length - 1];

// Google truncates titles past roughly 60 characters, so take the richest
// suffix that still fits rather than letting long subject names overflow.
const SUFFIXES = [" — Verified, Free for Parents | TutorApp", " — Free for Parents | TutorApp", " — Verified Tutors | TutorApp", " | TutorApp Gulf", " | TutorApp"];
const fitTitle = (base) => {
  for (const suf of SUFFIXES) if ((base + suf).length <= 60) return base + suf;
  return base + " | TutorApp";
};

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A2E;line-height:1.7;background:#fff}
a{color:#5B4FE8}
.wrap{max-width:760px;margin:0 auto;padding:0 1.5rem}
header{border-bottom:1px solid #E8EAF6;padding:1rem 0}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.logo{font-family:Georgia,serif;font-weight:700;font-size:1.15rem;color:#5B4FE8;text-decoration:none}
.cta{background:#5B4FE8;color:#fff;text-decoration:none;padding:.6rem 1.1rem;border-radius:10px;font-weight:600;font-size:.9rem;display:inline-block}
.hero{padding:3rem 0 2rem}
h1{font-family:Georgia,serif;font-size:2rem;line-height:1.25;margin-bottom:.75rem;font-weight:700}
h2{font-family:Georgia,serif;font-size:1.35rem;margin:2.25rem 0 .75rem;font-weight:700}
h3{font-size:1.05rem;margin:1.5rem 0 .4rem;font-weight:600}
p{margin-bottom:1rem;color:#374151}
ul{margin:0 0 1rem 1.25rem;color:#374151}
li{margin-bottom:.4rem}
.lede{font-size:1.08rem;color:#4B5563}
.badges{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.25rem 0}
.badge{background:#EEF2FF;color:#4338CA;font-size:.8rem;font-weight:600;padding:.3rem .7rem;border-radius:999px}
.panel{background:#F8FAFF;border:1px solid #E8EAF6;border-radius:14px;padding:1.25rem 1.5rem;margin:1.5rem 0}
.panel p:last-child{margin-bottom:0}
.ctablock{background:#5B4FE8;border-radius:16px;padding:2rem 1.5rem;text-align:center;margin:2.5rem 0;color:#fff}
.ctablock h2{color:#fff;margin-top:0}
.ctablock p{color:rgba(255,255,255,.85)}
.ctablock a{background:#fff;color:#5B4FE8;text-decoration:none;padding:.75rem 1.5rem;border-radius:10px;font-weight:700;display:inline-block;margin-top:.5rem}
.links{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}
.links a{background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:.4rem .75rem;font-size:.85rem;text-decoration:none;color:#4338CA}
nav.crumbs{font-size:.85rem;color:#6B7280;padding-top:1.25rem}
nav.crumbs a{color:#6B7280}
footer{border-top:1px solid #E8EAF6;margin-top:3rem;padding:2rem 0;font-size:.85rem;color:#6B7280}
footer a{color:#6B7280;margin-right:1rem}
@media(max-width:600px){h1{font-size:1.6rem}.hero{padding:2rem 0 1.5rem}}
`;

function page({ path, title, description, h1, crumbs, body, faq, related }) {
  const url = `${SITE}${path}`;
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem", position: i + 1, name: c.name,
        ...(c.path ? { item: `${SITE}${c.path}` } : {}),
      })),
    },
  ];
  if (faq?.length) {
    ld.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question", name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.svg">
<meta name="twitter:card" content="summary_large_image">
<style>${STYLES}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header><div class="wrap">
<a class="logo" href="/">TutorApp Gulf</a>
<a class="cta" href="/">Find a tutor</a>
</div></header>
<div class="wrap">
<nav class="crumbs">${crumbs.map((c, i) => (c.path && i < crumbs.length - 1 ? `<a href="${c.path}">${esc(c.name)}</a>` : esc(c.name))).join(" › ")}</nav>
<div class="hero"><h1>${esc(h1)}</h1></div>
${body}
<div class="ctablock">
<h2>Free for parents — always</h2>
<p>Post what your child needs, and verified tutors send you their offers. No commission, no booking fee.</p>
<a href="/">Post a request →</a>
</div>
${faq?.length ? `<h2>Common questions</h2>${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}` : ""}
${related?.length ? `<h2>Related searches</h2><div class="links">${related.map((r) => `<a href="${r.path}">${esc(r.name)}</a>`).join("")}</div>` : ""}
</div>
<footer><div class="wrap">
<a href="/">Home</a><a href="/tutors/">Subjects</a><a href="/curriculum/">Curricula</a><a href="/exam/">Exam prep</a>
<p style="margin-top:1rem">TutorApp Gulf — verified online tutors across the UAE and the Gulf. Free for parents.</p>
</div></footer>
</body>
</html>`;

  const dir = join(DIST, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html, "utf8");
  urls.push(path);
}

const HOW = `<h2>How it works</h2>
<ul>
<li><strong>Post what you need</strong> — subject, level and the times that suit you. It takes about a minute.</li>
<li><strong>Tutors send offers</strong> — each one proposes their own hourly rate, so you compare real prices rather than a fixed tariff.</li>
<li><strong>You choose, then pay after the lesson</strong> — your card is only charged once the lesson has taken place.</li>
</ul>
<p>Every tutor submits an identity document and a diploma before their profile goes live. Tutors based in the UAE must also hold the official UAE tutoring permit, which became a legal requirement for private tuition.</p>`;

const RATES = (what) => `<h2>What tutors charge</h2>
<p>Tutors set their own rates, and ${what} typically falls between ${RATE_MIN} and ${RATE_MAX} AED per hour depending on the level and the tutor's experience. Higher grades and exam years sit at the upper end.</p>
<div class="panel"><p><strong>Parents pay nothing to TutorApp.</strong> There is no commission and no booking fee — the tutor's hourly rate is the whole cost. TutorApp is funded by tutor subscriptions instead.</p></div>`;

// ---- Subject × city -------------------------------------------------------
// Restricted to the three emirates with real search volume. A page per subject
// in all seven would differ only by a place name, which is the definition of a
// doorway page; each of these carries copy specific to both the subject and
// the city.
const SUBJECT_CITIES = CITIES.slice(0, 3);
for (const s of SUBJECTS) {
  for (const c of SUBJECT_CITIES) {
    page({
      path: `/tutors/${s.slug}-tutors-${c.slug}/`,
      title: fitTitle(`${s.name} Tutors in ${c.name}`),
      description: `Verified online ${s.name} tutors in ${c.name}. Tutors quote their own rates, you pay after the lesson. Free for parents — no commission.`,
      h1: `${s.name} tutors in ${c.name}`,
      crumbs: [{ name: "Home", path: "/" }, { name: "Subjects", path: "/tutors/" }, { name: `${s.name} in ${c.name}` }],
      body: `<p class="lede">Looking for a ${s.alt} tutor in ${c.name}? Post what your child needs and verified tutors come to you with their own rates — usually within the day.</p>
<div class="badges"><span class="badge">Free for parents</span><span class="badge">Verified tutors</span><span class="badge">100% online</span><span class="badge">Pay after the lesson</span></div>
<h2>Where students actually lose marks in ${s.name.toLowerCase()}</h2>
<p>${esc(s.struggle)}</p>
<p>${esc(s.signal)}</p>
<h2>What this looks like in ${c.name}</h2>
<p>${esc(c.blurb)}</p>
<p>${esc(c.angle)}</p>
<h3>What tutors commonly cover</h3>
<ul>${s.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
<p>Tutors teach ${s.alt} across the British, IB, American, Indian CBSE and ICSE, French and Emirati MOE curricula, from primary through to Year 13 and Grade 12.</p>
${RATES(`${s.alt} tuition`)}
${HOW}
<h2>Matched by AI, not by a directory</h2>
<p>Rather than leaving you to scroll a list, TutorApp reads your request — subject, curriculum, level, language of instruction and what your child is finding hard — and puts the most suitable tutors in front of you. You still choose; the shortlist just starts closer to the right answer.</p>`,
      faq: [
        { q: `How much does a ${s.alt} tutor cost in ${c.name}?`, a: `Most ${s.alt} tutors charge between ${RATE_MIN} and ${RATE_MAX} AED per hour. Tutors set their own rate and TutorApp adds nothing on top, so the rate you are quoted is what you pay.` },
        c.faq,
        { q: `How do I know the tutor suits my child's level?`, a: `You state the curriculum and exact year or grade when posting. ${s.signal} Tutors see all of that before making an offer, and you can ask questions before booking.` },
        { q: `Is TutorApp free for parents?`, a: `Yes. Posting a request, receiving offers and booking are free, and there is no commission on the lesson. Tutors pay a subscription to use the platform.` },
      ],
      related: [
        ...SUBJECTS.filter((x) => x.slug !== s.slug).slice(0, 4).map((x) => ({ name: `${x.name} tutors in ${c.name}`, path: `/tutors/${x.slug}-tutors-${c.slug}/` })),
        ...SUBJECT_CITIES.filter((x) => x.slug !== c.slug).map((x) => ({ name: `${s.name} tutors in ${x.name}`, path: `/tutors/${s.slug}-tutors-${x.slug}/` })),
      ],
    });
  }
}

// ---- Curriculum × city (top three cities) ---------------------------------
const TOP = CITIES.slice(0, 3);
for (const cu of CURRICULA) {
  for (const c of TOP) {
    page({
      path: `/curriculum/${cu.slug}-tutors-${c.slug}/`,
      title: fitTitle(`${cu.name} Curriculum Tutors in ${c.name}`),
      description: `${cu.name} curriculum tutors in ${c.name}, covering ${cu.levels}. Verified, online, free for parents — no commission or booking fee.`,
      h1: `${cu.name} curriculum tutors in ${c.name}`,
      crumbs: [{ name: "Home", path: "/" }, { name: "Curricula", path: "/curriculum/" }, { name: `${cu.name} in ${c.name}` }],
      body: `<p class="lede">Tutors who know the ${cu.full} — not just the subject — for families in ${c.name}. Covering ${cu.levels}.</p>
<div class="badges"><span class="badge">Free for parents</span><span class="badge">${esc(cu.levels)}</span><span class="badge">Verified tutors</span></div>
<h2>Why curriculum fit matters</h2>
<p>${esc(cu.note)}</p>
<p>${esc(c.blurb)}</p>
<h3>Subjects available</h3>
<ul>${SUBJECTS.slice(0, 8).map((s) => `<li><a href="/tutors/${s.slug}-tutors-${c.slug}/">${esc(s.name)} tutors in ${esc(c.name)}</a></li>`).join("")}</ul>
${RATES(`${cu.name} tuition`)}
${HOW}`,
      faq: [
        { q: `Do you have tutors who know the ${cu.full}?`, a: `Yes. Tutors state which curricula they teach when they register, and TutorApp matches your request against that — so you are not sent a tutor who has never taught ${cu.name} before.` },
        { q: `Which levels are covered?`, a: `${cu.levels}. You choose your child's exact year or grade when posting a request, and tutors see it before making an offer.` },
        { q: `What does it cost?`, a: `Tutors set their own rates, typically ${RATE_MIN}–${RATE_MAX} AED per hour. TutorApp takes no commission from parents.` },
      ],
      related: [
        ...CURRICULA.filter((x) => x.slug !== cu.slug).slice(0, 4).map((x) => ({ name: `${x.name} tutors in ${c.name}`, path: `/curriculum/${x.slug}-tutors-${c.slug}/` })),
        ...TOP.filter((x) => x.slug !== c.slug).map((x) => ({ name: `${cu.name} tutors in ${x.name}`, path: `/curriculum/${cu.slug}-tutors-${x.slug}/` })),
      ],
    });
  }
}

// ---- Exam × city ----------------------------------------------------------
for (const e of EXAMS) {
  for (const c of TOP) {
    page({
      path: `/exam/${e.slug}-preparation-${c.slug}/`,
      title: fitTitle(`${e.full} Preparation in ${c.name}`),
      description: `Prepare for the ${e.full} with a verified online tutor in ${c.name}. Tutors quote their own rates, you pay after the lesson, and TutorApp is free for parents.`,
      h1: `${e.full} preparation in ${c.name}`,
      crumbs: [{ name: "Home", path: "/" }, { name: "Exam prep", path: "/exam/" }, { name: `${e.name} in ${c.name}` }],
      body: `<p class="lede">One-to-one ${e.full} preparation with verified tutors, online, for students and adults in ${c.name}.</p>
<div class="badges"><span class="badge">Free for parents</span><span class="badge">Adults welcome</span><span class="badge">100% online</span></div>
<h2>What ${e.name} preparation involves</h2>
<p>${esc(e.note)}</p>
<h3>Typically covered</h3>
<ul>${e.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
<p>${esc(c.blurb)}</p>
${RATES(`${e.name} preparation`)}
${HOW}`,
      faq: [
        { q: `How long does ${e.name} preparation take?`, a: `It depends on the gap between your current level and your target. Most candidates work with a tutor over one to three months; tutors will tell you what they think is realistic after the first session.` },
        { q: `Can adults book ${e.name} tutoring?`, a: `Yes. ${e.name} preparation is open to adult learners as well as school students — TutorApp covers university and adult levels alongside school years.` },
        { q: `What does it cost?`, a: `Tutors set their own rates, generally ${RATE_MIN}–${RATE_MAX} AED per hour. There is no commission or booking fee on top.` },
      ],
      related: [
        ...EXAMS.filter((x) => x.slug !== e.slug).map((x) => ({ name: `${x.name} preparation in ${c.name}`, path: `/exam/${x.slug}-preparation-${c.slug}/` })),
        ...TOP.filter((x) => x.slug !== c.slug).map((x) => ({ name: `${e.name} in ${x.name}`, path: `/exam/${e.slug}-preparation-${x.slug}/` })),
      ],
    });
  }
}

// ---- Hubs -----------------------------------------------------------------
page({
  path: "/tutors/",
  title: "Online Tutors in the UAE by Subject | TutorApp Gulf",
  description: "Browse verified online tutors across the UAE by subject and city. Maths, Sciences, English, Arabic, French and more. Free for parents, no commission.",
  h1: "Find a tutor by subject",
  crumbs: [{ name: "Home", path: "/" }, { name: "Subjects" }],
  body: `<p class="lede">Verified online tutors across every UAE emirate. Choose a subject and city to see what tutoring looks like there, or post a request and let tutors come to you.</p>
${SUBJECTS.map((s) => `<h3>${esc(s.name)}</h3><p>${esc(s.signal)}</p><div class="links">${SUBJECT_CITIES.map((c) => `<a href="/tutors/${s.slug}-tutors-${c.slug}/">${esc(s.name)} in ${esc(c.name)}</a>`).join("")}</div>`).join("")}
${HOW}`,
  faq: [
    { q: "Which subjects can I find a tutor for?", a: `TutorApp covers ${list(SUBJECTS.map((s) => s.name))}, across primary, secondary and university level.` },
    { q: "Is it really free for parents?", a: "Yes — no commission, no booking fee. Tutors pay a subscription to be on the platform, which is how TutorApp is funded." },
  ],
  related: [{ name: "Browse by curriculum", path: "/curriculum/" }, { name: "Exam preparation", path: "/exam/" }],
});

page({
  path: "/curriculum/",
  title: "Tutors by Curriculum: IB, British, CBSE | TutorApp",
  description: "Find tutors who know your child's curriculum: IB, British GCSE and A-Level, American, Indian CBSE and ICSE, French MEN and Emirati MOE. Free for parents.",
  h1: "Find a tutor by curriculum",
  crumbs: [{ name: "Home", path: "/" }, { name: "Curricula" }],
  body: `<p class="lede">A tutor who knows the syllabus and its mark schemes is worth more than one who simply knows the subject. TutorApp covers the seven curricula taught across UAE schools.</p>
${CURRICULA.map((cu) => `<h3>${esc(cu.name)} — ${esc(cu.full)}</h3><p>${esc(cu.note)}</p><div class="links">${TOP.map((c) => `<a href="/curriculum/${cu.slug}-tutors-${c.slug}/">${esc(cu.name)} in ${esc(c.name)}</a>`).join("")}</div>`).join("")}
${HOW}`,
  faq: [{ q: "Which curricula do you cover?", a: `${list(CURRICULA.map((c) => c.full))}. Tutors declare which ones they teach, and requests are matched against that.` }],
  related: [{ name: "Browse by subject", path: "/tutors/" }, { name: "Exam preparation", path: "/exam/" }],
});

page({
  path: "/exam/",
  title: "Exam Prep Tutors: IELTS, TOEFL, SAT | TutorApp",
  description: "One-to-one online preparation for IELTS, TOEFL, SAT, ACT and EmSAT with verified tutors across the UAE. Open to students and adults. Free for parents.",
  h1: "Exam preparation tutors",
  crumbs: [{ name: "Home", path: "/" }, { name: "Exam prep" }],
  body: `<p class="lede">Targeted preparation for the exams that decide university places, visas and professional licences in the Gulf — with tutors who know the format, not just the subject.</p>
${EXAMS.map((e) => `<h3>${esc(e.full)}</h3><p>${esc(e.note)}</p><div class="links">${TOP.map((c) => `<a href="/exam/${e.slug}-preparation-${c.slug}/">${esc(e.name)} in ${esc(c.name)}</a>`).join("")}</div>`).join("")}
${HOW}`,
  faq: [
    { q: "Do you offer exam preparation for adults?", a: "Yes. IELTS, TOEFL and other exam preparation is open to adult learners as well as school students." },
    { q: "Which exams are covered?", a: `${list(EXAMS.map((e) => e.full))}, alongside GCSE and A-Level resits and IB Diploma preparation.` },
  ],
  related: [{ name: "Browse by subject", path: "/tutors/" }, { name: "Browse by curriculum", path: "/curriculum/" }],
});

for (const c of CITIES) {
  page({
    path: `/tutors/${c.slug}/`,
    title: fitTitle(`Online Tutors in ${c.name}`),
    description: `Find a verified online tutor in ${c.name} for any subject and curriculum. Tutors send you their rates, you pay after the lesson. Free for parents.`,
    h1: `Online tutors in ${c.name}`,
    crumbs: [{ name: "Home", path: "/" }, { name: "Subjects", path: "/tutors/" }, { name: c.name }],
    body: `<p class="lede">Verified tutors for families in ${c.name}, across every subject and curriculum taught locally.</p>
<h2>Tutoring in ${c.name}</h2>
<p>${esc(c.blurb)}</p>
<h3>By subject</h3>
<div class="links">${SUBJECTS.map((s) => `<a href="${SUBJECT_CITIES.some((t) => t.slug === c.slug) ? `/tutors/${s.slug}-tutors-${c.slug}/` : `/tutors/${s.slug}-tutors-dubai/`}">${esc(s.name)}</a>`).join("")}</div>
${TOP.some((t) => t.slug === c.slug) ? `<h3>By curriculum</h3><div class="links">${CURRICULA.map((cu) => `<a href="/curriculum/${cu.slug}-tutors-${c.slug}/">${esc(cu.name)}</a>`).join("")}</div><h3>Exam preparation</h3><div class="links">${EXAMS.map((e) => `<a href="/exam/${e.slug}-preparation-${c.slug}/">${esc(e.name)}</a>`).join("")}</div>` : ""}
${RATES("private tuition")}
${HOW}`,
    faq: [
      { q: `How quickly can I find a tutor in ${c.name}?`, a: "Once your request is posted, matched tutors are notified straight away and typically respond the same day with their rate and availability." },
      { q: "Do tutors travel to my home?", a: `Lessons are online, which is what lets families in ${c.name} reach tutors from across the country rather than only those nearby.` },
    ],
    related: CITIES.filter((x) => x.slug !== c.slug).map((x) => ({ name: `Tutors in ${x.name}`, path: `/tutors/${x.slug}/` })),
  });
}

// ---- Sitemap --------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${u.split("/").filter(Boolean).length === 1 ? "0.9" : "0.7"}</priority></url>`).join("\n")}
</urlset>
`;
if (!existsSync(DIST)) {
  console.error("dist/ not found — run `vite build` first.");
  process.exit(1);
}
writeFileSync(join(DIST, "sitemap.xml"), sitemap, "utf8");

console.log(`Generated ${urls.length} SEO pages + sitemap.xml`);
