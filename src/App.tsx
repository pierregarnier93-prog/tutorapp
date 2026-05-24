import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadStripe } from "@stripe/stripe-js";

const supabase = createClient(
  "https://ihtcmemyrwejeetybepg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodGNtZW15cndlamVldHliZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ0NjAsImV4cCI6MjA5NDY5MDQ2MH0.xyGnBYE2ex1vn5jbwrbfTbvcUtNC9SmzBIUiRQoIPEo"
);

const stripePromise = loadStripe("pk_test_51TagWA4l4Z2J0IZfYprxlISAh0FG5mY8jnpugEHj5kVU5G55mViXn5dZUl53oZh5aLRPavhFk4sdEkyTp4eFfYKZ008mURFe7S");

// Commission 6% chaque côté = 12% total
const STUDENT_FEE = 0.06;   // élève paie +6%
const TEACHER_FEE = 0.06;   // enseignant reçoit -6%

// ─── API ──────────────────────────────────────────────────────
async function postRequest({ subject, instrLang, curriculum, level, cycle, durationMin, message, countryCode }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("requests").insert({
    poster_id: user.id, subject, instr_lang: instrLang, curriculum, level,
    cycle: Array.isArray(cycle) ? cycle.join(", ") : cycle,
    duration_min: durationMin || 60,
    budget_min_aed: 0, budget_max_aed: 9999,
    message, country_code: countryCode || "UAE", status: "open",
  }).select().single();
  if (error) throw error;
  return data;
}

async function getBidsForRequest(requestId) {
  const { data, error } = await supabase
    .from("bids")
    .select(`*, teacher:profiles!teacher_id(full_name, country_code)`)
    .eq("request_id", requestId).eq("status", "pending")
    .order("net_price_aed", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function submitBid({ requestId, netPriceAed, message }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("bids").insert({
    request_id: requestId, teacher_id: user.id,
    net_price_aed: netPriceAed, message, status: "pending",
  }).select().single();
  if (error) throw error;
  return data;
}

async function acceptBid(bidId, requestId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: bid } = await supabase.from("bids").select("*").eq("id", bidId).single();
  if (!bid) throw new Error("Bid not found");
  const netPrice = bid.net_price_aed;
  // Élève paie prix enseignant + 6%
  const grossPrice = Math.round(netPrice * (1 + STUDENT_FEE));
  // Enseignant reçoit prix - 6%
  const teacherPayout = Math.round(netPrice * (1 - TEACHER_FEE));
  const commission = grossPrice - teacherPayout;

  const { data: booking, error } = await supabase.from("bookings").insert({
    request_id: requestId, bid_id: bidId,
    poster_id: user.id, teacher_id: bid.teacher_id,
    net_price_aed: netPrice,
    gross_price_aed: grossPrice,
    commission_aed: commission,
    status: "pending_payment", country_code: "UAE",
  }).select().single();
  if (error) throw error;
  await supabase.from("bids").update({ status: "accepted" }).eq("id", bidId);
  await supabase.from("requests").update({ status: "closed" }).eq("id", requestId);
  return { ...booking, teacherPayout };
}

async function getOpenRequests(countryCode) {
  let query = supabase.from("requests")
    .select(`*, poster:profiles!poster_id(full_name), bids(count)`)
    .eq("status", "open").order("created_at", { ascending: false });
  if (countryCode) query = query.eq("country_code", countryCode);
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

// Simuler un paiement Stripe (mode test)
async function initiatePayment(booking, countryCode) {
  const stripe = await stripePromise;
  if (!stripe) throw new Error("Stripe not loaded");
  // En mode test on simule le checkout
  // En production : appeler une Edge Function Supabase qui crée la session Stripe
  return { success: true, bookingId: booking.id };
}

// ─── DATA ─────────────────────────────────────────────────────
const COUNTRIES = [
  { code:"UAE", flag:"🇦🇪", name:{en:"UAE",ar:"الإمارات",fr:"Émirats"}, currency:"AED", rate:1 },
  { code:"KSA", flag:"🇸🇦", name:{en:"Saudi Arabia",ar:"المملكة العربية السعودية",fr:"Arabie Saoudite"}, currency:"SAR", rate:1.02 },
  { code:"QAT", flag:"🇶🇦", name:{en:"Qatar",ar:"قطر",fr:"Qatar"}, currency:"QAR", rate:1.02 },
  { code:"KWT", flag:"🇰🇼", name:{en:"Kuwait",ar:"الكويت",fr:"Koweït"}, currency:"KWD", rate:0.11 },
  { code:"BAH", flag:"🇧🇭", name:{en:"Bahrain",ar:"البحرين",fr:"Bahreïn"}, currency:"BHD", rate:0.14 },
];

const CURRICULA = {
  british:  { label:{en:"British",ar:"البريطاني",fr:"Britannique"}, levels:{en:["Year 1","Year 2","Year 3","Year 4","Year 5","Year 6","Year 7","Year 8","Year 9","Year 10","Year 11 (GCSE)","Year 12 (A-Level)","Year 13 (A-Level)"],ar:["السنة 1","السنة 2","السنة 3","السنة 4","السنة 5","السنة 6","السنة 7","السنة 8","السنة 9","السنة 10","السنة 11","السنة 12","السنة 13"],fr:["Année 1","Année 2","Année 3","Année 4","Année 5","Année 6","7ème","8ème","9ème","10ème","GCSE","A-Level Y12","A-Level Y13"]}, cycles:["Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","High School (15-18)","High School (15-18)","High School (15-18)"] },
  french:   { label:{en:"French (MEN)",ar:"الفرنسي",fr:"Français (MEN)"}, levels:{en:["CP","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","2nde","1ère","Terminale"],ar:["CP","CE1","CE2","CM1","CM2","السادس","السابع","الثامن","التاسع","العاشر","الحادي عشر","الثاني عشر"],fr:["CP","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","2nde","1ère","Terminale"]}, cycles:["Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","High School (15-18)","High School (15-18)","High School (15-18)"] },
  american: { label:{en:"American",ar:"الأمريكي",fr:"Américain"}, levels:{en:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"],ar:["الصف 1","الصف 2","الصف 3","الصف 4","الصف 5","الصف 6","الصف 7","الصف 8","الصف 9","الصف 10","الصف 11","الصف 12"],fr:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"]}, cycles:["Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","High School (15-18)","High School (15-18)","High School (15-18)","High School (15-18)"] },
  emirati:  { label:{en:"Emirati (MOE)",ar:"الإماراتي",fr:"Émirati"}, levels:{en:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"],ar:["الصف 1","الصف 2","الصف 3","الصف 4","الصف 5","الصف 6","الصف 7","الصف 8","الصف 9","الصف 10","الصف 11","الصف 12"],fr:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"]}, cycles:["Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","High School (15-18)","High School (15-18)","High School (15-18)","High School (15-18)"] },
  ib:       { label:{en:"IB",ar:"البكالوريا الدولية",fr:"IB"}, levels:{en:["PYP Y1","PYP Y2","PYP Y3","PYP Y4","PYP Y5","PYP Y6","MYP Y1","MYP Y2","MYP Y3","MYP Y4","MYP Y5","DP Y1","DP Y2"],ar:["PYP 1","PYP 2","PYP 3","PYP 4","PYP 5","PYP 6","MYP 1","MYP 2","MYP 3","MYP 4","MYP 5","DP 1","DP 2"],fr:["PYP 1","PYP 2","PYP 3","PYP 4","PYP 5","PYP 6","MYP 1","MYP 2","MYP 3","MYP 4","MYP 5","DP 1","DP 2"]}, cycles:["Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Primary (6-11)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","Middle School (11-15)","High School (15-18)","High School (15-18)"] },
};

const getLevelsByCycle = (curriculum, cycle, lang) => {
  if (!curriculum || !CURRICULA[curriculum]) return [];
  const curric = CURRICULA[curriculum];
  return curric.levels[lang].filter((_, i) => curric.cycles[i] === cycle);
};

const SUBJECTS = [
  {icon:"➕",en:"Mathematics",ar:"الرياضيات",fr:"Mathématiques"},
  {icon:"⚗️",en:"Physics & Chemistry",ar:"الفيزياء والكيمياء",fr:"Physique-Chimie"},
  {icon:"📖",en:"English",ar:"اللغة الإنجليزية",fr:"Anglais"},
  {icon:"🌙",en:"Arabic",ar:"اللغة العربية",fr:"Arabe"},
  {icon:"🇫🇷",en:"French",ar:"اللغة الفرنسية",fr:"Français"},
  {icon:"🔬",en:"Biology (SVT)",ar:"علم الأحياء",fr:"SVT / Biologie"},
  {icon:"🗺️",en:"History & Geography",ar:"التاريخ والجغرافيا",fr:"Histoire-Géo"},
  {icon:"💻",en:"Computer Science",ar:"علوم الحاسوب",fr:"Informatique"},
  {icon:"📊",en:"Economics",ar:"الاقتصاد",fr:"Économie"},
  {icon:"🎨",en:"Arts",ar:"الفنون",fr:"Arts"},
  {icon:"💭",en:"Philosophy",ar:"الفلسفة",fr:"Philosophie"},
  {icon:"🌍",en:"Spanish",ar:"اللغة الإسبانية",fr:"Espagnol"},
];

const TEACHER_RATES = [150,200,250,300,350,400];

const UAE_REGIONS = [
  {code:"DXB",name:"Dubai"},{code:"AUH",name:"Abu Dhabi"},{code:"SHJ",name:"Sharjah"},
  {code:"AJM",name:"Ajman"},{code:"RAK",name:"Ras Al Khaimah"},{code:"FUJ",name:"Fujairah"},{code:"UAQ",name:"Umm Al Quwain"},
];

const TEACHERS=[{initials:"سا",name:{en:"Sarah Al-Mansouri",ar:"سارة المنصوري",fr:"Sarah Al-Mansouri"},verified:true,subjects:["Mathematics","Arabic"],instrLangs:["English","Arabic"],rate:200,rating:4.9,reviews:47,bg:"#EEF0FF",color:"#5B4FE8",country:"UAE"},{initials:"كم",name:{en:"Karim Mansour",ar:"كريم منصور",fr:"Karim Mansour"},verified:true,subjects:["French","History & Geography"],instrLangs:["French","Arabic"],rate:150,rating:4.6,reviews:23,bg:"#E6FAF8",color:"#0ABFA3",country:"KSA"},{initials:"ند",name:{en:"Nadia Deschamps",ar:"ناديا دوشان",fr:"Nadia Deschamps"},verified:true,subjects:["Mathematics","Biology (SVT)"],instrLangs:["French","English"],rate:250,rating:5.0,reviews:11,bg:"#FEF6E4",color:"#B45309",country:"QAT"},{initials:"را",name:{en:"Rania Aziz",ar:"رانيا عزيز",fr:"Rania Aziz"},verified:false,subjects:["English","Spanish"],instrLangs:["English","Arabic","French"],rate:150,rating:4.4,reviews:8,bg:"#FEE2E2",color:"#B91C1C",country:"KWT"}];
const SUGGESTIONS=[{icon:"➕",subject:{en:"Advanced Algebra",ar:"الجبر المتقدم",fr:"Algèbre avancée"},level:{en:"Grade 11",ar:"الصف الحادي عشر",fr:"1ère"},students:6,lang:{en:"in Arabic",ar:"بالعربية",fr:"en arabe"}},{icon:"🌙",subject:{en:"Arabic Language",ar:"اللغة العربية",fr:"Langue arabe"},level:{en:"Grade 7",ar:"الصف السابع",fr:"5ème"},students:9,lang:{en:"in Arabic",ar:"بالعربية",fr:"en arabe"}},{icon:"⚗️",subject:{en:"Chemistry",ar:"الكيمياء",fr:"Chimie"},level:{en:"A-Level",ar:"A-Level",fr:"Terminale"},students:4,lang:{en:"in English",ar:"بالإنجليزية",fr:"en anglais"}}];

