// SEO catalogue: the search-intent layer that sits on top of the app's data.
// Slugs, keywords and per-page copy live here rather than in App.tsx because
// they exist only for search engines, not for the product.

export const SITE = "https://tutorapp.online";

export const CITIES = [
  {
    slug: "dubai", name: "Dubai", emirate: "Dubai",
    blurb: "Dubai schools run more curricula side by side than anywhere else in the region — British, IB, American, CBSE, ICSE, French and MOE all within a few districts of each other.",
    angle: "That variety has a practical consequence for tutoring: a tutor who is excellent for a Year 11 GCSE student may be the wrong choice for an IB Diploma student sitting the same subject, because the assessments barely resemble one another. Matching on curriculum, not just subject, is what separates a useful hour from a wasted one.",
    faq: { q: "Can I find a tutor who knows my child's specific Dubai school curriculum?", a: "Yes. Tutors declare which curricula they teach when they register — British, IB, American, CBSE, ICSE, French or MOE — and requests are matched against that, so you are not offered a tutor who has never taught the syllabus your child is sitting." },
  },
  {
    slug: "abu-dhabi", name: "Abu Dhabi", emirate: "Abu Dhabi",
    blurb: "Families in Abu Dhabi frequently sit at the intersection of two systems: an international curriculum at school, and ADEK expectations layered on top.",
    angle: "Arabic and Islamic Studies are compulsory alongside the main curriculum for many students in the capital, which quietly adds to an already full week. Tutoring here is often less about rescuing a failing grade than about protecting time — targeting the one or two subjects that are absorbing every evening.",
    faq: { q: "Do you have tutors familiar with ADEK requirements?", a: "Many tutors on the platform teach in Abu Dhabi and are used to the combination of an international curriculum with compulsory Arabic and Islamic Studies. You can state exactly what you need when posting a request." },
  },
  {
    slug: "sharjah", name: "Sharjah", emirate: "Sharjah",
    blurb: "Sharjah has one of the highest concentrations of CBSE, ICSE and MOE schools in the country, and a large share of families commute to Dubai for work.",
    angle: "That commute is the reason online tutoring took hold here faster than elsewhere. An in-person tutor has to fit between a parent getting home and a child's bedtime; a video lesson at seven in the evening does not. It also means a Sharjah family is no longer limited to whoever teaches nearby.",
    faq: { q: "Are there tutors for CBSE and ICSE board exams?", a: "Yes — CBSE and ICSE are among the curricula covered, including Class 10 and Class 12 board preparation, which is where most Sharjah families look for support." },
  },
  {
    slug: "ajman", name: "Ajman", emirate: "Ajman",
    blurb: "Ajman has far fewer tutoring centres than Dubai or Abu Dhabi relative to its school-age population.",
    angle: "For years that meant either travelling to a neighbouring emirate or accepting whoever was available locally. Online lessons remove the constraint entirely: the tutor pool a family in Ajman can reach is the same one available in Dubai, at the same rates, without anyone getting in a car.",
    faq: { q: "Is it a problem that there are few tutoring centres in Ajman?", a: "Not for online lessons. Because every lesson runs over video, families in Ajman have access to exactly the same tutors as families in Dubai, with no travel involved." },
  },
  {
    slug: "ras-al-khaimah", name: "Ras Al Khaimah", emirate: "Ras Al Khaimah",
    blurb: "Ras Al Khaimah sits far enough from the main population centres that in-person tutoring has always been thin on the ground.",
    angle: "Distance used to decide what was possible. It no longer does — a student in RAK preparing for A-Levels or the IB Diploma can work with a specialist who happens to live in Dubai or Abu Dhabi, and the lesson is identical to the one that student would have received in person.",
    faq: { q: "Can students outside the main cities get the same tutors?", a: "Yes. Lessons run online, so a student in Ras Al Khaimah has access to the same specialists as one in Dubai — including for subjects where local tutors are hard to find." },
  },
];

export const SUBJECTS = [
  {
    slug: "maths", name: "Maths", alt: "mathematics",
    topics: ["algebra", "geometry", "calculus", "statistics", "problem solving"],
    struggle: "Maths is the subject where gaps compound fastest. A student who never quite secured fractions in primary meets them again in algebra, then in calculus, and each time the difficulty is blamed on the new topic rather than the old one. A good tutor spends the first sessions finding where the foundation actually cracked, which is rarely where the current homework is.",
    signal: "The usual signal is a child who can follow the lesson in class but freezes on a blank page at home.",
  },
  {
    slug: "physics-chemistry", name: "Physics & Chemistry", alt: "physics and chemistry",
    topics: ["mechanics", "electricity", "organic chemistry", "stoichiometry", "practical write-ups"],
    struggle: "Physics and chemistry punish students who memorise. The content is not large, but it demands translating a worded scenario into the right equation — and that translation step is what most students never get taught explicitly. Tutoring here tends to be about method rather than more notes.",
    signal: "A typical pattern is strong recall of definitions paired with lost marks on every multi-step calculation.",
  },
  {
    slug: "english", name: "English", alt: "English language and literature",
    topics: ["essay writing", "comprehension", "literature analysis", "grammar", "speaking confidence"],
    struggle: "English is unusual in the Gulf because a large share of students are working in their second or third language while being assessed against native-speaker criteria. Two very different needs get filed under the same subject: building fluency, and learning to write the kind of analytical essay an examiner rewards. They call for different tutors.",
    signal: "Marks that plateau around the middle band despite obvious effort usually point to essay structure, not vocabulary.",
  },
  {
    slug: "arabic", name: "Arabic", alt: "Arabic",
    topics: ["reading fluency", "grammar (nahw)", "writing", "MOE Arabic A and B", "conversation"],
    struggle: "Arabic splits sharply between native-speaker streams and Arabic B, and the gap between spoken dialect at home and Modern Standard Arabic at school catches out many students who are otherwise fluent. It is also compulsory in UAE schools, which means it affects the overall grade whether or not the family speaks it.",
    signal: "Confident speakers losing marks in written work is the classic sign that the issue is MSA, not the language itself.",
  },
  {
    slug: "french", name: "French", alt: "French",
    topics: ["grammar", "oral expression", "written comprehension", "DELF preparation", "literature"],
    struggle: "French tutoring in the Gulf serves two distinct groups: students in the French national system working towards the Baccalauréat, and students taking French as a second language in an international school. The first needs a tutor who knows the Éducation nationale programme; the second does not.",
    signal: "For Bac students, the contrôle continu means a weak term is costly long before the final exams.",
  },
  {
    slug: "biology", name: "Biology", alt: "biology and SVT",
    topics: ["cell biology", "genetics", "human physiology", "ecology", "lab reports"],
    struggle: "Biology looks like the most memorisable science and is therefore the one students most often underestimate. The marks are lost in extended-response questions that ask them to explain a mechanism, not recall a label — and in lab write-ups, where a well-run experiment still scores badly if the analysis is thin.",
    signal: "High marks on multiple choice with weak extended answers is the pattern to watch for.",
  },
  {
    slug: "history-geography", name: "History & Geography", alt: "history and geography",
    topics: ["source analysis", "essay structure", "map skills", "case studies", "exam technique"],
    struggle: "These subjects reward argument, not coverage. Students who revise by rereading notes tend to write everything they know and score in the middle; the marks sit with those who can build a line of reasoning and use evidence to support it. That is a teachable skill, and it is what most tutoring here consists of.",
    signal: "Detailed, accurate essays that still come back mid-band almost always lack a clear argument.",
  },
  {
    slug: "computer-science", name: "Computer Science", alt: "computer science",
    topics: ["Python", "algorithms", "data structures", "databases", "coursework projects"],
    struggle: "Computer science splits into two things that feel unrelated to students: written theory papers and a substantial coursework project. Many cope with one and stall on the other. Project work in particular tends to drift without someone reviewing progress at regular intervals.",
    signal: "A stalled coursework project is the most common reason families look for a tutor in this subject.",
  },
  {
    slug: "economics", name: "Economics", alt: "economics",
    topics: ["micro and macro", "data response", "essay technique", "market structures", "exam practice"],
    struggle: "Economics is usually a new subject at sixth form, so there is no foundation to fall back on and no early warning. Students grasp the concepts in class and then lose marks on data-response questions, where the skill is selecting the right evidence from a source under time pressure rather than knowing more theory.",
    signal: "Understanding the diagrams but scoring poorly on evaluation questions is the usual profile.",
  },
  {
    slug: "spanish", name: "Spanish", alt: "Spanish",
    topics: ["grammar", "conversation", "written expression", "DELE preparation", "vocabulary"],
    struggle: "Spanish is most often a third or fourth language for students in the Gulf, taken alongside English and Arabic. The constraint is rarely aptitude — it is exposure. Without anyone to speak it with outside the classroom, the oral component becomes the weak point regardless of how good the written work is.",
    signal: "Strong written marks alongside a weak oral grade points to practice time, not ability.",
  },
];