const T = {
  en: {
    dir:"ltr",
    nav:{search:"Find a tutor",teach:"Teach",teachers:"Tutors",start:"Get started"},
    hero:{badge:"Gulf Region · 100% Online · Verified Tutors",h1:"Find a tutor in ",h1span:"5 minutes,",h1b:" not 5 days.",sub:"Post your need, tutors propose their price, you accept or decline. Pay after the lesson.",cta1:"Find a tutor →",cta2:"Become a tutor",s1v:"200+",s1l:"Verified tutors",s2v:"15 min",s2l:"Avg response time",s3v:"4.9★",s3l:"Average rating",s4v:"5",s4l:"Gulf countries"},
    how:{label:"How it works",title:"As simple as ",titleSpan:"booking a ride",steps:[{icon:"📋",t:"Post your request",d:"Subject and level. No budget needed."},{icon:"⚡",t:"Tutors propose prices",d:"Each tutor submits their own rate."},{icon:"👆",t:"Accept or decline",d:"See the price, accept if it suits you."},{icon:"🎓",t:"Lesson + Pay after",d:"Video link sent automatically. Pay after."}]},
    subjects:{label:"All subjects",title:"Maths in ",titleSpan:"English, Arabic or French"},
    form:{title:"Post your request",sub:"Your profile is pre-filled — just select a subject and post!",subject:"Subject *",lang:"Language of instruction",curriculum:"Curriculum",level:"Level *",duration:"Duration",msg:"Message to tutors",msgPh:"Describe difficulties, goals, availability...",publish:"Post request →",onlineBanner:"All lessons via video call — link sent automatically after booking."},
    bids:{title:"Offers received",new:"offers",payAfter:"💳 Pay ONLY after the lesson — 6% service fee applies",accept:"Accept & Book →",decline:"Decline",noOffers:"Waiting for tutor offers...",noOffersDesc:"Tutors will submit their offers shortly."},
    payment:{title:"Confirm & Pay",sub:"Payment is processed after the lesson.",lessonPrice:"Lesson price",serviceFee:"Service fee (6%)",total:"Total",teacherReceives:"Teacher receives",platformFee:"Platform fee",payBtn:"Confirm booking →",payNote:"💳 Your card will be charged AFTER the lesson is completed.",testMode:"🧪 Test mode — use card 4242 4242 4242 4242"},
    confirm:{title:"Booking confirmed! 🎉",sub1:"Your lesson with ",sub2:" is confirmed.",subject:"Subject",teacher:"Tutor",price:"You pay",teacherGets:"Teacher receives",jitsi:"Video link",jitsiNote:"Will be sent by email before the lesson.",pay:"Payment after lesson",secured:"✓ Secured by Stripe",newReq:"Post another request"},
    teacher:{hello:"Hello 👋",sub:"New requests matching your teaching levels.",revenue:"this month",courses:"Lessons",rating:"Rating",newAds:"Open requests",bid:"Make offer →",ignore:"Ignore",suggestions:"Suggested for you",withdrawal:"Automatic payout",wI:"Immediate",wW:"Weekly",wM:"Monthly",wInfo:"85% of each lesson transferred automatically to your account.",profile:"My profile",yourRate:"Your rate",rateHint:"You receive 94% after 6% platform fee"},
    bidForm:{back:"← Back",price:"Your rate (AED/h)",msg:"Your message to the student",msgPh:"Introduce yourself, experience, availability...",send:"Send offer →",recv:"✓ You receive",afterC:"after 6% fee"},
    onboard:{title:"Create tutor profile",sub:"Join 200+ verified tutors across the Gulf.",name:"Full name *",email:"Email *",bio:"Bio",bioPh:"Your background & teaching style...",cycle:"Teaching cycle *",subjects:"Subjects *",curriculum:"Curriculum(s) *",langTeach:"Teaching language(s) *",rate:"Your hourly rate (AED) *",eid:"Emirates ID / Iqama *",diploma:"Diploma(s) *",eidPh:"Upload ID document",diplomaPh:"Upload diploma(s)",submit:"Create profile →"},
    signup:{role:"You are *",student:"Student / Parent",teacher:"Teacher",name:"Full name *",country:"Country *",emirate:"Emirate *",lang:"Preferred language",curriculum:"Your curriculum *",instrLang:"Language of instruction *",level:"Your current level *",age:"Your age"},
    cycles:["Primary (6-11)","Middle School (11-15)","High School (15-18)"],
    instrLangs:["English","Arabic","French"],
    durations:["30 min","1h","1h30","2h","2h30","3h"],
    footer:"The 100% online tutoring marketplace for the Gulf region. Verified tutors, pay after the lesson.",
  },
  ar: {
    dir:"rtl",
    nav:{search:"أبحث عن مدرس",teach:"أدرّس",teachers:"المدرسون",start:"ابدأ الآن"},
    hero:{badge:"منطقة الخليج · 100% عبر الإنترنت",h1:"ابحث عن مدرس في ",h1span:"5 دقائق،",h1b:" لا 5 أيام.",sub:"انشر احتياجك، المدرسون يقترحون أسعارهم، ادفع بعد الحصة.",cta1:"ابحث عن مدرس ←",cta2:"أصبح مدرساً",s1v:"200+",s1l:"مدرس موثّق",s2v:"15 د",s2l:"متوسط وقت الرد",s3v:"4.9★",s3l:"متوسط التقييم",s4v:"5",s4l:"دول خليجية"},
    how:{label:"كيف يعمل",title:"بسيط مثل ",titleSpan:"حجز سيارة أجرة",steps:[{icon:"📋",t:"انشر طلبك",d:"المادة والمستوى فقط."},{icon:"⚡",t:"المدرسون يقترحون أسعارهم",d:"كل مدرس يقدم سعره."},{icon:"👆",t:"اقبل أو ارفض",d:"شاهد السعر واقبله إن ناسبك."},{icon:"🎓",t:"حصة + دفع بعدها",d:"رابط الفيديو يُرسل تلقائياً."}]},
    subjects:{label:"جميع المواد",title:"الرياضيات بـ",titleSpan:"العربية أو الإنجليزية أو الفرنسية"},
    form:{title:"انشر طلبك",sub:"ملفك مُعبأ مسبقاً — اختر المادة وانشر!",subject:"المادة *",lang:"لغة التدريس",curriculum:"المنهج",level:"المستوى *",duration:"المدة",msg:"رسالة للمدرسين",msgPh:"صف الصعوبات والأهداف...",publish:"نشر الطلب ←",onlineBanner:"جميع الحصص عبر مكالمة فيديو."},
    bids:{title:"العروض المستلمة",new:"عروض",payAfter:"💳 تدفع بعد الحصة — رسوم خدمة 6%",accept:"قبول وحجز ←",decline:"رفض",noOffers:"في انتظار عروض المدرسين...",noOffersDesc:"سيقدم المدرسون عروضهم قريباً."},
    payment:{title:"تأكيد والدفع",sub:"يتم الدفع بعد الحصة.",lessonPrice:"سعر الحصة",serviceFee:"رسوم الخدمة (6%)",total:"المجموع",teacherReceives:"يستلم المدرس",platformFee:"رسوم المنصة",payBtn:"تأكيد الحجز ←",payNote:"💳 ستُخصم من بطاقتك بعد انتهاء الحصة.",testMode:"🧪 وضع الاختبار — استخدم البطاقة 4242 4242 4242 4242"},
    confirm:{title:"تم تأكيد الحجز! 🎉",sub1:"حصتك مع ",sub2:" مؤكدة.",subject:"المادة",teacher:"المدرس",price:"ستدفع",teacherGets:"يستلم المدرس",jitsi:"رابط الفيديو",jitsiNote:"سيُرسل بالبريد قبل الحصة.",pay:"الدفع بعد الحصة",secured:"✓ مؤمّن بـ Stripe",newReq:"نشر طلب جديد"},
    teacher:{hello:"مرحباً 👋",sub:"طلبات جديدة تتناسب مع مستوياتك.",revenue:"هذا الشهر",courses:"الحصص",rating:"التقييم",newAds:"الطلبات المفتوحة",bid:"تقديم عرض ←",ignore:"تجاهل",suggestions:"مقترحات لك",withdrawal:"صرف تلقائي",wI:"فوري",wW:"أسبوعي",wM:"شهري",wInfo:"94% من كل حصة تُحوَّل تلقائياً لحسابك.",profile:"ملفي الشخصي",yourRate:"سعرك",rateHint:"تستلم 94% بعد رسوم 6%"},
    bidForm:{back:"← رجوع",price:"سعرك (AED/ساعة)",msg:"رسالتك للطالب",msgPh:"عرّف بنفسك وخبرتك...",send:"إرسال العرض ←",recv:"✓ ستحصل على",afterC:"بعد رسوم 6%"},
    onboard:{title:"أنشئ ملف المدرس",sub:"انضم لأكثر من 200 مدرس موثّق.",name:"الاسم الكامل *",email:"البريد الإلكتروني *",bio:"نبذة عنك",bioPh:"خلفيتك وأسلوبك...",cycle:"المرحلة التعليمية *",subjects:"المواد *",curriculum:"المناهج *",langTeach:"لغة التدريس *",rate:"سعرك بالساعة (AED) *",eid:"الهوية / الإقامة *",diploma:"الشهادة *",eidPh:"رفع وثيقة الهوية",diplomaPh:"رفع الشهادة",submit:"إنشاء الملف ←"},
    signup:{role:"أنت *",student:"طالب / ولي أمر",teacher:"مدرس",name:"الاسم الكامل *",country:"الدولة *",emirate:"الإمارة *",lang:"اللغة المفضلة",curriculum:"منهجك الدراسي *",instrLang:"لغة التدريس *",level:"مستواك الحالي *",age:"عمرك"},
    cycles:["الابتدائية (6-11)","المتوسطة (11-15)","الثانوية (15-18)"],
    instrLangs:["الإنجليزية","العربية","الفرنسية"],
    durations:["30 دقيقة","ساعة","ساعة ونصف","ساعتان","ساعتان ونصف","3 ساعات"],
    footer:"سوق الدروس الخصوصية في منطقة الخليج.",
  },
  fr: {
    dir:"ltr",
    nav:{search:"Je cherche un cours",teach:"J'enseigne",teachers:"Enseignants",start:"Commencer"},
    hero:{badge:"Golfe · 100% Distanciel · Enseignants vérifiés",h1:"Trouve un prof en ",h1span:"5 minutes,",h1b:" pas en 5 jours.",sub:"Poste ton besoin, les profs proposent leurs prix, tu acceptes ou refuses. Paiement après le cours.",cta1:"Je cherche un cours →",cta2:"Je suis enseignant",s1v:"200+",s1l:"Enseignants vérifiés",s2v:"15 min",s2l:"Temps de réponse",s3v:"4.9★",s3l:"Note moyenne",s4v:"5",s4l:"Pays du Golfe"},
    how:{label:"Comment ça marche",title:"Aussi simple que ",titleSpan:"commander un taxi",steps:[{icon:"📋",t:"Tu postes ton besoin",d:"Matière et niveau. Pas de budget."},{icon:"⚡",t:"Les profs proposent leurs prix",d:"Chaque enseignant soumet son tarif."},{icon:"👆",t:"Tu acceptes ou refuses",d:"Tu vois le prix et tu décides."},{icon:"🎓",t:"Cours + Paiement après",d:"Lien visio automatique. Tu paies après."}]},
    subjects:{label:"Toutes les matières",title:"Les maths en ",titleSpan:"anglais, arabe ou français"},
    form:{title:"Poste ton annonce",sub:"Ton profil est pré-rempli — choisis juste une matière et publie !",subject:"Matière *",lang:"Langue d'enseignement",curriculum:"Cursus",level:"Niveau *",duration:"Durée",msg:"Message pour les enseignants",msgPh:"Décris les difficultés et objectifs...",publish:"Publier l'annonce →",onlineBanner:"Tous les cours en visioconférence."},
    bids:{title:"Offres reçues",new:"offres",payAfter:"💳 Paiement APRÈS le cours — frais de service 6%",accept:"Accepter & Réserver →",decline:"Refuser",noOffers:"En attente d'offres...",noOffersDesc:"Les enseignants vont soumettre leurs offres sous peu."},
    payment:{title:"Confirmer & Payer",sub:"Le paiement est prélevé après le cours.",lessonPrice:"Prix du cours",serviceFee:"Frais de service (6%)",total:"Total",teacherReceives:"L'enseignant reçoit",platformFee:"Commission plateforme",payBtn:"Confirmer la réservation →",payNote:"💳 Ta carte sera débitée APRÈS le cours.",testMode:"🧪 Mode test — utilise la carte 4242 4242 4242 4242"},
    confirm:{title:"Réservation confirmée ! 🎉",sub1:"Ton cours avec ",sub2:" est confirmé.",subject:"Matière",teacher:"Enseignant",price:"Tu paieras",teacherGets:"L'enseignant reçoit",jitsi:"Lien visio",jitsiNote:"Sera envoyé par email avant le cours.",pay:"Paiement après le cours",secured:"✓ Sécurisé par Stripe",newReq:"Poster une nouvelle annonce"},
    teacher:{hello:"Bonjour 👋",sub:"Nouvelles annonces correspondant à tes niveaux.",revenue:"ce mois",courses:"Cours",rating:"Note",newAds:"Annonces ouvertes",bid:"Faire une offre →",ignore:"Ignorer",suggestions:"Suggestions pour toi",withdrawal:"Retrait automatique",wI:"Immédiat",wW:"Hebdomadaire",wM:"Mensuel",wInfo:"94% de chaque cours viré automatiquement sur ton compte.",profile:"Mon profil",yourRate:"Ton tarif",rateHint:"Tu reçois 94% après 6% de frais plateforme"},
    bidForm:{back:"← Retour",price:"Ton tarif (AED/h)",msg:"Ton message à l'élève",msgPh:"Présente-toi et ton expérience...",send:"Envoyer mon offre →",recv:"✓ Tu recevras",afterC:"après 6% de frais"},
    onboard:{title:"Crée ton profil enseignant",sub:"Rejoins +200 enseignants vérifiés.",name:"Nom complet *",email:"Email *",bio:"Biographie",bioPh:"Ton parcours et ta pédagogie...",cycle:"Cycle enseigné *",subjects:"Matières *",curriculum:"Cursus *",langTeach:"Langue(s) d'enseignement *",rate:"Ton tarif horaire (AED) *",eid:"Emirates ID / Iqama *",diploma:"Diplôme(s) *",eidPh:"Uploader pièce d'identité",diplomaPh:"Uploader diplôme(s)",submit:"Créer mon profil →"},
    signup:{role:"Tu es *",student:"Élève / Parent",teacher:"Enseignant",name:"Nom complet *",country:"Pays *",emirate:"Émirat *",lang:"Langue préférée",curriculum:"Ton cursus *",instrLang:"Langue d'enseignement *",level:"Ton niveau actuel *",age:"Ton âge"},
    cycles:["Élémentaire (6-11 ans)","Collège (11-15 ans)","Lycée (15-18 ans)"],
    instrLangs:["Anglais","Arabe","Français"],
    durations:["30 min","1h","1h30","2h","2h30","3h"],
    footer:"La marketplace de cours particuliers 100% en ligne pour le Golfe.",
  },
};

const css=`
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,900;1,9..144,700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#FAFBFF;color:#1A1A2E}
.app-root{font-family:'Nunito',sans-serif}
.app-root.rtl{font-family:'Cairo',sans-serif;direction:rtl}
.nav{position:sticky;top:0;z-index:100;background:rgba(250,251,255,.95);backdrop-filter:blur(14px);border-bottom:1px solid #E8EAF6;padding:0 1.5rem;display:flex;align-items:center;justify-content:space-between;height:64px;gap:12px}
.nav-logo{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#5B4FE8;cursor:pointer;letter-spacing:-.5px;white-space:nowrap}
.nav-links{display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap}
.nav-link{font-size:13px;color:#6B7280;cursor:pointer;font-weight:700;transition:color .2s;white-space:nowrap}.nav-link:hover{color:#5B4FE8}
.lang-switch{display:flex;border:1.5px solid #E8EAF6;border-radius:8px;overflow:hidden}
.lang-btn{padding:5px 10px;cursor:pointer;transition:all .15s;color:#6B7280;background:transparent;border:none;font-size:12px;font-weight:800}.lang-btn.active{background:#5B4FE8;color:#fff}
.country-select{border:1.5px solid #E8EAF6;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;color:#374151;background:#fff;cursor:pointer;outline:none}
.nav-cta{background:#5B4FE8;color:#fff;border:none;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:800;cursor:pointer;transition:background .2s;white-space:nowrap}.nav-cta:hover{background:#3D34C4}
.nav-logout{background:#F4F5F7;color:#374151;border:none;border-radius:10px;padding:9px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}.nav-logout:hover{background:#E5E7EB}
.user-badge{background:#EEF0FF;color:#5B4FE8;border-radius:20px;padding:5px 12px;font-size:12px;font-weight:700;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.hero{min-height:90vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4rem 2rem;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 55% at 50% 0%,#EEEEFF 0%,transparent 70%);z-index:0}
.hero-badge{display:inline-flex;align-items:center;gap:7px;background:#EEF0FF;color:#5B4FE8;border:1px solid #C7C2F8;border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700;margin-bottom:1.5rem;position:relative;z-index:1}
.hero-dot{width:7px;height:7px;border-radius:50%;background:#5B4FE8;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.hero h1{font-family:'Fraunces',serif;font-size:clamp(2.2rem,5.5vw,4rem);font-weight:900;line-height:1.1;letter-spacing:-1px;color:#1A1A2E;max-width:820px;margin-bottom:1.25rem;position:relative;z-index:1}
.rtl .hero h1{font-family:'Cairo',sans-serif;letter-spacing:0}
.hero h1 span{color:#5B4FE8;font-style:italic}
.hero p{font-size:1.05rem;color:#6B7280;max-width:540px;line-height:1.75;margin-bottom:2.5rem;position:relative;z-index:1;font-weight:500}
.hero-btns{display:flex;gap:12px;position:relative;z-index:1;flex-wrap:wrap;justify-content:center}
.btn-big{padding:14px 28px;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;border:none;transition:all .2s}
.btn-big-primary{background:#5B4FE8;color:#fff}.btn-big-primary:hover{background:#3D34C4;transform:translateY(-2px)}
.btn-big-outline{background:transparent;color:#5B4FE8;border:2px solid #5B4FE8}.btn-big-outline:hover{background:#EEF0FF}
.hero-stats{display:flex;gap:2.5rem;margin-top:3.5rem;position:relative;z-index:1;flex-wrap:wrap;justify-content:center}
.hero-stat-val{font-family:'Fraunces',serif;font-size:1.8rem;font-weight:900;color:#1A1A2E}
.hero-stat-lbl{font-size:12px;color:#6B7280;margin-top:2px;font-weight:600}
.float-card{position:absolute;background:#fff;border:1px solid #E8EAF6;border-radius:16px;padding:12px 16px;font-size:12px;animation:float 6s ease-in-out infinite;box-shadow:0 4px 20px rgba(91,79,232,.08);font-weight:500}
.float-card:nth-child(1){top:18%;left:4%;animation-delay:0s}.float-card:nth-child(2){top:24%;right:4%;animation-delay:-2s}.float-card:nth-child(3){bottom:20%;left:7%;animation-delay:-4s}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.section{padding:5rem 2rem;max-width:1100px;margin:0 auto}
.section-label{font-size:11px;font-weight:800;letter-spacing:.12em;color:#5B4FE8;text-transform:uppercase;margin-bottom:.6rem}
.section-title{font-family:'Fraunces',serif;font-size:clamp(1.7rem,3.5vw,2.5rem);font-weight:900;letter-spacing:-.3px;color:#1A1A2E;margin-bottom:2.5rem}
.section-title span{color:#5B4FE8;font-style:italic}
.steps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1.25rem}
.step-card{background:#fff;border:1.5px solid #E8EAF6;border-radius:18px;padding:1.75rem;position:relative;overflow:hidden;transition:border-color .2s,transform .2s}
.step-card:hover{border-color:#5B4FE8;transform:translateY(-4px)}
.step-num-bg{position:absolute;top:-14px;right:-6px;font-family:'Fraunces',serif;font-size:86px;font-weight:900;color:#F4F5FF;line-height:1;user-select:none}
.step-icon{font-size:28px;margin-bottom:1rem}
.step-card h3{font-family:'Fraunces',serif;font-size:16px;font-weight:700;margin-bottom:.4rem}
.step-card p{font-size:13px;color:#6B7280;line-height:1.6;font-weight:500}
.subj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.subj-card{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #E8EAF6;border-radius:14px;padding:12px 16px;cursor:pointer;transition:all .2s;font-weight:700;font-size:13px}
.subj-card:hover{border-color:#5B4FE8;background:#EEF0FF;color:#5B4FE8}
.teachers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:1.25rem}
.teacher-card{background:#fff;border:1.5px solid #E8EAF6;border-radius:18px;padding:1.5rem;transition:border-color .2s,transform .2s;cursor:pointer}
.teacher-card:hover{border-color:#5B4FE8;transform:translateY(-3px)}
.tc-avatar{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;flex-shrink:0}
.pill{background:#EEF0FF;color:#5B4FE8;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:800}
.pill-teal{background:#E6FAF8;color:#0ABFA3}
.app-container{background:#fff;border:1.5px solid #E8EAF6;border-radius:22px;overflow:hidden;box-shadow:0 8px 48px rgba(91,79,232,.08)}
.app-topbar{background:#1A1A2E;padding:12px 20px;display:flex;align-items:center;gap:12px}
.app-dot-row{display:flex;gap:6px}
.app-dot{width:10px;height:10px;border-radius:50%}
.app-url{flex:1;background:#252540;border-radius:6px;padding:5px 12px;font-size:11px;color:#6B7280;font-family:monospace}
.app-tabs{display:flex;border-bottom:1.5px solid #E8EAF6;background:#FAFBFF}
.app-tab{padding:14px 22px;font-size:13px;font-weight:800;cursor:pointer;border-bottom:2.5px solid transparent;color:#6B7280;transition:all .2s;white-space:nowrap}
.app-tab.active{color:#5B4FE8;border-bottom-color:#5B4FE8;background:#fff}
.app-body{padding:2rem;min-height:520px}
.page-title{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#1A1A2E;margin-bottom:.3rem}
.page-sub{font-size:13px;color:#6B7280;margin-bottom:1.5rem;font-weight:500}
.prefilled-banner{background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:600;color:#166534;margin-bottom:1.5rem;display:flex;align-items:center;gap:8px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.form-group{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.form-label{font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.06em}
.form-select,.form-input,.form-textarea{border:1.5px solid #E8EAF6;border-radius:12px;padding:10px 14px;font-size:14px;background:#FAFBFF;color:#1A1A2E;outline:none;transition:border-color .2s;width:100%;font-weight:500}
.form-select:focus,.form-input:focus,.form-textarea:focus{border-color:#5B4FE8;background:#fff}
.form-select.prefilled{background:#F0FDF4;border-color:#86EFAC;color:#166534;font-weight:600}
.form-textarea{min-height:75px;resize:vertical}
.chips-row{display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:7px 16px;border-radius:20px;font-size:13px;font-weight:700;border:1.5px solid #E8EAF6;background:#fff;cursor:pointer;transition:all .2s}
.chip.selected{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.chip:hover:not(.selected){border-color:#5B4FE8;color:#5B4FE8}
.chip-teal.selected{background:#0ABFA3;border-color:#0ABFA3}
.rate-chips{display:flex;flex-wrap:wrap;gap:8px}
.rate-chip{padding:10px 18px;border-radius:12px;font-size:14px;font-weight:800;border:1.5px solid #E8EAF6;background:#fff;cursor:pointer;transition:all .2s;font-family:'Fraunces',serif}
.rate-chip.selected{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.rate-chip:hover:not(.selected){border-color:#5B4FE8;color:#5B4FE8}
.submit-btn{width:100%;padding:14px;background:#5B4FE8;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;margin-top:1.25rem;transition:background .2s}
.submit-btn:hover{background:#3D34C4}
.submit-btn:disabled{background:#C7C2F8;cursor:not-allowed}
.online-banner{display:flex;align-items:center;gap:10px;background:#EEF0FF;border:1.5px solid #C7C2F8;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:700;color:#3D34C4;margin-bottom:1.5rem}
.pay-banner{display:flex;align-items:center;gap:8px;background:#E6FAF8;border:1.5px solid #0ABFA3;border-radius:12px;padding:11px 16px;font-size:13px;font-weight:700;color:#0F6E56;margin-bottom:1.25rem}
.badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge-purple{background:#EEF0FF;color:#5B4FE8}.badge-amber{background:#FEF6E4;color:#B45309}.badge-green{background:#E6FAF8;color:#0ABFA3}.badge-blue{background:#EFF6FF;color:#1D4ED8}.badge-gray{background:#F4F5F7;color:#374151}
.offer-card{border:1.5px solid #E8EAF6;border-radius:18px;padding:1.5rem;margin-bottom:14px;background:#fff;transition:border-color .2s}
.offer-card:hover{border-color:#5B4FE8}
.offer-price{font-family:'Fraunces',serif;font-size:28px;font-weight:900;color:#5B4FE8}
.offer-teacher{font-weight:800;font-size:16px;color:#1A1A2E;margin-bottom:4px}
.offer-msg{font-size:13px;color:#6B7280;line-height:1.55;margin:8px 0 14px}
.offer-actions{display:flex;gap:10px}
.btn-accept{flex:2;padding:12px;background:#5B4FE8;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;transition:background .2s}
.btn-accept:hover{background:#3D34C4}
.btn-decline{flex:1;padding:12px;background:transparent;border:1.5px solid #E8EAF6;border-radius:12px;font-size:14px;color:#6B7280;font-weight:700;cursor:pointer;transition:all .2s}
.btn-decline:hover{border-color:#EF4444;color:#EF4444}
.payment-screen{max-width:480px;margin:0 auto}
.payment-card{background:#fff;border:1.5px solid #E8EAF6;border-radius:20px;padding:1.75rem;margin-bottom:1.25rem}
.payment-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F4F5F7;font-size:14px}
.payment-row:last-child{border-bottom:none}
.payment-total{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#5B4FE8}
.payment-note{background:#FEF6E4;border:1px solid #FCD34D;border-radius:12px;padding:12px 16px;font-size:12px;color:#92400E;margin-bottom:1.25rem;font-weight:600}
.payment-test{background:#EEF0FF;border:1px solid #C7C2F8;border-radius:12px;padding:12px 16px;font-size:12px;color:#3D34C4;margin-bottom:1.25rem;font-weight:600}
.stripe-badge{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:#9CA3AF;margin-top:10px;font-weight:600}
.teacher-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:1.5rem}
.stat-card{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:16px;padding:1rem;text-align:center}
.stat-val{font-family:'Fraunces',serif;font-size:24px;font-weight:900;color:#5B4FE8}
.stat-lbl{font-size:11px;color:#6B7280;margin-top:4px;font-weight:600}
.withdrawal-card{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:16px;padding:1.25rem;margin-bottom:1.5rem}
.suggestions-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:1.5rem}
.suggestion-card{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:14px;padding:1rem;cursor:pointer;transition:all .2s}
.suggestion-card:hover{border-color:#5B4FE8;background:#EEF0FF}
.req-card{border:1.5px solid #E8EAF6;border-radius:16px;padding:1.25rem;margin-bottom:12px;transition:border-color .2s}
.req-card:hover{border-color:#0ABFA3}
.req-title{font-family:'Fraunces',serif;font-size:16px;font-weight:700;color:#1A1A2E}
.upload-zone{border:2px dashed #C7C2F8;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;background:#FAFBFF}
.upload-zone:hover{border-color:#5B4FE8;background:#EEF0FF}
.btn-teal{flex:1;padding:9px;background:#0ABFA3;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;transition:background .2s}
.btn-teal:hover{background:#089e87}
.btn-ghost{padding:9px 14px;background:transparent;border:1.5px solid #E8EAF6;border-radius:10px;font-size:13px;color:#6B7280;font-weight:700;cursor:pointer;transition:border-color .2s}
.btn-ghost:hover{border-color:#6B7280;color:#1A1A2E}
.success-screen{text-align:center;padding:2rem 1rem}
.confirm-detail{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:16px;padding:1.25rem;max-width:380px;margin:0 auto 1.5rem;text-align:start}
.confirm-row{display:flex;justify-content:space-between;font-size:14px;padding:6px 0;border-bottom:1px solid #F4F5F7}
.confirm-row:last-child{border-bottom:none;padding-top:10px;margin-top:4px}
.jitsi-box{background:#E6FAF8;border:1.5px solid #0ABFA3;border-radius:12px;padding:14px;max-width:380px;margin:0 auto 1.25rem;text-align:center}
.loading-spinner{text-align:center;padding:3rem;color:#6B7280;font-size:14px;font-weight:600}
.empty-state{text-align:center;padding:3rem;color:#6B7280}
.empty-icon{font-size:48px;margin-bottom:1rem}
.footer{background:#1A1A2E;color:#9CA3AF;padding:3rem 2rem;text-align:center;margin-top:4rem}
.footer-logo{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#fff;margin-bottom:.75rem}
.toast{position:fixed;bottom:2rem;right:2rem;background:#1A1A2E;color:#fff;padding:14px 20px;border-radius:14px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:10px;z-index:999;animation:slideUp .3s ease;box-shadow:0 8px 32px rgba(0,0,0,.2)}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.auth-overlay{position:fixed;inset:0;background:rgba(26,26,46,0.75);backdrop-filter:blur(8px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem}
.auth-box{background:#fff;border-radius:24px;padding:2.5rem;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(91,79,232,0.15);position:relative;max-height:90vh;overflow-y:auto}
.auth-logo{font-family:'Fraunces',serif;font-size:24px;font-weight:900;color:#5B4FE8;text-align:center;margin-bottom:.4rem}
.auth-title{font-size:18px;font-weight:800;color:#1A1A2E;text-align:center;margin-bottom:.2rem}
.auth-sub{font-size:13px;color:#6B7280;text-align:center;margin-bottom:1.5rem}
.auth-tabs{display:flex;background:#F4F5F7;border-radius:12px;padding:4px;margin-bottom:1.25rem}
.auth-tab{flex:1;padding:9px;border:none;background:transparent;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;color:#6B7280}
.auth-tab.active{background:#fff;color:#5B4FE8;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
.auth-group{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.auth-label{font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.06em}
.auth-input,.auth-select{border:1.5px solid #E8EAF6;border-radius:12px;padding:10px 14px;font-size:14px;background:#FAFBFF;color:#1A1A2E;outline:none;transition:border-color .2s;width:100%}
.auth-input:focus,.auth-select:focus{border-color:#5B4FE8;background:#fff}
.auth-role-row{display:flex;gap:10px;margin-bottom:12px}
.auth-role-btn{flex:1;padding:10px;border:1.5px solid #E8EAF6;border-radius:12px;background:#fff;cursor:pointer;text-align:center;transition:all .2s}
.auth-role-btn.selected{border-color:#5B4FE8;background:#EEF0FF}
.auth-role-icon{font-size:22px;margin-bottom:3px}
.auth-role-label{font-size:12px;font-weight:700;color:#1A1A2E}
.auth-btn{width:100%;padding:13px;background:#5B4FE8;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;transition:background .2s;margin-top:.5rem}
.auth-btn:hover{background:#3D34C4}
.auth-btn:disabled{background:#C7C2F8;cursor:not-allowed}
.auth-divider{display:flex;align-items:center;gap:10px;margin:1rem 0}
.auth-divider-line{flex:1;height:1px;background:#E8EAF6}
.auth-divider-text{font-size:12px;color:#9CA3AF;font-weight:600}
.auth-google{width:100%;padding:12px;background:#fff;border:1.5px solid #E8EAF6;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .2s;color:#1A1A2E}
.auth-google:hover{border-color:#5B4FE8;background:#FAFBFF}
.auth-error{background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;padding:10px 14px;font-size:13px;color:#B91C1C;margin-bottom:12px;font-weight:600}
.auth-success{background:#E6FAF8;border:1px solid #0ABFA3;border-radius:10px;padding:10px 14px;font-size:13px;color:#0F6E56;margin-bottom:12px;font-weight:600}
.auth-close{position:absolute;top:1rem;right:1rem;background:transparent;border:none;font-size:20px;cursor:pointer;color:#6B7280}
.auth-chips{display:flex;flex-wrap:wrap;gap:7px}
.auth-chip{padding:6px 13px;border-radius:20px;font-size:12px;font-weight:700;border:1.5px solid #E8EAF6;background:#fff;cursor:pointer;transition:all .2s}
.auth-chip.selected{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.section-divider{font-size:11px;font-weight:800;color:#5B4FE8;text-transform:uppercase;letter-spacing:.08em;margin:16px 0 10px;padding-bottom:6px;border-bottom:1.5px solid #E8EAF6}
@media(max-width:700px){.float-card{display:none}.hero-stats{gap:1.5rem}.form-row{grid-template-columns:1fr}.nav-links{display:none}}
`;