export const CURRICULA = [
  { slug: "ib",       name: "IB",             full: "International Baccalaureate", levels: "PYP, MYP and Diploma Programme", note: "IB tutoring leans heavily on internal assessments, Extended Essays and TOK alongside the syllabus itself, so tutors need to know the mark schemes, not just the subject." },
  { slug: "british",  name: "British",        full: "British curriculum (GCSE / A-Level)", levels: "Year 1 to Year 13", note: "British-curriculum tutoring in the UAE centres on GCSE and A-Level exam technique, where knowing how marks are awarded often matters more than extra content." },
  { slug: "american", name: "American",       full: "American curriculum", levels: "Grade 1 to Grade 12", note: "American-curriculum tutoring usually blends GPA support across the year with SAT or AP preparation closer to college applications." },
  { slug: "cbse",     name: "CBSE",           full: "Indian CBSE curriculum", levels: "Class 1 to Class 12", note: "CBSE tutoring is shaped by the Class 10 and Class 12 board exams, where consistent practice against past papers is what moves grades." },
  { slug: "icse",     name: "ICSE",           full: "Indian ICSE / ISC curriculum", levels: "Class 1 to Class 12", note: "ICSE covers more ground in greater depth than most boards, so tutoring tends to focus on keeping pace rather than catching up." },
  { slug: "french",   name: "French (MEN)",   full: "French national curriculum", levels: "CP to Terminale", note: "Tutoring for the French system follows the Éducation nationale programme, with the Baccalauréat and its contrôle continu shaping the final years." },
  { slug: "moe",      name: "MOE",           full: "Emirati Ministry of Education curriculum", levels: "Grade 1 to Grade 12", note: "MOE tutoring covers the national syllabus in Arabic and English, with Islamic Studies and Arabic carrying particular weight." },
];

export const EXAMS = [
  { slug: "ielts", name: "IELTS", full: "IELTS", note: "Most IELTS candidates in the UAE need a specific band for a university place, a visa or a professional licence, so preparation is usually built backwards from that target band.", topics: ["Writing Task 1 and 2", "Speaking fluency", "Reading under time pressure", "Listening accuracy", "band-score strategy"] },
  { slug: "toefl", name: "TOEFL", full: "TOEFL iBT", note: "TOEFL is the usual requirement for North American universities, and its integrated tasks reward a very different technique from IELTS.", topics: ["integrated writing", "independent essays", "note-taking", "speaking templates", "time management"] },
  { slug: "sat",   name: "SAT",   full: "SAT", note: "SAT scores still carry weight for competitive university applications from the UAE, and the digital adaptive format rewards pacing as much as content.", topics: ["digital adaptive format", "Maths module", "Reading and Writing", "pacing", "official practice tests"] },
  { slug: "act",   name: "ACT",   full: "ACT", note: "The ACT suits students who work quickly and are comfortable with science reasoning, and it is accepted alongside the SAT by US universities.", topics: ["science reasoning", "Maths", "English", "Reading speed", "timing drills"] },
  { slug: "emsat", name: "EmSAT", full: "EmSAT", note: "EmSAT determines university placement in the UAE and exemption from foundation years, which makes a few extra points genuinely valuable.", topics: ["EmSAT English", "EmSAT Maths", "EmSAT Physics", "computer-based practice", "placement thresholds"] },
];

// Rate guidance shown on pages; mirrors TEACHER_RATES in the app.
export const RATE_MIN = 150;
export const RATE_MAX = 400;