const fmtPrice=(price,countryCode)=>{const c=COUNTRIES.find(x=>x.code===countryCode)||COUNTRIES[0];if(c.currency==="KWD"||c.currency==="BHD")return`${(price*c.rate).toFixed(2)} ${c.currency}`;return`${Math.round(price*c.rate)} ${c.currency}`;};

// ─── AUTH ─────────────────────────────────────────────────────
function Auth({ onClose, onSuccess, lang: appLang }) {
  const t = T[appLang] || T.en;
  const [tab, setTab] = useState("login");
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("UAE");
  const [region, setRegion] = useState("DXB");
  const [prefLang, setPrefLang] = useState("en");
  const [curriculum, setCurriculum] = useState("");
  const [instrLang, setInstrLang] = useState("");
  const [level, setLevel] = useState("");
  const [age, setAge] = useState("");
  const [teachCycle, setTeachCycle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const studentLevels = curriculum && CURRICULA[curriculum] ? CURRICULA[curriculum].levels[appLang] || CURRICULA[curriculum].levels.en : [];

  const handleLogin = async () => {
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError("Incorrect email or password."); return; }
    onSuccess();
  };

  const handleSignup = async () => {
    if (!email || !password || !fullName) { setError("Please fill in all required fields."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError("");
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } }
    });
    if (error) { setLoading(false); setError(error.message); return; }
    if (data.user) {
      await supabase.from("profiles").update({
        role, full_name: fullName, language: prefLang,
        country_code: country,
        region_code: country === "UAE" ? region : null,
      }).eq("id", data.user.id);
      if (role === "student" && curriculum && level) {
        await supabase.from("student_profiles").insert({
          owner_id: data.user.id, full_name: fullName,
          age: age ? parseInt(age) : null,
          curriculum, level,
          default_lang: instrLang.toLowerCase().includes("english") || instrLang.includes("الإنجليزية") || instrLang.includes("Anglais") ? "en" : instrLang.toLowerCase().includes("arabic") || instrLang.includes("العربية") || instrLang.includes("Arabe") ? "ar" : "fr",
          country_code: country,
          region_code: country === "UAE" ? region : null,
        }).then(() => {});
      }
    }
    setLoading(false);
    if (data.session) { onSuccess(); }
    else { setSuccess("✅ Account created! Check your email to confirm."); }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: window.location.origin }
    });
    if (error) setError(error.message);
  };

  return (
    <div className="auth-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="auth-box">
        <button className="auth-close" onClick={onClose}>✕</button>
        <div className="auth-logo">TutorApp 🎓</div>
        <div className="auth-title">{tab==="login"?"Welcome back!":"Create your account"}</div>
        <div className="auth-sub">{tab==="login"?"Sign in to continue":"Join 200+ tutors and students"}</div>
        <div className="auth-tabs">
          <button className={`auth-tab${tab==="login"?" active":""}`} onClick={()=>{setTab("login");setError("");setSuccess("");}}>Sign in</button>
          <button className={`auth-tab${tab==="signup"?" active":""}`} onClick={()=>{setTab("signup");setError("");setSuccess("");}}>Sign up</button>
        </div>
        {error && <div className="auth-error">⚠️ {error}</div>}
        {success && <div className="auth-success">{success}</div>}
        <button className="auth-google" onClick={handleGoogle}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
          Continue with Google
        </button>
        <div className="auth-divider"><div className="auth-divider-line"></div><div className="auth-divider-text">or</div><div className="auth-divider-line"></div></div>
        {tab==="signup" && <>
          <div className="auth-group"><div className="auth-label">{t.signup.role}</div>
            <div className="auth-role-row">
              <div className={`auth-role-btn${role==="student"?" selected":""}`} onClick={()=>setRole("student")}><div className="auth-role-icon">🎓</div><div className="auth-role-label">{t.signup.student}</div></div>
              <div className={`auth-role-btn${role==="teacher"?" selected":""}`} onClick={()=>setRole("teacher")}><div className="auth-role-icon">📚</div><div className="auth-role-label">{t.signup.teacher}</div></div>
            </div>
          </div>
          <div className="auth-group"><label className="auth-label">{t.signup.name}</label><input className="auth-input" placeholder="Sarah Al-Mansouri" value={fullName} onChange={e=>setFullName(e.target.value)} /></div>
        </>}
        <div className="auth-group"><label className="auth-label">Email *</label><input className="auth-input" type="email" placeholder="sarah@email.com" value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div className="auth-group"><label className="auth-label">Password *</label><input className="auth-input" type="password" placeholder="Min. 6 characters" value={password} onChange={e=>setPassword(e.target.value)} /></div>
        {tab==="signup" && <>
          <div className="auth-group"><label className="auth-label">{t.signup.country}</label>
            <select className="auth-select" value={country} onChange={e=>setCountry(e.target.value)}>
              {COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name[appLang]||c.name.en}</option>)}
            </select>
          </div>
          {country==="UAE" && <div className="auth-group"><label className="auth-label">{t.signup.emirate}</label><select className="auth-select" value={region} onChange={e=>setRegion(e.target.value)}>{UAE_REGIONS.map(r=><option key={r.code} value={r.code}>{r.name}</option>)}</select></div>}
          <div className="auth-group"><label className="auth-label">{t.signup.lang}</label><select className="auth-select" value={prefLang} onChange={e=>setPrefLang(e.target.value)}><option value="en">🇬🇧 English</option><option value="ar">🇸🇦 العربية</option><option value="fr">🇫🇷 Français</option></select></div>
          {role==="student" && <>
            <div className="section-divider">📚 Your learning profile</div>
            <div className="form-row" style={{marginBottom:0}}>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.curriculum}</label>
                <select className="auth-select" value={curriculum} onChange={e=>{setCurriculum(e.target.value);setLevel("");}}>
                  <option value="">Choose...</option>
                  {Object.entries(CURRICULA).map(([k,v])=><option key={k} value={k}>{v.label[appLang]||v.label.en}</option>)}
                </select>
              </div>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.instrLang}</label>
                <select className="auth-select" value={instrLang} onChange={e=>setInstrLang(e.target.value)}>
                  <option value="">Choose...</option>
                  {t.instrLangs.map(l=><option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.level}</label>
                <select className="auth-select" value={level} onChange={e=>setLevel(e.target.value)} disabled={!studentLevels.length}>
                  <option value="">{studentLevels.length?"Choose...":"Select curriculum first"}</option>
                  {studentLevels.map(l=><option key={l}>{l}</option>)}
                </select>
              </div>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.age}</label><input className="auth-input" type="number" min="6" max="18" placeholder="ex: 14" value={age} onChange={e=>setAge(e.target.value)} /></div>
            </div>
          </>}
          {role==="teacher" && <>
            <div className="section-divider">🎓 Your teaching profile</div>
            <div className="auth-group"><label className="auth-label">{t.onboard.cycle}</label>
              <div className="auth-chips">
                {t.cycles.map(c=><div key={c} className={`auth-chip${teachCycle===c?" selected":""}`} onClick={()=>setTeachCycle(c)}>{c}</div>)}
              </div>
            </div>
          </>}
        </>}
        <button className="auth-btn" onClick={tab==="login"?handleLogin:handleSignup} disabled={loading}>
          {loading?"⏳ Loading...":tab==="login"?"Sign in →":"Create account →"}
        </button>
      </div>
    </div>
  );
}

// ─── PAYMENT SCREEN ───────────────────────────────────────────
function PaymentScreen({ bid, booking, form, country, lang, onSuccess, onBack }) {
  const t = T[lang] || T.en;
  const [paying, setPaying] = useState(false);

  const lessonPrice = bid.net_price_aed;
  const studentFee = Math.round(lessonPrice * STUDENT_FEE);
  const studentTotal = lessonPrice + studentFee;
  const teacherPayout = Math.round(lessonPrice * (1 - TEACHER_FEE));

  const handlePay = async () => {
    setPaying(true);
    try {
      // Mode test — simulation du paiement
      await new Promise(r => setTimeout(r, 1500));
      onSuccess({ lessonPrice, studentFee, studentTotal, teacherPayout });
    } catch(e) {
      setPaying(false);
    }
  };

  return (
    <div className="payment-screen">
      <div className="page-title">{t.payment.title}</div>
      <div className="page-sub">{t.payment.sub}</div>

      <div className="payment-test">🧪 {t.payment.testMode}</div>

      <div className="payment-card">
        <div className="payment-row">
          <span style={{color:"#6B7280"}}>{t.payment.lessonPrice}</span>
          <span style={{fontWeight:700}}>{fmtPrice(lessonPrice, country)}</span>
        </div>
        <div className="payment-row">
          <span style={{color:"#6B7280"}}>{t.payment.serviceFee}</span>
          <span style={{fontWeight:700,color:"#9CA3AF"}}>+ {fmtPrice(studentFee, country)}</span>
        </div>
        <div className="payment-row" style={{borderTop:"2px solid #E8EAF6",paddingTop:12,marginTop:4}}>
          <span style={{fontWeight:800,color:"#1A1A2E",fontSize:16}}>{t.payment.total}</span>
          <span className="payment-total">{fmtPrice(studentTotal, country)}</span>
        </div>
      </div>

      <div style={{background:"#FAFBFF",border:"1.5px solid #E8EAF6",borderRadius:14,padding:"1rem",marginBottom:"1.25rem",fontSize:13}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{color:"#6B7280"}}>{t.payment.teacherReceives}</span>
          <span style={{fontWeight:700,color:"#0ABFA3"}}>{fmtPrice(teacherPayout, country)}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{color:"#6B7280"}}>{t.payment.platformFee}</span>
          <span style={{fontWeight:700,color:"#9CA3AF"}}>{fmtPrice(studentFee + (lessonPrice - teacherPayout), country)}</span>
        </div>
      </div>

      <div className="payment-note">⚠️ {t.payment.payNote}</div>

      <button className="submit-btn" onClick={handlePay} disabled={paying}>
        {paying ? "⏳ Processing..." : t.payment.payBtn}
      </button>

      <div className="stripe-badge">
        <svg width="40" height="16" viewBox="0 0 40 16"><path fill="#635BFF" d="M5.5 5.5C5.5 3.6 6.9 2.7 9.1 2.7c2.9 0 5.8 1.3 5.8 1.3V.4S12.4 0 9 0C3.8 0 .8 2.9.8 6.1c0 5.9 7.7 5 7.7 8.3 0 2.2-1.8 3-4.2 3C1.5 17.4 0 16.6 0 16.6v3.7s1.7.7 4.3.7c5.4 0 8.5-2.8 8.5-6.3C12.8 8.4 5.5 9.3 5.5 5.5z"/></svg>
        Secured by Stripe
      </div>

      <div style={{textAlign:"center",marginTop:"1rem"}}>
        <button className="btn-ghost" onClick={onBack}>← Back to offers</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
export default function TutorApp() {
  const [lang,setLang]=useState("en");
  const [country,setCountry]=useState("UAE");
  const [page,setPage]=useState("home");
  const [appTab,setAppTab]=useState("student-form");
  const [toast,setToast]=useState(null);
  const [selectedBid,setSelectedBid]=useState(null);
  const [selectedRequest,setSelectedRequest]=useState(null);
  const [currentBooking,setCurrentBooking]=useState(null);
  const [paymentResult,setPaymentResult]=useState(null);
  const [showOnboard,setShowOnboard]=useState(false);
  const [withdrawal,setWithdrawal]=useState("wW");
  const [curriculum,setCurriculum]=useState("");
  const [user,setUser]=useState(null);
  const [showAuth,setShowAuth]=useState(false);
  const [currentRequestId,setCurrentRequestId]=useState(null);
  const [realBids,setRealBids]=useState([]);
  const [realRequests,setRealRequests]=useState([]);
  const [bidsLoading,setBidsLoading]=useState(false);
  const [requestsLoading,setRequestsLoading]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [submittingBid,setSubmittingBid]=useState(false);
  const [selectedRate,setSelectedRate]=useState(150);
  const [form,setForm]=useState({subject:"",instrLang:"",curriculum:"",level:"",cycle:[],duration:"1h",message:""});
  const [teacherForm,setTeacherForm]=useState({name:"",email:"",cycles:[],subjects:[],curricula:[],instrLangs:[],rate:150,eidUploaded:false,diplomaUploaded:false});
  const [bidForm,setBidForm]=useState({message:""});

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user??null);
      if(session?.user) loadProfile(session.user.id);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user??null);
      if(session?.user) loadProfile(session.user.id);
      else setUserProfile(null);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  const loadProfile = async (userId) => {
    const { data: studentProf } = await supabase
      .from("student_profiles").select("*").eq("owner_id", userId).limit(1).maybeSingle();
    if (studentProf) {
      const instrLangMap = { en: T.en.instrLangs[0], ar: T.ar.instrLangs[0], fr: T.fr.instrLangs[0] };
      setForm(f => ({
        ...f,
        curriculum: studentProf.curriculum || "",
        instrLang: instrLangMap[studentProf.default_lang] || "",
        level: studentProf.level || "",
      }));
      if (studentProf.curriculum) setCurriculum(studentProf.curriculum);
    }
  };

  useEffect(()=>{
    if(appTab==="teacher-dashboard"&&!showOnboard&&user){
      setRequestsLoading(true);
      getOpenRequests(country).then(data=>{setRealRequests(data);setRequestsLoading(false);}).catch(()=>setRequestsLoading(false));
    }
  },[appTab,showOnboard,user,country]);

  useEffect(()=>{
    if(appTab==="student-bids"&&currentRequestId){
      setBidsLoading(true);
      getBidsForRequest(currentRequestId).then(data=>{setRealBids(data);setBidsLoading(false);}).catch(()=>setBidsLoading(false));
      const interval=setInterval(()=>getBidsForRequest(currentRequestId).then(setRealBids).catch(()=>{}),10000);
      return ()=>clearInterval(interval);
    }
  },[appTab,currentRequestId]);

  const t=T[lang];
  const isRTL=lang==="ar";
  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),3500);};
  const toggleArr=(arr,val)=>arr.includes(val)?arr.filter(x=>x!==val):[...arr,val];
  const currLevels=curriculum&&CURRICULA[curriculum]?CURRICULA[curriculum].levels[lang]||CURRICULA[curriculum].levels["en"]:[];
  const currentCountry=COUNTRIES.find(c=>c.code===country)||COUNTRIES[0];
  const go=(tab)=>{if(!user){setShowAuth(true);return;}setPage("app");setAppTab(tab);setShowOnboard(false);};
  const isProfilePrefilled=!!(form.curriculum&&form.instrLang&&form.level);

  const handlePublish=async()=>{
    if(!form.subject||!form.level){showToast("⚠️ Please select subject and level");return;}
    setPublishing(true);
    try{
      const durationMap={"30 min":30,"1h":60,"1h30":90,"2h":120,"2h30":150,"3h":180};
      const req=await postRequest({
        subject:form.subject, instrLang:form.instrLang||"English",
        curriculum:form.curriculum||"british", level:form.level,
        cycle:form.cycle, durationMin:durationMap[form.duration]||60,
        message:form.message, countryCode:country,
      });
      setCurrentRequestId(req.id);
      setAppTab("student-bids");
      showToast("✅ Request posted! Waiting for tutor offers...");
    }catch(e){showToast("❌ "+e.message);}
    finally{setPublishing(false);}
  };

  const handleBidSubmit=async()=>{
    if(!bidForm.message){showToast("⚠️ Please write a message");return;}
    if(!selectedRequest?.id){return;}
    setSubmittingBid(true);
    try{
      await submitBid({requestId:selectedRequest.id,netPriceAed:selectedRate,message:bidForm.message});
      showToast("✅ Offer sent!");
      setBidForm({message:""});setSelectedRequest(null);setAppTab("teacher-dashboard");
    }catch(e){showToast("❌ "+e.message);}
    finally{setSubmittingBid(false);}
  };

  const handleAcceptBid=async(bid)=>{
    try{
      const booking=await acceptBid(bid.id,currentRequestId);
      setSelectedBid(bid);
      setCurrentBooking(booking);
      setAppTab("student-payment");
    }catch(e){showToast("❌ "+e.message);}
  };

  const handlePaymentSuccess=(result)=>{
    setPaymentResult(result);
    setAppTab("student-confirm");
    showToast("🎉 Booking confirmed!");
  };

  const handleDeclineBid=(bidId)=>{
    setRealBids(prev=>prev.filter(b=>b.id!==bidId));
    showToast("Offer declined.");
  };

  const handleTeacherSubmit=()=>{
    if(!teacherForm.name||!teacherForm.email||!teacherForm.cycles.length||!teacherForm.subjects.length||!teacherForm.eidUploaded||!teacherForm.diplomaUploaded){showToast("⚠️ Complete all fields and upload documents");return;}
    setShowOnboard(false);setAppTab("teacher-dashboard");
    showToast("🎉 Profile created! Under review.");
  };

  return (
    <div className={`app-root${isRTL?" rtl":""}`}>
      <style>{css}</style>

      <nav className="nav">
        <div className="nav-logo" onClick={()=>setPage("home")}>TutorApp</div>
        <div className="nav-links">
          <span className="nav-link" onClick={()=>go("student-form")}>{t.nav.search}</span>
          <span className="nav-link" onClick={()=>go("teacher-dashboard")}>{t.nav.teach}</span>
          <span className="nav-link" onClick={()=>setPage("teachers")}>{t.nav.teachers}</span>
          <select className="country-select" value={country} onChange={e=>setCountry(e.target.value)}>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name[lang]}</option>)}</select>
          <div className="lang-switch">{["en","ar","fr"].map(l=><button key={l} className={`lang-btn${lang===l?" active":""}`} onClick={()=>setLang(l)}>{l.toUpperCase()}</button>)}</div>
        </div>
        {user?(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div className="user-badge">👤 {user.email?.split("@")[0]}</div>
            <button className="nav-logout" onClick={()=>supabase.auth.signOut()}>Logout</button>
          </div>
        ):(
          <button className="nav-cta" onClick={()=>setShowAuth(true)}>{t.nav.start}</button>
        )}
      </nav>

      {page==="home"&&<>
        <section className="hero">
          <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
            <div className="float-card"><div style={{fontWeight:800,fontSize:13,marginBottom:4}}>📋 New request</div><div style={{color:"#6B7280",fontSize:12}}>Maths · Grade 9 · 1h</div><div style={{color:"#0ABFA3",fontSize:12,marginTop:4,fontWeight:700}}>3 offers received ✓</div></div>
            <div className="float-card"><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:34,height:34,borderRadius:"50%",background:"#EEF0FF",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#5B4FE8"}}>سا</div><div><div style={{fontWeight:800,fontSize:13}}>Sarah A.</div><div style={{color:"#F5A623",fontSize:11}}>★★★★★ 4.9</div></div><div style={{marginInlineStart:"auto",fontFamily:"Fraunces,serif",fontWeight:900,color:"#5B4FE8",fontSize:15}}>200 AED</div></div></div>
            <div className="float-card"><div style={{fontWeight:800,fontSize:13,marginBottom:4,color:"#0ABFA3"}}>💳 Paid after lesson ✓</div><div style={{color:"#6B7280",fontSize:12}}>📹 Video link sent</div><div style={{color:"#6B7280",fontSize:12}}>🔒 Secured by Stripe</div></div>
          </div>
          <div className="hero-badge"><div className="hero-dot"></div>{t.hero.badge}</div>
          <h1>{t.hero.h1}<span>{t.hero.h1span}</span>{t.hero.h1b}</h1>
          <p>{t.hero.sub}</p>
          <div className="hero-btns">
            <button className="btn-big btn-big-primary" onClick={()=>go("student-form")}>{t.hero.cta1}</button>
            <button className="btn-big btn-big-outline" onClick={()=>{if(!user){setShowAuth(true);return;}setPage("app");setAppTab("teacher-dashboard");setShowOnboard(true);}}>{t.hero.cta2}</button>
          </div>
          <div className="hero-stats">{[{v:t.hero.s1v,l:t.hero.s1l},{v:t.hero.s2v,l:t.hero.s2l},{v:t.hero.s3v,l:t.hero.s3l},{v:t.hero.s4v,l:t.hero.s4l}].map((s,i)=><div key={i} style={{textAlign:"center"}}><div className="hero-stat-val">{s.v}</div><div className="hero-stat-lbl">{s.l}</div></div>)}</div>
        </section>
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",borderBottom:"1.5px solid #E8EAF6",padding:"4rem 0"}}><div className="section" style={{padding:"0 2rem"}}><div className="section-label">{t.how.label}</div><div className="section-title">{t.how.title}<span>{t.how.titleSpan}</span></div><div className="steps-grid">{t.how.steps.map((s,i)=><div className="step-card" key={i}><div className="step-num-bg">{i+1}</div><div className="step-icon">{s.icon}</div><h3>{s.t}</h3><p>{s.d}</p></div>)}</div></div></div>
        <div className="section"><div className="section-label">{t.subjects.label}</div><div className="section-title">{t.subjects.title}<span>{t.subjects.titleSpan}</span></div><div className="subj-grid">{SUBJECTS.map(s=><div className="subj-card" key={s.en} onClick={()=>go("student-form")}><span style={{fontSize:20}}>{s.icon}</span><span>{s[lang]}</span></div>)}</div></div>
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",padding:"4rem 0"}}><div className="section" style={{padding:"0 2rem"}}><div className="section-label">{t.nav.teachers}</div><div className="section-title" style={{marginBottom:"2rem"}}>{lang==="ar"?"جميعهم موثّقون":lang==="fr"?"Tous vérifiés":"All verified, all passionate"}</div><div className="teachers-grid">{TEACHERS.map(tc=><div className="teacher-card" key={tc.name.en} onClick={()=>setPage("teachers")}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}><div className="tc-avatar" style={{background:tc.bg,color:tc.color}}>{tc.initials}</div><div><div style={{fontWeight:800,fontSize:15,color:"#1A1A2E"}}>{tc.name[lang]}</div>{tc.verified&&<div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ Verified</div>}<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{COUNTRIES.find(c=>c.code===tc.country)?.flag} {COUNTRIES.find(c=>c.code===tc.country)?.name[lang]}</div></div></div><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>{tc.subjects.slice(0,2).map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return<span className="pill" key={s}>{subj?subj[lang]:s}</span>;})} {tc.instrLangs.map(l=><span className="pill pill-teal" key={l}>{l}</span>)}</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{fmtPrice(tc.rate,country)}<span style={{fontSize:12,fontWeight:500,color:"#6B7280"}}>/h</span></div><div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>★ {tc.rating} ({tc.reviews})</div></div></div>)}</div></div></div>
      </>}

      {page==="teachers"&&<div className="section"><div className="section-label">{t.nav.teachers}</div><div className="section-title" style={{marginBottom:"2rem"}}>{lang==="ar"?"جميعهم موثّقون":lang==="fr"?"Tous vérifiés":"All verified"}</div><div className="teachers-grid">{TEACHERS.map(tc=><div className="teacher-card" key={tc.name.en}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}><div className="tc-avatar" style={{background:tc.bg,color:tc.color}}>{tc.initials}</div><div><div style={{fontWeight:800,fontSize:15}}>{tc.name[lang]}</div>{tc.verified&&<div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ Verified Emirates ID</div>}<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{COUNTRIES.find(c=>c.code===tc.country)?.flag} {COUNTRIES.find(c=>c.code===tc.country)?.name[lang]}</div></div></div><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>{tc.subjects.map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return<span className="pill" key={s}>{subj?subj[lang]:s}</span>;})} {tc.instrLangs.map(l=><span className="pill pill-teal" key={l}>{l}</span>)}</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}><div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{fmtPrice(tc.rate,country)}<span style={{fontSize:12,fontWeight:500,color:"#6B7280"}}>/h</span></div><div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>★ {tc.rating} ({tc.reviews})</div></div><button className="submit-btn" style={{marginTop:0,padding:"10px"}} onClick={()=>go("student-form")}>{lang==="ar"?"احجز ←":lang==="fr"?"Réserver →":"Book →"}</button></div>)}</div></div>}

      {page==="app"&&<div className="section"><div className="app-container">
        <div className="app-topbar"><div className="app-dot-row"><div className="app-dot" style={{background:"#E24B4A"}}></div><div className="app-dot" style={{background:"#F5A623"}}></div><div className="app-dot" style={{background:"#0ABFA3"}}></div></div><div className="app-url">tutorapp.ae · 🔒 {currentCountry.flag} {currentCountry.name[lang]}</div></div>
        <div className="app-tabs">
          <div className={`app-tab${["student-form","student-bids","student-payment","student-confirm"].includes(appTab)?" active":""}`} onClick={()=>{setAppTab("student-form");setShowOnboard(false);}}>🎓 {t.nav.search}</div>
          <div className={`app-tab${["teacher-dashboard","teacher-bid"].includes(appTab)?" active":""}`} onClick={()=>{setAppTab("teacher-dashboard");setShowOnboard(false);}}>📚 {t.nav.teach}</div>
        </div>
        <div className="app-body">

          {appTab==="student-form"&&<>
            <div className="page-title">{t.form.title}</div>
            <div className="page-sub">{t.form.sub}</div>
            <div className="online-banner">📹 {t.form.onlineBanner}</div>
            {isProfilePrefilled&&<div className="prefilled-banner">✅ Your profile is pre-filled. Just select a subject and post!</div>}
            <div className="form-group"><label className="form-label">{t.form.subject}</label><select className="form-select" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}><option value="">Choose...</option>{SUBJECTS.map(s=><option key={s.en} value={s.en}>{s[lang]}</option>)}</select></div>
            <div className="form-row">
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.form.lang}</label><select className={`form-select${isProfilePrefilled&&form.instrLang?" prefilled":""}`} value={form.instrLang} onChange={e=>setForm({...form,instrLang:e.target.value})}><option value="">Choose...</option>{t.instrLangs.map(l=><option key={l}>{l}</option>)}</select></div>
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.form.curriculum}</label><select className={`form-select${isProfilePrefilled&&form.curriculum?" prefilled":""}`} value={form.curriculum} onChange={e=>{setForm({...form,curriculum:e.target.value,level:""});setCurriculum(e.target.value);}}><option value="">Choose...</option>{Object.entries(CURRICULA).map(([k,v])=><option key={k} value={k}>{v.label[lang]}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">{t.form.level}</label><select className={`form-select${isProfilePrefilled&&form.level?" prefilled":""}`} value={form.level} onChange={e=>setForm({...form,level:e.target.value})} disabled={!currLevels.length}><option value="">{currLevels.length?"Choose...":"Select curriculum first"}</option>{currLevels.map(l=><option key={l}>{l}</option>)}</select></div>
            <div className="form-group"><label className="form-label">{t.form.duration}</label><div className="chips-row">{t.durations.map(d=><div key={d} className={`chip${form.duration===d?" selected":""}`} onClick={()=>setForm({...form,duration:d})}>{d}</div>)}</div></div>
            <div className="form-group"><label className="form-label">{t.form.msg}</label><textarea className="form-textarea" placeholder={t.form.msgPh} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} /></div>
            <button className="submit-btn" onClick={handlePublish} disabled={publishing}>{publishing?"⏳ Posting...":t.form.publish}</button>
          </>}

          {appTab==="student-bids"&&<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
              <div><div className="page-title">{t.bids.title}</div><div className="page-sub" style={{marginBottom:0}}>{form.subject} · {form.level} · {form.duration}</div></div>
              <span className="badge badge-amber">{bidsLoading?"...":realBids.length} {t.bids.new}</span>
            </div>
            <div className="pay-banner">{t.bids.payAfter}</div>
            {bidsLoading&&<div className="loading-spinner">⏳ Loading offers...</div>}
            {!bidsLoading&&realBids.length===0&&<div className="empty-state"><div className="empty-icon">⏳</div><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>{t.bids.noOffers}</div><div style={{fontSize:13,color:"#9CA3AF"}}>{t.bids.noOffersDesc}</div></div>}
            {!bidsLoading&&realBids.map((bid,i)=>(
              <div key={bid.id||i} className="offer-card">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div><div className="offer-teacher">{bid.teacher?.full_name||"Tutor"}</div><div style={{fontSize:12,color:"#6B7280"}}>📹 Online</div></div>
                  <div style={{textAlign:"right"}}><div className="offer-price">{fmtPrice(bid.net_price_aed,country)}</div><div style={{fontSize:11,color:"#9CA3AF"}}>/hour</div></div>
                </div>
                <div className="offer-msg">{bid.message}</div>
                <div className="offer-actions">
                  <button className="btn-accept" onClick={()=>handleAcceptBid(bid)}>{t.bids.accept}</button>
                  <button className="btn-decline" onClick={()=>handleDeclineBid(bid.id)}>{t.bids.decline}</button>
                </div>
              </div>
            ))}
            <div style={{textAlign:"center",marginTop:"1rem"}}><button className="btn-ghost" onClick={()=>setAppTab("student-form")}>← Back</button></div>
          </>}

          {appTab==="student-payment"&&selectedBid&&(
            <PaymentScreen
              bid={selectedBid}
              booking={currentBooking}
              form={form}
              country={country}
              lang={lang}
              onSuccess={handlePaymentSuccess}
              onBack={()=>setAppTab("student-bids")}
            />
          )}

          {appTab==="student-confirm"&&<div className="success-screen">
            <div style={{fontSize:56,marginBottom:"1rem"}}>🎉</div>
            <div style={{fontFamily:"Fraunces,serif",fontSize:24,fontWeight:900,color:"#1A1A2E",marginBottom:"0.5rem"}}>{t.confirm.title}</div>
            <div style={{fontSize:14,color:"#6B7280",marginBottom:"1.5rem"}}>{t.confirm.sub1}<strong>{selectedBid?.teacher?.full_name}</strong>{t.confirm.sub2}</div>
            <div className="confirm-detail">
              <div className="confirm-row"><span style={{color:"#6B7280"}}>{t.confirm.subject}</span><span style={{fontWeight:700}}>{form.subject}</span></div>
              <div className="confirm-row"><span style={{color:"#6B7280"}}>{t.confirm.teacher}</span><span style={{fontWeight:700}}>{selectedBid?.teacher?.full_name}</span></div>
              <div className="confirm-row"><span style={{color:"#6B7280"}}>{t.confirm.price}</span><span style={{fontWeight:900,color:"#5B4FE8",fontFamily:"Fraunces,serif"}}>{fmtPrice(paymentResult?.studentTotal||0,country)}</span></div>
              <div className="confirm-row"><span style={{color:"#6B7280"}}>{t.confirm.teacherGets}</span><span style={{fontWeight:700,color:"#0ABFA3"}}>{fmtPrice(paymentResult?.teacherPayout||0,country)}</span></div>
              <div className="confirm-row" style={{borderTop:"2px solid #E8EAF6"}}><span style={{color:"#6B7280"}}>{t.confirm.pay}</span><span style={{color:"#0ABFA3",fontWeight:700}}>{t.confirm.secured}</span></div>
            </div>
            <div className="jitsi-box">
              <div style={{fontSize:24,marginBottom:6}}>📹</div>
              <div style={{fontWeight:800,fontSize:14,color:"#0F6E56",marginBottom:4}}>{t.confirm.jitsi}</div>
              <div style={{fontSize:12,color:"#6B7280"}}>{t.confirm.jitsiNote}</div>
            </div>
            <button className="submit-btn" style={{maxWidth:300,margin:"0 auto"}} onClick={()=>{setAppTab("student-form");setSelectedBid(null);setCurrentRequestId(null);setRealBids([]);setPaymentResult(null);}}>{t.confirm.newReq}</button>
          </div>}

          {appTab==="teacher-dashboard"&&showOnboard&&<>
            <div className="page-title">{t.onboard.title}</div><div className="page-sub">{t.onboard.sub}</div>
            <div className="form-row"><div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.name}</label><input className="form-input" placeholder="Sarah Al-Mansouri" value={teacherForm.name} onChange={e=>setTeacherForm({...teacherForm,name:e.target.value})} /></div><div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.email}</label><input className="form-input" type="email" placeholder="sarah@email.com" value={teacherForm.email} onChange={e=>setTeacherForm({...teacherForm,email:e.target.value})} /></div></div>
            <div className="form-group"><label className="form-label">{t.onboard.cycle}</label><div className="chips-row">{t.cycles.map(c=><div key={c} className={`chip${teacherForm.cycles.includes(c)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,cycles:[c]})}>{c}</div>)}</div>{teacherForm.cycles.length>0&&<div style={{fontSize:12,color:"#0ABFA3",marginTop:6,fontWeight:600}}>✓ You will see requests matching this cycle only</div>}</div>
            <div className="form-group"><label className="form-label">{t.onboard.curriculum}</label><div className="chips-row">{Object.entries(CURRICULA).map(([k,v])=><div key={k} className={`chip chip-teal${teacherForm.curricula.includes(k)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,curricula:toggleArr(teacherForm.curricula,k)})}>{v.label[lang]}</div>)}</div></div>
            <div className="form-group"><label className="form-label">{t.onboard.subjects}</label><div className="chips-row">{SUBJECTS.map(s=><div key={s.en} className={`chip${teacherForm.subjects.includes(s.en)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,subjects:toggleArr(teacherForm.subjects,s.en)})}>{s[lang]}</div>)}</div></div>
            <div className="form-group"><label className="form-label">{t.onboard.langTeach}</label><div className="chips-row">{t.instrLangs.map(l=><div key={l} className={`chip${teacherForm.instrLangs.includes(l)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,instrLangs:toggleArr(teacherForm.instrLangs,l)})}>{l}</div>)}</div></div>
            <div className="form-group">
              <label className="form-label">{t.onboard.rate}</label>
              <div className="rate-chips">{TEACHER_RATES.map(r=><div key={r} className={`rate-chip${teacherForm.rate===r?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,rate:r})}>{fmtPrice(r,country)}/h</div>)}</div>
              <div style={{fontSize:12,color:"#6B7280",marginTop:6,fontWeight:500}}>ℹ️ {t.teacher.rateHint} → {fmtPrice(Math.round(teacherForm.rate*(1-TEACHER_FEE)),country)}/h</div>
            </div>
            <div className="form-group"><label className="form-label">{t.onboard.bio}</label><textarea className="form-textarea" placeholder={t.onboard.bioPh} /></div>
            <div className="form-row">
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.eid} 🔒</label><div className="upload-zone" onClick={()=>setTeacherForm({...teacherForm,eidUploaded:true})}>{teacherForm.eidUploaded?<><div style={{fontSize:28}}>✅</div><div style={{fontSize:13,fontWeight:700,color:"#0ABFA3"}}>Uploaded!</div></>:<><div style={{fontSize:28}}>🪪</div><div style={{fontSize:12,fontWeight:700,color:"#5B4FE8"}}>{t.onboard.eidPh}</div></>}</div></div>
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.diploma} 🎓</label><div className="upload-zone" onClick={()=>setTeacherForm({...teacherForm,diplomaUploaded:true})}>{teacherForm.diplomaUploaded?<><div style={{fontSize:28}}>✅</div><div style={{fontSize:13,fontWeight:700,color:"#0ABFA3"}}>Uploaded!</div></>:<><div style={{fontSize:28}}>📜</div><div style={{fontSize:12,fontWeight:700,color:"#5B4FE8"}}>{t.onboard.diplomaPh}</div></>}</div></div>
            </div>
            <button className="submit-btn" onClick={handleTeacherSubmit}>{t.onboard.submit}</button>
          </>}

          {appTab==="teacher-dashboard"&&!showOnboard&&!selectedRequest&&<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:8}}>
              <div><div className="page-title">{user?`Hello, ${user.email?.split("@")[0]} 👋`:t.teacher.hello}</div><div className="page-sub" style={{marginBottom:0}}>{t.teacher.sub}</div></div>
              <button className="btn-ghost" onClick={()=>setShowOnboard(true)}>{t.teacher.profile}</button>
            </div>
            <div className="teacher-stats"><div className="stat-card"><div className="stat-val">{fmtPrice(3240,country)}</div><div className="stat-lbl">{t.teacher.revenue}</div></div><div className="stat-card"><div className="stat-val">12</div><div className="stat-lbl">{t.teacher.courses}</div></div><div className="stat-card"><div className="stat-val">4.9★</div><div className="stat-lbl">{t.teacher.rating}</div></div></div>
            <div className="withdrawal-card"><div style={{fontWeight:800,fontSize:14,color:"#1A1A2E",marginBottom:10}}>💳 {t.teacher.withdrawal}</div><div className="chips-row">{[["wI",t.teacher.wI],["wW",t.teacher.wW],["wM",t.teacher.wM]].map(([k,v])=><div key={k} className={`chip${withdrawal===k?" selected":""}`} onClick={()=>setWithdrawal(k)}>{v}</div>)}</div><div style={{fontSize:12,color:"#6B7280",marginTop:8,fontWeight:500}}>ℹ️ {t.teacher.wInfo}</div></div>
            <div style={{fontWeight:800,fontSize:16,marginBottom:"1rem",color:"#1A1A2E"}}>💡 {t.teacher.suggestions}</div>
            <div className="suggestions-grid">{SUGGESTIONS.map((s,i)=><div className="suggestion-card" key={i}><div style={{fontSize:22,marginBottom:6}}>{s.icon}</div><div style={{fontWeight:800,fontSize:13,color:"#1A1A2E"}}>{s.subject[lang]}</div><div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>{s.level[lang]} · {s.lang[lang]}</div><div style={{fontSize:11,color:"#0ABFA3",fontWeight:700,marginTop:4}}>🔥 {s.students} students</div></div>)}</div>
            <div style={{fontWeight:800,fontSize:16,marginBottom:"1rem",color:"#1A1A2E"}}>{t.teacher.newAds} {!requestsLoading&&`(${realRequests.length})`}</div>
            {requestsLoading&&<div className="loading-spinner">⏳ Loading...</div>}
            {!requestsLoading&&realRequests.length===0&&<div className="empty-state"><div className="empty-icon">📋</div><div style={{fontWeight:700,fontSize:15,marginBottom:6}}>No open requests yet</div><div style={{fontSize:13,color:"#9CA3AF"}}>Student requests will appear here in real time.</div></div>}
            {!requestsLoading&&realRequests.map((r,i)=>(
              <div className="req-card" key={r.id||i}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>📋</span><div className="req-title">{r.subject}</div></div><span style={{fontSize:11,color:"#9CA3AF",fontWeight:600}}>{new Date(r.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:r.message?8:12}}><span className="badge badge-purple">{r.level}</span><span className="badge badge-blue">🗣 {r.instr_lang}</span><span className="badge badge-amber">{r.duration_min} min</span><span className="badge badge-green">📹 Online</span><span className="badge badge-gray">{r.curriculum}</span></div>
                {r.message&&<div style={{fontSize:13,color:"#6B7280",marginBottom:12,fontStyle:"italic",background:"#FAFBFF",borderRadius:8,padding:"8px 12px"}}>"{r.message}"</div>}
                <div style={{display:"flex",gap:8}}><button className="btn-teal" onClick={()=>{setSelectedRequest(r);setAppTab("teacher-bid");}}>{t.teacher.bid}</button><button className="btn-ghost">{t.teacher.ignore}</button></div>
              </div>
            ))}
          </>}

          {appTab==="teacher-bid"&&selectedRequest&&<>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1.5rem",flexWrap:"wrap"}}><button className="btn-ghost" onClick={()=>{setAppTab("teacher-dashboard");setSelectedRequest(null);}}>{t.bidForm.back}</button><div><div className="page-title" style={{marginBottom:0}}>{selectedRequest.subject}</div><div className="page-sub" style={{marginBottom:0}}>{selectedRequest.level} · {selectedRequest.instr_lang} · {selectedRequest.duration_min} min · 📹</div></div></div>
            {selectedRequest.message&&<div style={{background:"#FAFBFF",border:"1.5px solid #E8EAF6",borderRadius:12,padding:"12px 16px",marginBottom:"1.5rem",fontSize:13,color:"#6B7280",fontStyle:"italic"}}>Student: "{selectedRequest.message}"</div>}
            <div className="form-group">
              <label className="form-label">{t.bidForm.price}</label>
              <div className="rate-chips">{TEACHER_RATES.map(r=><div key={r} className={`rate-chip${selectedRate===r?" selected":""}`} onClick={()=>setSelectedRate(r)}>{fmtPrice(r,country)}/h</div>)}</div>
              <div style={{fontSize:13,color:"#0ABFA3",marginTop:8,fontWeight:700}}>{t.bidForm.recv} {fmtPrice(Math.round(selectedRate*(1-TEACHER_FEE)),country)}/h {t.bidForm.afterC}</div>
            </div>
            <div className="form-group"><label className="form-label">{t.bidForm.msg}</label><textarea className="form-textarea" style={{minHeight:110}} placeholder={t.bidForm.msgPh} value={bidForm.message} onChange={e=>setBidForm({...bidForm,message:e.target.value})} /></div>
            <button className="submit-btn" onClick={handleBidSubmit} disabled={submittingBid}>{submittingBid?"⏳ Sending...":t.bidForm.send}</button>
          </>}

        </div>
      </div></div>}

      <footer className="footer">
        <div className="footer-logo">TutorApp</div>
        <div style={{fontSize:13,lineHeight:1.65,maxWidth:500,margin:"0 auto"}}>{t.footer}</div>
        <div style={{marginTop:"1.5rem",fontSize:12,color:"#4B5563"}}>© 2025 TutorApp · {COUNTRIES.map(c=>`${c.flag} ${c.name[lang]}`).join(" · ")}</div>
      </footer>

      {showAuth&&<Auth onClose={()=>setShowAuth(false)} onSuccess={()=>{setShowAuth(false);showToast("🎉 Welcome to TutorApp!");}} lang={lang} />}
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}

