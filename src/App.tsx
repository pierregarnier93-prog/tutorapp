import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const supabase = createClient(
  "https://ihtcmemyrwejeetybepg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodGNtZW15cndlamVldHliZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ0NjAsImV4cCI6MjA5NDY5MDQ2MH0.xyGnBYE2ex1vn5jbwrbfTbvcUtNC9SmzBIUiRQoIPEo"
);

const stripePromise = loadStripe("pk_live_51TagWA4l4Z2J0IZfYprxlISAh0FG5mY8jnpugEHj5kVU5G55mViXn5dZUl53oZh5aLRPavhFk4sdEkyTp4eFfYKZ008mURFe7S");

const STUDENT_FEE = 0.06;
const TEACHER_FEE = 0.06;

function normalizeInstrLang(l:string):string{
  if(!l) return "English";
  const lo=l.toLowerCase();
  if(lo.includes("english")||lo.includes("anglais")||lo.includes("الإنجليزية")) return "English";
  if(lo.includes("arabic")||lo.includes("arabe")||lo.includes("العربية")) return "Arabic";
  if(lo.includes("french")||lo.includes("français")||lo.includes("الفرنسية")) return "French";
  return l;
}

async function postRequest({ subject, instrLang, curriculum, level, cycle, durationMin, message, countryCode }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("requests").insert({
    poster_id: user.id, subject, instr_lang: normalizeInstrLang(instrLang), curriculum, level,
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
    .select("*, teacher:profiles!teacher_id(full_name, country_code, teaching_bio, teaching_curricula, teaching_rate, avatar_url)")
    .eq("request_id", requestId).eq("status", "pending")
    .order("net_price_aed", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function submitBid({ requestId, netPriceAed, message, proposedSlots }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const slots = (proposedSlots||[]).filter(s=>s).map(s=>new Date(s).toISOString());
  const { data, error } = await supabase.from("bids").insert({
    request_id: requestId, teacher_id: user.id,
    net_price_aed: netPriceAed, message, status: "pending",
    proposed_slots: slots.length ? slots : null,
  }).select().single();
  if (error) throw error;
  return data;
}

async function acceptBid(bidId, requestId, scheduledAt?) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: bid } = await supabase.from("bids").select("*").eq("id", bidId).single();
  if (!bid) throw new Error("Bid not found");
  const netPrice = bid.net_price_aed;
  const grossPrice = Math.round(netPrice * (1 + STUDENT_FEE));
  const teacherPayout = Math.round(netPrice * (1 - TEACHER_FEE));
  const commission = grossPrice - teacherPayout;
  const { data: booking, error } = await supabase.from("bookings").insert({
    request_id: requestId, bid_id: bidId,
    poster_id: user.id, teacher_id: bid.teacher_id,
    net_price_aed: netPrice, gross_price_aed: grossPrice,
    commission_aed: commission, status: "pending_payment", country_code: "UAE",
    scheduled_at: scheduledAt || null,
  }).select().single();
  if (error) throw error;
  await supabase.from("bids").update({ status: "accepted" }).eq("id", bidId);
  await supabase.from("requests").update({ status: "closed" }).eq("id", requestId);
  return { ...booking, teacherPayout };
}

async function getOpenRequests(countryCode) {
  let query = supabase.from("requests")
    .select("*, poster:profiles!poster_id(full_name), bids(count)")
    .eq("status", "open").order("created_at", { ascending: false });
  if (countryCode) query = query.eq("country_code", countryCode);
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

async function getTeacherStats(userId) {
  const { data: bookings } = await supabase.from("bookings")
    .select("net_price_aed, status, created_at")
    .eq("teacher_id", userId).eq("status", "completed");
  const now = new Date();
  const thisMonth = (bookings || []).filter(b => {
    const d = new Date(b.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalRevenue = thisMonth.reduce((sum, b) => sum + Math.round(b.net_price_aed * (1 - TEACHER_FEE)), 0);
  const { data: allBookings } = await supabase.from("bookings").select("id").eq("teacher_id", userId).eq("status", "completed");
  const { data: ratings } = await supabase.from("ratings").select("score").eq("teacher_id", userId);
  const avgRating = ratings?.length ? (ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1) : "—";
  return { revenue: totalRevenue, courses: allBookings?.length || 0, rating: avgRating };
}

function timeAgo(date, lang) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return lang==="fr"?"à l'instant":lang==="ar"?"الآن":"just now";
  if (diff < 3600) return `${Math.floor(diff/60)} ${lang==="fr"?"min":lang==="ar"?"د":"min"}`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ${lang==="fr"?"h":lang==="ar"?"س":"h"}`;
  return `${Math.floor(diff/86400)} ${lang==="fr"?"j":lang==="ar"?"ي":"d"}`;
}

async function getMatchedRequests(profile) {
  let query = supabase
    .from("requests")
    .select("*, poster:profiles!poster_id(full_name), bids(count)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (profile?.teaching_subjects?.length > 0) {
    query = query.in("subject", profile.teaching_subjects);
  }
  const { data } = await query;
  return data || [];
}

async function getTeacherRevenueStats(userId) {
  const now = new Date();
  const { data: allBookings } = await supabase
    .from("bookings")
    .select("net_price_aed, status, created_at")
    .eq("teacher_id", userId);
  const completed = (allBookings||[]).filter(b => b.status === "completed");
  const pending = (allBookings||[]).filter(b => b.status === "pending_payment");
  const thisMonth = completed.filter(b => {
    const d = new Date(b.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const { data: ratings } = await supabase.from("reviews").select("score").eq("teacher_id", userId);
  const avg = ratings?.length
    ? (ratings.reduce((s,r) => s+r.score, 0) / ratings.length).toFixed(1)
    : null;
  return {
    thisMonth: thisMonth.reduce((s,b) => s + Math.round(b.net_price_aed * 0.94), 0),
    total: completed.reduce((s,b) => s + Math.round(b.net_price_aed * 0.94), 0),
    pending: pending.reduce((s,b) => s + Math.round(b.net_price_aed * 0.94), 0),
    courses: completed.length,
    rating: avg
  };
}

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

const fmtPrice=(price,countryCode)=>{const c=COUNTRIES.find(x=>x.code===countryCode)||COUNTRIES[0];if(c.currency==="KWD"||c.currency==="BHD")return`${(price*c.rate).toFixed(2)} ${c.currency}`;return`${Math.round(price*c.rate)} ${c.currency}`;};

const T = {
  en: {
    dir:"ltr",
    nav:{search:"Find a tutor",teach:"Teach",teachers:"Tutors",start:"Get started"},
    hero:{badge:"Gulf Region · 100% Online · Verified Tutors",h1:"Find a tutor in ",h1span:"5 minutes,",h1b:" not 5 days.",sub:"Post your need, tutors propose their price, you accept or decline. Pay after the lesson.",cta1:"Find a tutor →",cta2:"Become a tutor",s1v:"200+",s1l:"Verified tutors",s2v:"15 min",s2l:"Avg response time",s3v:"4.9★",s3l:"Average rating",s4v:"5",s4l:"Gulf countries"},
    how:{label:"How it works",title:"As simple as ",titleSpan:"booking a ride",steps:[{icon:"📋",t:"Post your request",d:"Subject and level. No budget needed."},{icon:"⚡",t:"Tutors propose prices",d:"Each tutor submits their own rate."},{icon:"👆",t:"Accept or decline",d:"See the price, accept if it suits you."},{icon:"🎓",t:"Lesson + Pay after",d:"Video link sent automatically. Pay after."}]},
    subjects:{label:"All subjects",title:"Maths in ",titleSpan:"English, Arabic or French"},
    form:{title:"Post your request",sub:"Your profile is pre-filled — just select a subject and post!",subject:"Subject *",lang:"Language of instruction",curriculum:"Curriculum",level:"Level *",duration:"Duration",msg:"Message to tutors",msgPh:"Describe difficulties, goals, availability...",publish:"Post request →",onlineBanner:"All lessons via video call — link sent automatically after booking."},
    bids:{title:"Offers received",new:"offers",payAfter:"💳 Pay ONLY after the lesson — 6% service fee applies",accept:"Accept & Book →",decline:"Decline",noOffers:"Waiting for tutor offers...",noOffersDesc:"Tutors will submit their offers shortly."},
    payment:{title:"Confirm & Pay",sub:"Your card will be authorized but NOT charged until after the lesson.",lessonPrice:"Lesson price",serviceFee:"Service fee (6%)",total:"Total",teacherReceives:"Teacher receives",platformFee:"Platform fee",payBtn:"Confirm booking →",payNote:"💳 Your card will be charged AFTER the lesson is completed."},
    confirm:{title:"Booking confirmed! 🎉",sub1:"Your lesson with ",sub2:" is confirmed.",subject:"Subject",teacher:"Tutor",price:"You pay",teacherGets:"Teacher receives",jitsi:"Video link",jitsiNote:"Will be sent by email before the lesson.",pay:"Payment after lesson",secured:"✓ Secured by Stripe",newReq:"Post another request"},
    teacher:{hello:"Welcome back",sub:"New student requests matching your profile.",revenue:"this month",courses:"Lessons",rating:"Rating",newAds:"Student requests",bid:"Make offer →",ignore:"Ignore",profile:"My profile",yourRate:"Your rate",rateHint:"You receive 94% after 6% platform fee",dashboard:"Dashboard",requests:"Requests",verifiedBadge:"✓ Verified",pendingBadge:"⏳ Pending verification"},
    bidForm:{back:"← Back",price:"Your rate (AED/h)",msg:"Your message to the student",msgPh:"Introduce yourself, experience, availability...",send:"Send offer →",recv:"✓ You receive",afterC:"after 6% fee"},
    onboard:{title:"Create your tutor profile",sub:"Join 200+ verified tutors across the Gulf.",name:"Full name *",email:"Email *",bio:"Bio",bioPh:"Your background & teaching style...",cycle:"Teaching cycle *",subjects:"Subjects you teach *",curriculum:"Curriculum(s) *",langTeach:"Teaching language(s) *",rate:"Your hourly rate (AED) *",idDoc:"ID Document *",idDocHint:"Emirates ID, Qatar ID, Kuwait Civil ID, Iqama, etc.",diploma:"Diploma(s) *",idPh:"Upload your ID document",diplomaPh:"Upload your diploma(s)",submit:"Submit profile →",withdrawal:"Payout frequency *",wI:"Immediate",wW:"Weekly",wM:"Monthly",wInfo:"This can only be changed once per month from your profile.",banking:"Banking details for payouts",bankName:"Bank name *",bankIban:"IBAN *",bankHolder:"Account holder name *",bankHint:"Your payouts will be sent to this account. Encrypted and secure."},
    signup:{role:"You are *",student:"Student / Parent",teacher:"Teacher",name:"Full name *",country:"Country *",emirate:"Emirate *",lang:"Preferred language",curriculum:"Your curriculum *",instrLang:"Language of instruction *",level:"Your current level *",age:"Your age"},
    profile:{title:"My Profile",name:"Full name",email:"Email",role:"Role",changePassword:"Change password",newPassword:"New password",confirmPassword:"Confirm new password",savePassword:"Update password",saveProfile:"Save changes",passwordSuccess:"Password updated!",profileSuccess:"Profile updated!",banking:"Banking details",bankName:"Bank name",bankIban:"IBAN",bankHolder:"Account holder",payoutFreq:"Payout frequency",payoutNote:"Can only be changed once per month.",lastChanged:"Last changed"},
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
    payment:{title:"تأكيد والدفع",sub:"سيتم التحقق من بطاقتك فقط، لن يتم الخصم إلا بعد الحصة.",lessonPrice:"سعر الحصة",serviceFee:"رسوم الخدمة (6%)",total:"المجموع",teacherReceives:"يستلم المدرس",platformFee:"رسوم المنصة",payBtn:"تأكيد الحجز ←",payNote:"💳 ستُخصم من بطاقتك بعد انتهاء الحصة."},
    confirm:{title:"تم تأكيد الحجز! 🎉",sub1:"حصتك مع ",sub2:" مؤكدة.",subject:"المادة",teacher:"المدرس",price:"ستدفع",teacherGets:"يستلم المدرس",jitsi:"رابط الفيديو",jitsiNote:"سيُرسل بالبريد قبل الحصة.",pay:"الدفع بعد الحصة",secured:"✓ مؤمّن بـ Stripe",newReq:"نشر طلب جديد"},
    teacher:{hello:"مرحباً بعودتك",sub:"طلبات جديدة تتناسب مع ملفك.",revenue:"هذا الشهر",courses:"الحصص",rating:"التقييم",newAds:"طلبات الطلاب",bid:"تقديم عرض ←",ignore:"تجاهل",profile:"ملفي",yourRate:"سعرك",rateHint:"تستلم 94% بعد رسوم 6%",dashboard:"لوحة التحكم",requests:"الطلبات",verifiedBadge:"✓ موثّق",pendingBadge:"⏳ قيد المراجعة"},
    bidForm:{back:"← رجوع",price:"سعرك (AED/ساعة)",msg:"رسالتك للطالب",msgPh:"عرّف بنفسك وخبرتك...",send:"إرسال العرض ←",recv:"✓ ستحصل على",afterC:"بعد رسوم 6%"},
    onboard:{title:"أنشئ ملف المدرس",sub:"انضم لأكثر من 200 مدرس موثّق.",name:"الاسم الكامل *",email:"البريد الإلكتروني *",bio:"نبذة عنك",bioPh:"خلفيتك وأسلوبك...",cycle:"المرحلة التعليمية *",subjects:"المواد التي تدرّسها *",curriculum:"المناهج *",langTeach:"لغة التدريس *",rate:"سعرك بالساعة (AED) *",idDoc:"وثيقة الهوية *",idDocHint:"الهوية الإماراتية، الهوية القطرية، البطاقة المدنية الكويتية، الإقامة، إلخ.",diploma:"الشهادة *",idPh:"رفع وثيقة الهوية",diplomaPh:"رفع الشهادة",submit:"إرسال الملف ←",withdrawal:"تكرار الصرف *",wI:"فوري",wW:"أسبوعي",wM:"شهري",wInfo:"لا يمكن تغيير هذا إلا مرة واحدة في الشهر.",banking:"بيانات الحساب البنكي",bankName:"اسم البنك *",bankIban:"IBAN *",bankHolder:"اسم صاحب الحساب *",bankHint:"سيتم تحويل أرباحك إلى هذا الحساب. مشفر وآمن."},
    signup:{role:"أنت *",student:"طالب / ولي أمر",teacher:"مدرس",name:"الاسم الكامل *",country:"الدولة *",emirate:"الإمارة *",lang:"اللغة المفضلة",curriculum:"منهجك الدراسي *",instrLang:"لغة التدريس *",level:"مستواك الحالي *",age:"عمرك"},
    profile:{title:"ملفي الشخصي",name:"الاسم الكامل",email:"البريد الإلكتروني",role:"الدور",changePassword:"تغيير كلمة المرور",newPassword:"كلمة المرور الجديدة",confirmPassword:"تأكيد كلمة المرور",savePassword:"تحديث",saveProfile:"حفظ",passwordSuccess:"تم التحديث!",profileSuccess:"تم الحفظ!",banking:"البيانات البنكية",bankName:"اسم البنك",bankIban:"IBAN",bankHolder:"اسم صاحب الحساب",payoutFreq:"تكرار الصرف",payoutNote:"لا يمكن التغيير إلا مرة في الشهر.",lastChanged:"آخر تغيير"},
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
    payment:{title:"Confirmer & Payer",sub:"Ta carte sera autorisée mais NON débitée avant le cours.",lessonPrice:"Prix du cours",serviceFee:"Frais de service (6%)",total:"Total",teacherReceives:"L'enseignant reçoit",platformFee:"Commission plateforme",payBtn:"Confirmer la réservation →",payNote:"💳 Ta carte sera débitée APRÈS le cours."},
    confirm:{title:"Réservation confirmée ! 🎉",sub1:"Ton cours avec ",sub2:" est confirmé.",subject:"Matière",teacher:"Enseignant",price:"Tu paieras",teacherGets:"L'enseignant reçoit",jitsi:"Lien visio",jitsiNote:"Sera envoyé par email avant le cours.",pay:"Paiement après le cours",secured:"✓ Sécurisé par Stripe",newReq:"Poster une nouvelle annonce"},
    teacher:{hello:"Bon retour",sub:"Nouvelles annonces correspondant à ton profil.",revenue:"ce mois",courses:"Cours",rating:"Note",newAds:"Annonces élèves",bid:"Faire une offre →",ignore:"Ignorer",profile:"Mon profil",yourRate:"Ton tarif",rateHint:"Tu reçois 94% après 6% de frais plateforme",dashboard:"Tableau de bord",requests:"Annonces",verifiedBadge:"✓ Vérifié",pendingBadge:"⏳ En cours de vérification"},
    bidForm:{back:"← Retour",price:"Ton tarif (AED/h)",msg:"Ton message à l'élève",msgPh:"Présente-toi et ton expérience...",send:"Envoyer mon offre →",recv:"✓ Tu recevras",afterC:"après 6% de frais"},
    onboard:{title:"Crée ton profil enseignant",sub:"Rejoins +200 enseignants vérifiés.",name:"Nom complet *",email:"Email *",bio:"Biographie",bioPh:"Ton parcours et ta pédagogie...",cycle:"Cycle enseigné *",subjects:"Matières enseignées *",curriculum:"Cursus *",langTeach:"Langue(s) d'enseignement *",rate:"Ton tarif horaire (AED) *",idDoc:"Pièce d'identité *",idDocHint:"Emirates ID, Qatar ID, Kuwait Civil ID, titre de séjour, etc.",diploma:"Diplôme(s) *",idPh:"Uploader ta pièce d'identité",diplomaPh:"Uploader ton diplôme",submit:"Soumettre mon profil →",withdrawal:"Fréquence de virement *",wI:"Immédiat",wW:"Hebdomadaire",wM:"Mensuel",wInfo:"Modifiable une seule fois par mois depuis ton profil.",banking:"Coordonnées bancaires",bankName:"Nom de la banque *",bankIban:"IBAN *",bankHolder:"Titulaire du compte *",bankHint:"Tes virements seront envoyés sur ce compte. Informations chiffrées et sécurisées."},
    signup:{role:"Tu es *",student:"Élève / Parent",teacher:"Enseignant",name:"Nom complet *",country:"Pays *",emirate:"Émirat *",lang:"Langue préférée",curriculum:"Ton cursus *",instrLang:"Langue d'enseignement *",level:"Ton niveau actuel *",age:"Ton âge"},
    profile:{title:"Mon Profil",name:"Nom complet",email:"Email",role:"Rôle",changePassword:"Changer le mot de passe",newPassword:"Nouveau mot de passe",confirmPassword:"Confirmer le mot de passe",savePassword:"Mettre à jour",saveProfile:"Enregistrer",passwordSuccess:"Mot de passe mis à jour !",profileSuccess:"Profil mis à jour !",banking:"Coordonnées bancaires",bankName:"Banque",bankIban:"IBAN",bankHolder:"Titulaire",payoutFreq:"Fréquence de virement",payoutNote:"Modifiable une fois par mois.",lastChanged:"Dernière modification"},
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
html{scroll-behavior:smooth}
body{background:#F5F7FF;color:#111827;min-height:100vh;line-height:1.75;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font-family:inherit}
img,svg{max-width:100%;display:block}
.app-root{font-family:'Nunito',sans-serif;background:#F5F7FF}
.app-root.rtl{font-family:'Cairo',sans-serif;direction:rtl}
.nav{position:sticky;top:0;z-index:100;background:rgba(255,255,255,.96);backdrop-filter:blur(18px);border-bottom:1px solid rgba(226,232,240,.9);padding:0 1.5rem;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:72px}
.nav-logo{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#5B4FE8;cursor:pointer;letter-spacing:-.5px;white-space:nowrap}
.nav-links{display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap}
.nav-link{font-size:13px;color:#667085;cursor:pointer;font-weight:700;transition:color .2s;white-space:nowrap}
.nav-link:hover{color:#5B4FE8}
.lang-switch{display:flex;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;background:#fff}
.lang-btn{padding:6px 12px;cursor:pointer;transition:all .15s;color:#667085;background:transparent;border:none;font-size:12px;font-weight:800}
.lang-btn.active{background:#5B4FE8;color:#fff}
.nav-cta{background:#5B4FE8;color:#fff;border:none;border-radius:999px;padding:11px 20px;font-size:13px;font-weight:800;cursor:pointer;transition:transform .2s,background .2s;white-space:nowrap;box-shadow:0 16px 40px rgba(91,79,232,.18)}
.nav-cta:hover{background:#3D34C4;transform:translateY(-1px)}
.nav-logout{background:#F8FAFC;color:#344054;border:none;border-radius:999px;padding:10px 16px;font-size:12px;font-weight:700;cursor:pointer;transition:background .2s}
.nav-logout:hover{background:#E2E8F0}
.user-badge{background:#EEF2FF;color:#4338CA;border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:background .2s}
.user-badge:hover{background:#DDD9FF}
.hero{min-height:90vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4rem 2rem;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at top, rgba(91,79,232,.14) 0%, transparent 42%);z-index:0}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:#EEF2FF;color:#4F46E5;border:1px solid #D9DBFE;border-radius:999px;padding:8px 18px;font-size:12px;font-weight:800;margin-bottom:1.5rem;position:relative;z-index:1}
.hero-dot{width:8px;height:8px;border-radius:50%;background:#5B4FE8;animation:pulse 2.2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.28}}
.hero h1{font-family:'Fraunces',serif;font-size:clamp(2.4rem,6vw,4.4rem);font-weight:900;line-height:1.03;letter-spacing:-1px;color:#111827;max-width:860px;margin-bottom:1.5rem;position:relative;z-index:1}
.rtl .hero h1{font-family:'Cairo',sans-serif;letter-spacing:0}
.hero h1 span{color:#5B4FE8}
.hero p{font-size:1.05rem;color:#475569;max-width:560px;line-height:1.8;margin-bottom:2.5rem;position:relative;z-index:1;font-weight:500}
.hero-btns{display:flex;gap:14px;position:relative;z-index:1;flex-wrap:wrap;justify-content:center}
.btn-big{padding:15px 30px;border-radius:999px;font-size:15px;font-weight:800;cursor:pointer;border:none;transition:all .25s}
.btn-big-primary{background:#5B4FE8;color:#fff;box-shadow:0 16px 40px rgba(91,79,232,.16)}
.btn-big-primary:hover{background:#3D34C4;transform:translateY(-2px)}
.btn-big-outline{background:transparent;color:#5B4FE8;border:2px solid #5B4FE8}
.btn-big-outline:hover{background:#EEF2FF}
.hero-stats{display:flex;gap:2rem;margin-top:3.5rem;position:relative;z-index:1;flex-wrap:wrap;justify-content:center}
.hero-stat-val{font-family:'Fraunces',serif;font-size:1.85rem;font-weight:900;color:#111827}
.hero-stat-lbl{font-size:12px;color:#64748B;margin-top:3px;font-weight:600}
.float-card{position:absolute;background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:14px 18px;font-size:12px;animation:float 6s ease-in-out infinite;box-shadow:0 20px 48px rgba(15,23,42,.08);font-weight:500}
.float-card:nth-child(1){top:18%;left:4%;animation-delay:0s}
.float-card:nth-child(2){top:24%;right:4%;animation-delay:-2s}
.float-card:nth-child(3){bottom:20%;left:7%;animation-delay:-4s}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.section{padding:5rem 2rem;max-width:1120px;margin:0 auto}
.section-label{font-size:11px;font-weight:800;letter-spacing:.15em;color:#5B4FE8;text-transform:uppercase;margin-bottom:.7rem}
.section-title{font-family:'Fraunces',serif;font-size:clamp(1.8rem,3.3vw,2.6rem);font-weight:900;letter-spacing:-.35px;color:#111827;margin-bottom:2.25rem}
.section-title span{color:#5B4FE8}
.steps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1.3rem}
.step-card{background:#fff;border:1px solid #E2E8F0;border-radius:22px;padding:1.75rem;position:relative;overflow:hidden;transition:transform .25s,box-shadow .25s}
.step-card:hover{transform:translateY(-4px);box-shadow:0 18px 42px rgba(91,79,232,.12)}
.step-num-bg{position:absolute;top:-14px;right:-8px;font-family:'Fraunces',serif;font-size:88px;font-weight:900;color:#F8FAFF;line-height:1;user-select:none}
.step-icon{font-size:28px;margin-bottom:1rem}
.step-card h3{font-family:'Fraunces',serif;font-size:16px;font-weight:700;margin-bottom:.4rem}
.step-card p{font-size:13px;color:#64748B;line-height:1.7;font-weight:500}
.subj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.subj-card{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #E2E8F0;border-radius:18px;padding:16px 18px;cursor:pointer;transition:transform .25s,border-color .25s,background .25s;font-weight:700;font-size:13px}
.subj-card:hover{border-color:#5B4FE8;background:#EEF2FF;color:#1D4ED8;transform:translateY(-2px)}
.teachers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:1.3rem}
.teacher-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:22px;padding:1.6rem;transition:transform .25s,border-color .25s,box-shadow .25s;cursor:pointer;box-shadow:0 16px 40px rgba(91,79,232,.06)}
.teacher-card:hover{border-color:#5B4FE8;transform:translateY(-3px);box-shadow:0 22px 55px rgba(91,79,232,.1)}
.tc-avatar{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;flex-shrink:0}
.pill{background:#EEF2FF;color:#4F46E5;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800}
.pill-teal{background:#ECFDF5;color:#0F766E;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800}
.app-container{background:#fff;border:1.5px solid #E2E8F0;border-radius:26px;overflow:hidden;box-shadow:0 24px 80px rgba(91,79,232,.08)}
.app-topbar{background:#111827;color:#fff;padding:16px 22px;display:flex;align-items:center;gap:12px}
.app-dot-row{display:flex;gap:8px}
.app-dot{width:10px;height:10px;border-radius:50%;background:#A78BFA}
.app-url{flex:1;background:#1F2937;border-radius:10px;padding:8px 14px;font-size:11px;color:#94A3B8;font-family:monospace}
.app-tabs{display:flex;border-bottom:1.5px solid #E2E8F0;background:#F8FAFF;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.app-tabs::-webkit-scrollbar{display:none}
.app-tab{padding:14px 20px;font-size:13px;font-weight:800;cursor:pointer;border-bottom:2.5px solid transparent;color:#667085;transition:all .25s;white-space:nowrap;flex-shrink:0}
.app-tab.active{color:#5B4FE8;border-bottom-color:#5B4FE8;background:#fff}
.app-body{padding:2rem;min-height:520px}
.page-title{font-family:'Fraunces',serif;font-size:2rem;font-weight:900;color:#111827;margin-bottom:.4rem}
.page-sub{font-size:13px;color:#64748B;margin-bottom:1.5rem;font-weight:500}
.prefilled-banner{background:#ECFDF5;border:1.5px solid #86EFAC;border-radius:14px;padding:14px 18px;font-size:13px;font-weight:700;color:#0F766E;margin-bottom:1.5rem;display:flex;align-items:center;gap:10px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.form-group{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.form-label{font-size:11px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.08em}
.form-select,.form-input,.form-textarea{border:1.5px solid #E2E8F0;border-radius:16px;padding:14px 16px;font-size:14px;background:#F8FAFF;color:#111827;outline:none;transition:border-color .25s,box-shadow .25s;min-height:48px;font-weight:600}
.form-select:focus,.form-input:focus,.form-textarea:focus{border-color:#5B4FE8;background:#fff;box-shadow:0 0 0 4px rgba(91,79,232,.08)}
.form-select.prefilled{background:#ECFDF5;border-color:#86EFAC;color:#166534;font-weight:700}
.form-textarea{min-height:100px;resize:vertical}
.chips-row{display:flex;flex-wrap:wrap;gap:10px}
.chip{padding:9px 18px;border-radius:999px;font-size:13px;font-weight:700;border:1.5px solid #E2E8F0;background:#fff;cursor:pointer;transition:all .2s}
.chip.selected{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.chip:hover:not(.selected){border-color:#5B4FE8;color:#5B4FE8;transform:translateY(-1px)}
.rate-chips{display:flex;flex-wrap:wrap;gap:10px}
.rate-chip{padding:12px 18px;border-radius:16px;font-size:14px;font-weight:800;border:1.5px solid #E2E8F0;background:#fff;cursor:pointer;transition:all .2s;font-family:'Fraunces',serif}
.rate-chip.selected{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.rate-chip:hover:not(.selected){border-color:#5B4FE8;color:#5B4FE8;transform:translateY(-1px)}
.submit-btn{width:100%;padding:15px;background:#5B4FE8;color:#fff;border:none;border-radius:18px;font-size:15px;font-weight:800;cursor:pointer;margin-top:1.25rem;transition:background .25s,transform .25s;box-shadow:0 18px 36px rgba(91,79,232,.16)}
.submit-btn:hover{background:#3D34C4;transform:translateY(-1px)}
.submit-btn:disabled{background:#C7D2FA;cursor:not-allowed;box-shadow:none;transform:none}
.online-banner{display:flex;align-items:center;gap:10px;background:#EEF2FF;border:1.5px solid #D8DBFE;border-radius:16px;padding:14px 18px;font-size:13px;font-weight:700;color:#3730A3;margin-bottom:1.5rem}
.pay-banner{display:flex;align-items:center;gap:8px;background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:16px;padding:13px 18px;font-size:13px;font-weight:700;color:#0F766E;margin-bottom:1.25rem}
.badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:700}
.badge-purple{background:#EEF2FF;color:#4338CA}
.badge-amber{background:#FEF3C7;color:#B45309}
.badge-green{background:#DCFCE7;color:#0F766E}
.badge-blue{background:#EFF6FF;color:#1D4ED8}
.badge-gray{background:#F8FAFC;color:#334155}
.offer-card{border:1.5px solid #E2E8F0;border-radius:22px;padding:1.75rem;margin-bottom:16px;background:#fff;transition:transform .25s,border-color .25s,box-shadow .25s;box-shadow:0 20px 50px rgba(91,79,232,.06)}
.offer-card:hover{border-color:#5B4FE8;transform:translateY(-3px);box-shadow:0 30px 70px rgba(91,79,232,.09)}
.offer-price{font-family:'Fraunces',serif;font-size:28px;font-weight:900;color:#5B4FE8}
.offer-teacher{font-weight:800;font-size:16px;color:#111827;margin-bottom:4px}
.offer-msg{font-size:13px;color:#64748B;line-height:1.7;margin:10px 0 16px}
.offer-actions{display:flex;gap:10px;flex-wrap:wrap}
.btn-accept{flex:2;padding:13px;background:#5B4FE8;color:#fff;border:none;border-radius:16px;font-size:14px;font-weight:800;cursor:pointer;transition:background .2s}
.btn-accept:hover{background:#3D34C4}
.btn-decline{flex:1;padding:13px;background:transparent;border:1.5px solid #E2E8F0;border-radius:16px;font-size:14px;color:#667085;font-weight:700;cursor:pointer;transition:all .2s}
.btn-decline:hover{border-color:#EF4444;color:#EF4444}
.payment-screen{max-width:520px;margin:0 auto}
.payment-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:24px;padding:1.9rem;margin-bottom:1.3rem;box-shadow:0 22px 58px rgba(91,79,232,.06)}
.payment-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #F1F5F9;font-size:14px}
.payment-row:last-child{border-bottom:none}
.payment-total{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#5B4FE8}
.payment-note{background:#FEF3C7;border:1.5px solid #FDE68A;border-radius:16px;padding:14px 18px;font-size:13px;color:#B45309;margin-bottom:1.25rem;font-weight:700}
.stripe-badge{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:#94A3B8;margin-top:10px;font-weight:600}
.teacher-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:1.5rem}
.stat-card{background:#F8FAFF;border:1.5px solid #E2E8F0;border-radius:18px;padding:1.2rem;text-align:center;box-shadow:0 18px 40px rgba(91,79,232,.05)}
.stat-val{font-family:'Fraunces',serif;font-size:24px;font-weight:900;color:#5B4FE8}
.stat-lbl{font-size:11px;color:#64748B;margin-top:6px;font-weight:600}
.req-card{border:1.5px solid #E2E8F0;border-radius:18px;padding:1.4rem;margin-bottom:14px;transition:border-color .25s,transform .25s}
.req-card:hover{border-color:#0ABFA3;transform:translateY(-2px)}
.req-title{font-family:'Fraunces',serif;font-size:16px;font-weight:700;color:#111827}
.upload-zone{border:2px dashed #D7DCEC;border-radius:18px;padding:22px 18px;text-align:center;cursor:pointer;transition:all .25s;background:#F8FAFF}
.upload-zone:hover{border-color:#5B4FE8;background:#EEF2FF}
.btn-teal{flex:1;padding:10px;background:#0ABFA3;color:#fff;border:none;border-radius:14px;font-size:13px;font-weight:800;cursor:pointer;transition:background .2s}
.btn-teal:hover{background:#089e87}
.btn-ghost{padding:10px 16px;background:transparent;border:1.5px solid #E2E8F0;border-radius:14px;font-size:13px;color:#667085;font-weight:700;cursor:pointer;transition:border-color .2s}
.btn-ghost:hover{border-color:#64748B;color:#111827}
.success-screen{text-align:center;padding:2rem 1rem}
.confirm-detail{background:#F8FAFF;border:1.5px solid #E2E8F0;border-radius:18px;padding:1.3rem;max-width:420px;margin:0 auto 1.5rem;text-align:start}
.confirm-row{display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #F1F5F9}
.confirm-row:last-child{border-bottom:none;padding-top:10px;margin-top:4px}
.jitsi-box{background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:16px;padding:16px;max-width:420px;margin:0 auto 1.25rem;text-align:center}
.loading-spinner{text-align:center;padding:3rem;color:#64748B;font-size:14px;font-weight:700}
.empty-state{text-align:center;padding:3rem;color:#64748B}
.empty-icon{font-size:48px;margin-bottom:1rem}
.footer{background:#111827;color:#CBD5E1;padding:3rem 2rem;text-align:center;margin-top:4rem}
.footer-logo{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#fff;margin-bottom:.75rem}
.toast{position:fixed;bottom:1.75rem;right:1.75rem;background:#111827;color:#fff;padding:14px 20px;border-radius:16px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:10px;z-index:999;animation:slideUp .3s ease;box-shadow:0 18px 50px rgba(0,0,0,.18)}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes popIn{0%{transform:scale(0.7);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes offerSlide{from{transform:translateX(-18px);opacity:0}to{transform:translateX(0);opacity:1}}
.auth-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(8px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem}
.auth-box{background:#fff;border-radius:28px;padding:2.5rem;width:100%;max-width:480px;box-shadow:0 24px 80px rgba(91,79,232,0.16);position:relative;max-height:90vh;overflow-y:auto}
.auth-logo{font-family:'Fraunces',serif;font-size:24px;font-weight:900;color:#5B4FE8;text-align:center;margin-bottom:.4rem}
.auth-title{font-size:18px;font-weight:800;color:#111827;text-align:center;margin-bottom:.2rem}
.auth-sub{font-size:13px;color:#64748B;text-align:center;margin-bottom:1.5rem}
.auth-tabs{display:flex;background:#F8FAFF;border-radius:14px;padding:4px;margin-bottom:1.5rem}
.auth-tab{flex:1;padding:12px;border:none;background:transparent;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;color:#64748B}
.auth-tab.active{background:#fff;color:#5B4FE8;box-shadow:0 2px 12px rgba(91,79,232,.08)}
.auth-group{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.auth-label{font-size:11px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.06em}
.auth-input,.auth-select{border:1.5px solid #E2E8F0;border-radius:16px;padding:13px 14px;font-size:14px;background:#F8FAFF;color:#111827;outline:none;transition:border-color .25s,width .25s;min-height:46px}
.auth-input:focus,.auth-select:focus{border-color:#5B4FE8;background:#fff;box-shadow:0 0 0 4px rgba(91,79,232,.08)}
.auth-role-row{display:flex;gap:10px;margin-bottom:14px}
.auth-role-btn{flex:1;padding:12px;border:1.5px solid #E2E8F0;border-radius:16px;background:#fff;cursor:pointer;text-align:center;transition:all .2s}
.auth-role-btn.selected{border-color:#5B4FE8;background:#EEF2FF}
.auth-role-icon{font-size:22px;margin-bottom:4px}
.auth-role-label{font-size:12px;font-weight:700;color:#111827}
.auth-btn{width:100%;padding:14px;background:#5B4FE8;color:#fff;border:none;border-radius:18px;font-size:15px;font-weight:800;cursor:pointer;transition:transform .2s,background .2s;margin-top:.5rem}
.auth-btn:hover{background:#3D34C4;transform:translateY(-1px)}
.auth-btn:disabled{background:#D8DBFE;cursor:not-allowed;transform:none}
.auth-remember{display:flex;align-items:center;gap:8px;font-size:13px;color:#64748B;margin-bottom:12px;cursor:pointer;font-weight:600}
.auth-remember input{width:16px;height:16px;cursor:pointer;accent-color:#5B4FE8}
.auth-error{background:#FEE2E2;border:1px solid #FECACA;border-radius:12px;padding:12px 14px;font-size:13px;color:#B91C1C;margin-bottom:12px;font-weight:600}
.auth-success{background:#ECFDF5;border:1.5px solid #6EE7B7;border-radius:12px;padding:12px 14px;font-size:13px;color:#0F766E;margin-bottom:12px;font-weight:600}
.auth-close{position:absolute;top:1rem;right:1rem;background:transparent;border:none;font-size:22px;cursor:pointer;color:#64748B}
.auth-chips{display:flex;flex-wrap:wrap;gap:8px}
.auth-chip{padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700;border:1.5px solid #E2E8F0;background:#fff;cursor:pointer;transition:all .2s}
.auth-chip.selected{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.section-divider{font-size:11px;font-weight:800;color:#5B4FE8;text-transform:uppercase;letter-spacing:.08em;margin:18px 0 10px;padding-bottom:6px;border-bottom:1.5px solid #E2E8F0}
.profile-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:22px;padding:1.75rem;margin-bottom:1.5rem;box-shadow:0 20px 50px rgba(91,79,232,.07)}
.profile-avatar{width:72px;height:72px;border-radius:50%;background:#EEF2FF;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#5B4FE8;margin:0 auto 1rem}
.teacher-subtabs{display:flex;gap:10px;margin-bottom:1.5rem}
.teacher-subtab{flex:1;padding:12px;border:1.5px solid #E2E8F0;border-radius:16px;font-size:13px;font-weight:800;cursor:pointer;text-align:center;transition:all .2s;background:#fff;color:#64748B}
.teacher-subtab.active{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.banking-card{background:#FEF8DD;border:1.5px solid #FACC15;border-radius:18px;padding:1.3rem;margin-bottom:1.25rem}
.verified-banner{background:#ECFDF5;border:1.5px solid #6EE7B7;border-radius:16px;padding:14px 18px;font-size:13px;font-weight:700;color:#0F766E;margin-bottom:1.25rem;display:flex;align-items:center;gap:10px}
.pending-banner{background:#FEF3C7;border:1.5px solid #FBBF24;border-radius:16px;padding:14px 18px;font-size:13px;font-weight:700;color:#92400E;margin-bottom:1.25rem;display:flex;align-items:center;gap:10px}
.payout-info{background:#ECFDF5;border:1.5px solid #6EE7B7;border-radius:16px;padding:14px 18px;margin-bottom:1.25rem;font-size:13px;font-weight:700;color:#0F766E}
.missing-bank{background:#FEF3C7;border:1.5px solid #FBBF24;border-radius:16px;padding:14px 18px;margin-bottom:1.25rem;cursor:pointer}
.missing-bank:hover{background:#FEEAB7}
@media(max-width:900px){.app-body{padding:1.5rem}.section{padding:4rem 1.25rem}.hero{padding:3.5rem 1.25rem}.app-topbar{flex-direction:column;align-items:flex-start;padding:18px 20px}.nav{padding:0 1rem;gap:10px;row-gap:8px;column-gap:8px}.hero-stats{gap:1.5rem}.form-row{grid-template-columns:1fr}.submit-btn{padding:14px}.hero h1{font-size:clamp(2.2rem,8vw,3.6rem)}}
@media(max-width:700px){.nav-links{display:none}.nav{justify-content:space-between}.hero{min-height:auto;padding:3rem 1rem}.section{padding:3rem 1rem}.app-body{padding:1rem}.app-container{border-radius:22px}.teacher-card,.offer-card,.payment-card,.profile-card{padding:1.25rem}.app-tab{padding:12px 14px;font-size:12px}.page-title{font-size:1.5rem}.hero-btns{flex-direction:column;gap:12px}.hero-stat-val{font-size:1.4rem}.hero p{max-width:100%}}
.btn-full{width:100%;padding:15px;background:#5B4FE8;color:#fff;border:none;border-radius:18px;font-size:15px;font-weight:800;cursor:pointer;transition:background .25s,transform .25s;box-shadow:0 18px 36px rgba(91,79,232,.16)}
.btn-full:hover{background:#3D34C4;transform:translateY(-1px)}
.btn-full:disabled{background:#C7D2FA;cursor:not-allowed;box-shadow:none;transform:none}
.banner{display:flex;align-items:center;gap:10px;border-radius:16px;padding:14px 18px;font-size:13px;font-weight:700;margin-bottom:1.25rem}
.banner-blue{background:#EEF2FF;border:1.5px solid #D8DBFE;color:#3730A3}
.banner-green{background:#ECFDF5;border:1.5px solid #86EFAC;color:#0F766E}
.banner-teal{background:#ECFDF5;border:1.5px solid #A7F3D0;color:#0F766E}
.banner-amber{background:#FEF3C7;border:1.5px solid #FDE68A;color:#92400E}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.empty{text-align:center;padding:3rem 1rem;color:#64748B}
.empty-icon{font-size:48px;margin-bottom:1rem}
.loading{text-align:center;padding:3rem;color:#64748B;font-size:14px;font-weight:700}
.profile-section{background:#fff;border:1.5px solid #E2E8F0;border-radius:22px;padding:1.75rem;margin-bottom:1.5rem;box-shadow:0 20px 50px rgba(91,79,232,.07)}
.profile-section-title{font-weight:800;font-size:15px;margin-bottom:.75rem;color:#1A1A2E}`;

function Auth({ onClose, onSuccess, lang }) {
  const appLang = lang || "en";
  const t = T[appLang] || T.en;
  const [tab, setTab] = useState("login");
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
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
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, role } } });
    if (error) { console.error("Signup error:", error); setLoading(false); setError(error.message); return; }
    if (data.user) {
      await supabase.from("profiles").update({
        role, full_name: fullName, language: prefLang, country_code: country,
        region_code: country === "UAE" ? region : null,
      }).eq("id", data.user.id);
      await supabase.auth.updateUser({ data: { role, full_name: fullName } });
      if (role === "student" && curriculum && level) {
        await supabase.from("student_profiles").insert({
          owner_id: data.user.id, full_name: fullName, age: age ? parseInt(age) : null,
          curriculum, level,
          default_lang: instrLang.toLowerCase().includes("english") || instrLang.includes("الإنجليزية") || instrLang.includes("Anglais") ? "en" : instrLang.toLowerCase().includes("arabic") || instrLang.includes("العربية") || instrLang.includes("Arabe") ? "ar" : "fr",
          country_code: country, region_code: country === "UAE" ? region : null,
        }).then(() => {});
      }
    }
    setLoading(false);
    if (data.session) { onSuccess(); }
    else { setSuccess(lang==="fr"?"✅ Compte créé ! Vérifie ta boîte email (et tes spams) et clique sur le lien de confirmation pour activer ton compte.":lang==="ar"?"✅ تم إنشاء الحساب ! تحقق من بريدك الإلكتروني (والبريد العشوائي) وانقر على رابط التأكيد لتفعيل حسابك.":"✅ Account created! Check your inbox (and spam folder) and click the confirmation link to activate your account."); setTab("login"); }
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
        {tab==="login" && <label className="auth-remember"><input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} />Remember me</label>}
        {tab==="signup" && <>
          <div className="auth-group"><label className="auth-label">{t.signup.country}</label><select className="auth-select" value={country} onChange={e=>setCountry(e.target.value)}>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name[appLang]||c.name.en}</option>)}</select></div>
          {country==="UAE" && <div className="auth-group"><label className="auth-label">{t.signup.emirate}</label><select className="auth-select" value={region} onChange={e=>setRegion(e.target.value)}>{UAE_REGIONS.map(r=><option key={r.code} value={r.code}>{r.name}</option>)}</select></div>}
          <div className="auth-group"><label className="auth-label">{t.signup.lang}</label><select className="auth-select" value={prefLang} onChange={e=>setPrefLang(e.target.value)}><option value="en">🇬🇧 English</option><option value="ar">🇸🇦 العربية</option><option value="fr">🇫🇷 Français</option></select></div>
          {role==="student" && <>
            <div className="section-divider">📚 Your learning profile</div>
            <div className="form-row" style={{marginBottom:0}}>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.curriculum}</label><select className="auth-select" value={curriculum} onChange={e=>{setCurriculum(e.target.value);setLevel("");}}><option value="">Choose...</option>{Object.entries(CURRICULA).map(([k,v])=><option key={k} value={k}>{v.label[appLang]||v.label.en}</option>)}</select></div>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.instrLang}</label><select className="auth-select" value={instrLang} onChange={e=>setInstrLang(e.target.value)}><option value="">Choose...</option>{t.instrLangs.map(l=><option key={l}>{l}</option>)}</select></div>
            </div>
            <div className="form-row" style={{marginBottom:0}}>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.level}</label><select className="auth-select" value={level} onChange={e=>setLevel(e.target.value)} disabled={!studentLevels.length}><option value="">{studentLevels.length?"Choose...":"Select curriculum first"}</option>{studentLevels.map(l=><option key={l}>{l}</option>)}</select></div>
              <div className="auth-group" style={{marginBottom:0}}><label className="auth-label">{t.signup.age}</label><input className="auth-input" type="number" min="6" max="18" placeholder="ex: 14" value={age} onChange={e=>setAge(e.target.value)} /></div>
            </div>
          </>}
          {role==="teacher" && <>
            <div className="section-divider">🎓 Your teaching profile</div>
            <div className="auth-group"><label className="auth-label">{t.onboard.cycle}</label><div className="auth-chips">{t.cycles.map(c=><div key={c} className={`auth-chip${teachCycle===c?" selected":""}`} onClick={()=>setTeachCycle(c)}>{c}</div>)}</div></div>
          </>}
        </>}
        <button className="auth-btn" onClick={tab==="login"?handleLogin:handleSignup} disabled={loading}>{loading?"⏳ Loading...":tab==="login"?"Sign in →":"Create account →"}</button>
      </div>
    </div>
  );
}

function ProfilePage({ user, userProfile, profileLoading, lang, onSaved, country, onEditTeachingProfile }) {
  const t = T[lang] || T.en;
  const [fullName, setFullName] = useState(userProfile?.full_name || user?.user_metadata?.full_name || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bankName, setBankName] = useState(userProfile?.bank_name || "");
  const [bankIban, setBankIban] = useState(userProfile?.bank_iban || "");
  const [bankHolder, setBankHolder] = useState(userProfile?.bank_holder || "");
  const [payoutFreq, setPayoutFreq] = useState(userProfile?.withdrawal_frequency || "wW");
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [msg, setMsg] = useState("");
  const [childName, setChildName] = useState(userProfile?.child_name || "");
  const [childCurriculum, setChildCurriculum] = useState(userProfile?.child_curriculum || "");
  const [childLevel, setChildLevel] = useState(userProfile?.child_level || "");
  const [childLang, setChildLang] = useState(userProfile?.child_lang || "");
  const [childSubjects, setChildSubjects] = useState<string[]>(userProfile?.child_subjects || []);
  const [savingChild, setSavingChild] = useState(false);
  const childLevels = childCurriculum && CURRICULA[childCurriculum] ? CURRICULA[childCurriculum].levels[lang] || CURRICULA[childCurriculum].levels.en : [];

  const saveChildProfile = async () => {
    setSavingChild(true);
    await supabase.from("profiles").update({child_name:childName,child_curriculum:childCurriculum,child_level:childLevel,child_lang:childLang,child_subjects:childSubjects}).eq("id",user.id);
    setSavingChild(false);setMsg("✅ "+(lang==="fr"?"Profil enfant enregistré !":lang==="ar"?"تم حفظ ملف الطفل!":"Child profile saved!"));
    setTimeout(()=>setMsg(""),3000);
  };

  if (profileLoading) return <div className="loading-spinner">⏳ Loading...</div>;
  if (!userProfile) return <div className="loading-spinner">⏳ Loading profile...</div>;
  const isTeacherProfile = userProfile?.role === "teacher";

  const initials = (fullName || "?").split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2);

  const canChangeFreq = () => {
    if (!userProfile?.withdrawal_changed_at) return true;
    const diffDays = (Date.now() - new Date(userProfile.withdrawal_changed_at).getTime()) / (1000*60*60*24);
    return diffDays >= 30;
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { full_name: fullName } });
    setSaving(false); setMsg(t.profile.profileSuccess);
    onSaved(fullName); setTimeout(() => setMsg(""), 3000);
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) { setMsg("⚠️ Passwords don't match"); return; }
    if (newPassword.length < 6) { setMsg("⚠️ Min. 6 characters"); return; }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPwd(false);
    if (error) { setMsg("❌ " + error.message); return; }
    setMsg(t.profile.passwordSuccess); setNewPassword(""); setConfirmPassword("");
    setTimeout(() => setMsg(""), 3000);
  };

  const handleSaveBank = async () => {
    if (!bankName || !bankIban || !bankHolder) { setMsg("⚠️ Please fill all banking fields"); return; }
    setSavingBank(true);
    const updateData: any = { bank_name: bankName, bank_iban: bankIban, bank_holder: bankHolder };
    if (payoutFreq !== userProfile?.withdrawal_frequency && canChangeFreq()) {
      updateData.withdrawal_frequency = payoutFreq;
      updateData.withdrawal_changed_at = new Date().toISOString();
    }
    await supabase.from("profiles").update(updateData).eq("id", user.id);
    setSavingBank(false); setMsg("✅ Banking details saved!");
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div style={{maxWidth:500,margin:"0 auto"}}>
      <div className="page-title">{t.profile.title}</div>
      <div style={{height:"1rem"}}/>
      {msg && <div className="auth-success">{msg}</div>}
      <div className="profile-card">
        <div className="profile-avatar">{initials}</div>
        {isTeacherProfile && (userProfile?.verified
          ? <div className="verified-banner">✅ {t.teacher.verifiedBadge}</div>
          : <div className="pending-banner">⏳ {t.teacher.pendingBadge} — {lang==="fr"?"Vos documents sont en cours de vérification (24h)":lang==="ar"?"جاري مراجعة وثائقك (24 ساعة)":"Your documents are under review (24h)"}</div>
        )}
        <div className="form-group"><label className="form-label">{t.profile.name}</label><input className="form-input" value={fullName} onChange={e=>setFullName(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">{t.profile.email}</label><input className="form-input" value={user?.email||""} disabled style={{opacity:.6}} /></div>
        <div className="form-group"><label className="form-label">{t.profile.role}</label><input className="form-input" value={isTeacherProfile?(lang==="fr"?"Enseignant ✓":lang==="ar"?"مدرس ✓":"Teacher ✓"):(lang==="fr"?"Élève / Parent":lang==="ar"?"طالب / ولي أمر":"Student / Parent")} disabled style={{opacity:.6,background:isTeacherProfile?"#E6FAF8":"#FAFBFF",color:isTeacherProfile?"#0F6E56":"#1A1A2E",fontWeight:700}} /></div>
        <button className="submit-btn" onClick={handleSaveProfile} disabled={saving} style={{marginTop:"1rem"}}>{saving?"⏳ Saving...":t.profile.saveProfile}</button>
      </div>
      {isTeacherProfile && userProfile?.teaching_subjects?.length > 0 && (
        <div className="profile-card">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#1A1A2E"}}>🎓 {lang==="fr"?"Profil pédagogique":lang==="ar"?"الملف التربوي":"Teaching profile"}</div>
            {onEditTeachingProfile && <button className="btn-ghost" onClick={onEditTeachingProfile}>✏️ {lang==="fr"?"Modifier":lang==="ar"?"تعديل":"Edit"}</button>}
          </div>
          {userProfile.teaching_cycles?.length > 0 && (
            <div className="form-group">
              <label className="form-label">{t.onboard.cycle}</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{userProfile.teaching_cycles.map(c=><span key={c} className="badge badge-purple">{c}</span>)}</div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t.onboard.subjects}</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{userProfile.teaching_subjects.map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return <span key={s} className="badge badge-blue">{subj?subj[lang]:s}</span>;})}</div>
          </div>
          {userProfile.teaching_langs?.length > 0 && (
            <div className="form-group">
              <label className="form-label">{t.onboard.langTeach}</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{userProfile.teaching_langs.map(l=><span key={l} className="badge badge-green">{l}</span>)}</div>
            </div>
          )}
          {userProfile.teaching_rate && (
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">{t.teacher.yourRate}</label>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,color:"#5B4FE8"}}>
                {fmtPrice(userProfile.teaching_rate,country)}/h
                <span style={{fontSize:13,fontWeight:500,color:"#6B7280",marginInlineStart:8}}>→ {fmtPrice(Math.round(userProfile.teaching_rate*(1-TEACHER_FEE)),country)}/h ({t.teacher.rateHint})</span>
              </div>
            </div>
          )}
        </div>
      )}
      {isTeacherProfile && (
        <div className="profile-card">
          <div style={{fontWeight:800,fontSize:15,marginBottom:"1rem",color:"#1A1A2E"}}>🏦 {t.profile.banking}</div>
          <div className="banking-card">
            <div style={{fontSize:12,color:"#92400E",fontWeight:600,marginBottom:"1rem"}}>🔒 {t.onboard.bankHint}</div>
            <div className="form-group"><label className="form-label">{t.profile.bankName}</label><input className="form-input" placeholder="Wio Bank, Emirates NBD, QNB..." value={bankName} onChange={e=>setBankName(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">{t.profile.bankIban}</label><input className="form-input" placeholder="AE07 0331 2345 6789 0123 456" value={bankIban} onChange={e=>setBankIban(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">{t.profile.bankHolder}</label><input className="form-input" placeholder="Sarah Al-Mansouri" value={bankHolder} onChange={e=>setBankHolder(e.target.value)} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">💳 {t.profile.payoutFreq}</label>
            <div className="chips-row">
              {[["wI",t.onboard.wI],["wW",t.onboard.wW],["wM",t.onboard.wM]].map(([k,v])=>(
                <div key={k}
                  className={`chip${payoutFreq===k?" selected":""}`}
                  onClick={()=>{ if(canChangeFreq()||payoutFreq===k) setPayoutFreq(k); }}
                  style={{opacity:!canChangeFreq()&&payoutFreq!==k?0.5:1,cursor:!canChangeFreq()&&payoutFreq!==k?"not-allowed":"pointer"}}
                >{v}</div>
              ))}
            </div>
            <div style={{fontSize:11,color:"#9CA3AF",marginTop:6,fontWeight:600}}>
              ⚠️ {t.profile.payoutNote}
              {userProfile?.withdrawal_changed_at && ` ${t.profile.lastChanged}: ${new Date(userProfile.withdrawal_changed_at).toLocaleDateString()}`}
            </div>
          </div>
          <button className="submit-btn" onClick={handleSaveBank} disabled={savingBank} style={{marginTop:"1rem"}}>{savingBank?"⏳ Saving...":t.profile.saveProfile}</button>
        </div>
      )}
      {!isTeacherProfile && (
        <div className="profile-section">
          <div className="profile-section-title">🎓 {lang==="fr"?"Profil de l'élève":lang==="ar"?"ملف الطالب":"Student's profile"}</div>
          <div style={{fontSize:12,color:"#64748B",marginBottom:"1rem",fontWeight:600}}>{lang==="fr"?"Ces infos pré-remplissent automatiquement tes annonces.":lang==="ar"?"هذه المعلومات تُعبئ إعلاناتك تلقائياً.":"This info pre-fills your requests automatically."}</div>
          <div className="form-group"><label className="form-label">{lang==="fr"?"Prénom de l'élève":lang==="ar"?"اسم الطالب":"Student's first name"}</label><input className="form-input" placeholder="Emma" name="child_firstname" autoComplete="given-name-off" autoCorrect="off" autoCapitalize="off" value={childName} onChange={e=>setChildName(e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">{lang==="fr"?"Cursus":lang==="ar"?"المنهج":"Curriculum"}</label><select className="form-select" value={childCurriculum} onChange={e=>{setChildCurriculum(e.target.value);setChildLevel("");}}><option value="">{lang==="fr"?"Choisir...":"Choose..."}</option>{Object.entries(CURRICULA).map(([k,v])=><option key={k} value={k}>{v.label[lang]||v.label.en}</option>)}</select></div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">{lang==="fr"?"Niveau":"Level"}</label><select className="form-select" value={childLevel} onChange={e=>setChildLevel(e.target.value)} disabled={!childLevels.length}><option value="">{childLevels.length?(lang==="fr"?"Choisir...":"Choose..."):(lang==="fr"?"Sélectionne un cursus":"Select curriculum")}</option>{childLevels.map(l=><option key={l}>{l}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">{lang==="fr"?"Langue d'enseignement préférée":lang==="ar"?"لغة التدريس المفضلة":"Preferred language"}</label><div className="chips">{t.instrLangs.map(l=><div key={l} className={`chip${childLang===l?" selected":""}`} onClick={()=>setChildLang(l)}>{l}</div>)}</div></div>
          <div className="form-group" style={{marginBottom:"1.25rem"}}><label className="form-label">{lang==="fr"?"Matières en difficulté":lang==="ar"?"المواد الصعبة":"Subjects needing help"}</label><div className="chips">{SUBJECTS.map(s=><div key={s.en} className={`chip${childSubjects.includes(s.en)?" selected":""}`} onClick={()=>setChildSubjects(prev=>prev.includes(s.en)?prev.filter(x=>x!==s.en):[...prev,s.en])}>{s[lang]}</div>)}</div></div>
          <button className="btn-full" onClick={saveChildProfile} disabled={savingChild}>{savingChild?"⏳ Saving...":lang==="fr"?"Enregistrer":lang==="ar"?"حفظ":"Save"}</button>
        </div>
      )}

      <div className="profile-card">
        <div style={{fontWeight:800,fontSize:15,marginBottom:"1rem",color:"#1A1A2E"}}>🔒 {t.profile.changePassword}</div>
        <div className="form-group"><label className="form-label">{t.profile.newPassword}</label><input className="form-input" type="password" placeholder="Min. 6 characters" value={newPassword} onChange={e=>setNewPassword(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">{t.profile.confirmPassword}</label><input className="form-input" type="password" placeholder="Repeat new password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} /></div>
        <button className="submit-btn" onClick={handleChangePassword} disabled={savingPwd} style={{marginTop:"0.5rem"}}>{savingPwd?"⏳ Updating...":t.profile.savePassword}</button>
      </div>
    </div>
  );
}

function CheckoutForm({ booking, totalAmount, onSuccess, onBack, lang }) {
  const stripe = useStripe();
  const elements = useElements();
  const t = T[lang] || T.en;
  const [paying, setPaying] = useState(false);
  const [cardError, setCardError] = useState("");

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setCardError("");
    try {
      const response = await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking?.id, amount: totalAmount }),
      });
      const { clientSecret, error: serverError } = await response.json();
      if (serverError) throw new Error(serverError);

      const cardElement = elements.getElement(CardElement);
      const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (stripeErr) {
        const code=stripeErr.code||"";
        const humanError=code.includes("insufficient_funds")?(lang==="fr"?"Fonds insuffisants sur ta carte.":lang==="ar"?"رصيد البطاقة غير كافٍ.":"Insufficient funds on your card."):code.includes("card_declined")?(lang==="fr"?"Ta carte a été refusée. Essaie une autre carte.":lang==="ar"?"تم رفض بطاقتك. جرّب بطاقة أخرى.":"Your card was declined. Try another card."):code.includes("expired_card")?(lang==="fr"?"Ta carte est expirée.":lang==="ar"?"بطاقتك منتهية الصلاحية.":"Your card is expired."):code.includes("incorrect_cvc")?(lang==="fr"?"Le code CVC est incorrect.":lang==="ar"?"رمز CVC غير صحيح.":"Incorrect CVC code."):(lang==="fr"?"Paiement refusé. Vérifie tes informations ou utilise une autre carte.":lang==="ar"?"تم رفض الدفع. تحقق من معلوماتك أو استخدم بطاقة أخرى.":"Payment declined. Check your details or use another card.");
        setCardError(humanError);setPaying(false);return;
      }

      if (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded") {
        onSuccess();
      }
    } catch(e) {
      setCardError("❌ " + e.message);
      setPaying(false);
    }
  };

  const cardStyle = {
    style: {
      base: { fontSize:"16px", color:"#1A1A2E", fontFamily:"'Nunito', sans-serif", fontWeight:"600", "::placeholder":{color:"#9CA3AF"} },
      invalid: { color:"#EF4444" },
    },
  };

  return (
    <div>
      <div style={{border:"1.5px solid #E8EAF6",borderRadius:12,padding:"14px 16px",background:"#FAFBFF",marginBottom:16}}>
        <CardElement options={cardStyle} />
      </div>
      {cardError && (
        <div style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#B91C1C",marginBottom:14,fontWeight:600}}>
          <div style={{marginBottom:8}}>❌ {cardError}</div>
          <div style={{fontSize:12,color:"#B91C1C",fontWeight:500}}>{lang==="fr"?"Tu peux réessayer avec une autre carte ci-dessous.":lang==="ar"?"يمكنك المحاولة مرة أخرى ببطاقة أخرى أدناه.":"You can retry with another card below."}</div>
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#9CA3AF",marginBottom:16,fontWeight:600}}>
        🔒 Secured by Stripe · SSL encrypted · PCI compliant
      </div>
      <button className="submit-btn" onClick={handlePay} disabled={paying || !stripe}>
        {paying ? "⏳ Processing..." : t.payment.payBtn}
      </button>
      <div style={{textAlign:"center",marginTop:"1rem"}}>
        <button className="btn-ghost" onClick={onBack}>← Back to offers</button>
      </div>
    </div>
  );
}

function PaymentScreen({ bid, booking, form, country, lang, onSuccess, onBack }) {
  const t = T[lang] || T.en;
  const lessonPrice = bid?.net_price_aed || 0;
  const studentFee = Math.round(lessonPrice * STUDENT_FEE);
  const studentTotal = lessonPrice + studentFee;
  const teacherPayout = Math.round(lessonPrice * (1 - TEACHER_FEE));

  return (
    <div className="payment-screen">
      <div className="page-title">{t.payment.title}</div>
      <div className="page-sub">{t.payment.sub}</div>
      <div className="payment-card">
        <div className="payment-row"><span style={{color:"#6B7280"}}>{t.payment.lessonPrice}</span><span style={{fontWeight:700}}>{fmtPrice(lessonPrice,country)}</span></div>
        <div className="payment-row"><span style={{color:"#6B7280"}}>{t.payment.serviceFee}</span><span style={{fontWeight:700,color:"#9CA3AF"}}>+ {fmtPrice(studentFee,country)}</span></div>
        <div className="payment-row" style={{borderTop:"2px solid #E8EAF6",paddingTop:12,marginTop:4}}>
          <span style={{fontWeight:800,color:"#1A1A2E",fontSize:16}}>{t.payment.total}</span>
          <span className="payment-total">{fmtPrice(studentTotal,country)}</span>
        </div>
      </div>
      <div style={{background:"#FAFBFF",border:"1.5px solid #E8EAF6",borderRadius:14,padding:"1rem",marginBottom:"1.25rem",fontSize:13}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#6B7280"}}>{t.payment.teacherReceives}</span><span style={{fontWeight:700,color:"#0ABFA3"}}>{fmtPrice(teacherPayout,country)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#6B7280"}}>{t.payment.platformFee}</span><span style={{fontWeight:700,color:"#9CA3AF"}}>{fmtPrice(studentFee+(lessonPrice-teacherPayout),country)}</span></div>
      </div>
      <div className="payment-note">⚠️ {t.payment.payNote}</div>
      <Elements stripe={stripePromise}>
        <CheckoutForm
          booking={booking}
          totalAmount={studentTotal}
          onSuccess={() => onSuccess({ lessonPrice, studentFee, studentTotal, teacherPayout })}
          onBack={onBack}
          lang={lang}
        />
      </Elements>
    </div>
  );
}

function AdminPage({ user, lang, onBack }) {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [adminTab, setAdminTab] = useState<"teachers"|"bookings"|"stats">("teachers");
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState({totalRevenue:0,totalBookings:0,totalStudents:0,totalTeachers:0,pendingBookings:0,completedBookings:0});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadAdminStats = async () => {
    const [{data:bookings},{data:students},{data:allTeachers}] = await Promise.all([
      supabase.from("bookings").select("gross_price_aed,commission_aed,status,created_at,subject,poster_id,teacher_id,teacher:profiles!teacher_id(full_name),student:profiles!poster_id(full_name)").order("created_at",{ascending:false}).limit(50),
      supabase.from("profiles").select("id").eq("role","student"),
      supabase.from("profiles").select("id").eq("role","teacher"),
    ]);
    const completed=(bookings||[]).filter(b=>b.status==="completed");
    const totalRevenue=completed.reduce((s,b)=>s+(b.commission_aed||0),0);
    setAdminStats({
      totalRevenue,
      totalBookings:(bookings||[]).length,
      completedBookings:completed.length,
      pendingBookings:(bookings||[]).filter(b=>b.status==="pending_payment").length,
      totalStudents:(students||[]).length,
      totalTeachers:(allTeachers||[]).length,
    });
    setRecentBookings(bookings||[]);
  };

  const loadTeachers = async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").eq("role", "teacher").order("created_at", { ascending: false });
    if (filter === "pending") query = query.eq("verified", false);
    if (filter === "verified") query = query.eq("verified", true);
    const { data, error } = await query;
    if (error) console.error("AdminPage: failed to load teachers", error);
    setTeachers(data || []);
    setLoading(false);
  };

  useEffect(() => { loadTeachers(); }, [filter]);
  useEffect(() => { if(adminTab==="stats"||adminTab==="bookings") loadAdminStats(); }, [adminTab]);

  const notify = async (payload) => {
    try {
      await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("AdminPage: notification email failed", e);
    }
  };

  const handleVerify = async (teacher) => {
    const { error } = await supabase.from("profiles").update({ verified: true }).eq("id", teacher.id);
    if (error) { console.error("AdminPage: verify failed", error); alert("❌ " + error.message); return; }
    if (teacher.email) notify({ type: "teacher_verified", teacherEmail: teacher.email, teacherName: teacher.full_name });
    loadTeachers();
    alert(`✅ ${teacher.full_name || "Teacher"} vérifié !`);
  };

  const handleReject = (teacher) => { setRejectTarget(teacher); setRejectReason(""); };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const { error } = await supabase.from("profiles").update({ verified: false, role: "rejected" }).eq("id", rejectTarget.id);
    if (error) { alert("❌ " + error.message); return; }
    if (rejectTarget.email) {
      await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "teacher_rejected", teacherEmail: rejectTarget.email, teacherName: rejectTarget.full_name, reason: rejectReason }),
      }).catch(()=>{});
    }
    setRejectTarget(null); setRejectReason(""); loadTeachers();
    alert(`❌ ${rejectTarget.full_name || "Profil"} refusé — email envoyé.`);
  };

  return (
    <div style={{maxWidth:900, margin:"0 auto", padding:"2rem"}}>
      <div style={{display:"flex", alignItems:"center", gap:16, marginBottom:"1.5rem"}}>
        <button onClick={onBack} className="btn-ghost">← Retour</button>
        <div>
          <div className="page-title">⚙️ Interface Admin</div>
          <div className="page-sub" style={{marginBottom:0}}>TutorApp Gulf</div>
        </div>
      </div>

      {/* Onglets admin */}
      <div style={{display:"flex",gap:8,marginBottom:"1.5rem",borderBottom:"2px solid #E2E8F0",paddingBottom:0}}>
        {([["teachers","👨‍🏫 Enseignants"],["bookings","📋 Bookings"],["stats","📊 Revenus"]] as [string,string][]).map(([k,v])=>(
          <button key={k} onClick={()=>setAdminTab(k as any)} style={{padding:"10px 18px",fontWeight:700,fontSize:13,border:"none",background:"none",cursor:"pointer",borderBottom:adminTab===k?"3px solid #5B4FE8":"3px solid transparent",color:adminTab===k?"#5B4FE8":"#6B7280",marginBottom:-2}}>{v}</button>
        ))}
      </div>

      {/* TAB: STATS */}
      {adminTab==="stats"&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:"1.5rem"}}>
          <div className="stat-card"><div className="stat-val" style={{color:"#5B4FE8"}}>{adminStats.totalRevenue} AED</div><div className="stat-lbl">💰 Revenus plateforme</div></div>
          <div className="stat-card"><div className="stat-val">{adminStats.completedBookings}</div><div className="stat-lbl">✅ Cours terminés</div></div>
          <div className="stat-card"><div className="stat-val" style={{color:"#F59E0B"}}>{adminStats.pendingBookings}</div><div className="stat-lbl">⏳ En cours</div></div>
          <div className="stat-card"><div className="stat-val">{adminStats.totalStudents}</div><div className="stat-lbl">👨‍🎓 Élèves</div></div>
          <div className="stat-card"><div className="stat-val">{adminStats.totalTeachers}</div><div className="stat-lbl">👨‍🏫 Enseignants</div></div>
          <div className="stat-card"><div className="stat-val">{adminStats.totalBookings}</div><div className="stat-lbl">📋 Total bookings</div></div>
        </div>
      </>}

      {/* TAB: BOOKINGS */}
      {adminTab==="bookings"&&<>
        <div style={{marginBottom:"1rem",fontWeight:700,color:"#374151"}}>50 derniers bookings</div>
        {recentBookings.map(b=>(
          <div key={b.id} style={{border:"1.5px solid #E2E8F0",borderRadius:14,padding:"1rem",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontWeight:800,fontSize:14}}>{b.subject||"—"}</div>
              <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>
                👨‍🎓 {b.student?.full_name||"?"} → 👨‍🏫 {b.teacher?.full_name||"?"}
              </div>
              <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{new Date(b.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>
            </div>
            <div style={{textAlign:"end"}}>
              <div style={{fontFamily:"Fraunces,serif",fontSize:16,fontWeight:900,color:"#5B4FE8"}}>{b.gross_price_aed} AED</div>
              <div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>+{b.commission_aed||0} AED comm.</div>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:20,background:b.status==="completed"?"#DCFCE7":b.status==="pending_payment"?"#FEF3C7":"#F3F4F6",color:b.status==="completed"?"#166534":b.status==="pending_payment"?"#92400E":"#6B7280",marginTop:4,display:"inline-block"}}>
                {b.status==="completed"?"✅ Terminé":b.status==="pending_payment"?"⏳ En cours":b.status==="cancelled"?"❌ Annulé":b.status}
              </span>
            </div>
          </div>
        ))}
        {recentBookings.length===0&&<div className="empty"><div className="empty-icon">📋</div><div style={{fontWeight:700}}>Aucun booking</div></div>}
      </>}

      {/* TAB: ENSEIGNANTS */}
      {adminTab==="teachers"&&<>
      <div style={{display:"flex", gap:10, marginBottom:"1.5rem"}}>
        {[["pending","⏳ En attente"],["verified","✅ Vérifiés"],["all","Tous"]].map(([k,v]) => (
          <div key={k} className={`chip${filter===k?" selected":""}`} onClick={() => setFilter(k)}>{v}</div>
        ))}
      </div>

      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:"1.5rem"}}>
        <div className="stat-card"><div className="stat-val" style={{color:"#E24B4A"}}>{teachers.filter(t => !t.verified).length}</div><div className="stat-lbl">En attente</div></div>
        <div className="stat-card"><div className="stat-val">{teachers.filter(t => t.verified).length}</div><div className="stat-lbl">Vérifiés</div></div>
        <div className="stat-card"><div className="stat-val">{teachers.length}</div><div className="stat-lbl">Total enseignants</div></div>
      </div>

      {loading && <div className="loading-spinner">⏳ Chargement...</div>}

      {!loading && teachers.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">👨‍🏫</div>
          <div style={{fontWeight:700}}>Aucun enseignant {filter === "pending" ? "en attente" : ""}</div>
        </div>
      )}

      {rejectTarget&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.6)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
          <div style={{background:"#fff",borderRadius:20,padding:"2rem",maxWidth:440,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.2)"}}>
            <div style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,marginBottom:4}}>❌ Refuser {rejectTarget.full_name} ?</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:"1rem"}}>Le prof recevra un email avec le motif. Il ne pourra plus apparaître sur la plateforme.</div>
            <label style={{fontSize:13,fontWeight:700,color:"#374151",display:"block",marginBottom:6}}>Motif du refus <span style={{color:"#9CA3AF",fontWeight:400}}>(optionnel mais recommandé)</span></label>
            <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Ex : Documents illisibles, diplôme non conforme, profil incomplet..." style={{width:"100%",border:"1.5px solid #E2E8F0",borderRadius:10,padding:"10px 12px",fontSize:13,fontFamily:"inherit",resize:"vertical",minHeight:80,boxSizing:"border-box",marginBottom:"1.25rem"}}/>
            <div style={{display:"flex",gap:10}}>
              <button className="btn-ghost" style={{flex:1}} onClick={()=>{setRejectTarget(null);setRejectReason("");}}>Annuler</button>
              <button style={{flex:1,background:"#DC2626",color:"#fff",border:"none",borderRadius:12,padding:"12px",fontWeight:800,fontSize:14,cursor:"pointer"}} onClick={confirmReject}>Confirmer le refus</button>
            </div>
          </div>
        </div>
      )}

      {!loading && teachers.map((teacher,_ti) => (
        <div key={teacher.id} className="req-card" style={{marginBottom:16}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12}}>
            <div style={{flex:1}}>
              <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
                <div style={{width:44, height:44, borderRadius:"50%", background:"#EEF0FF", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:16, color:"#5B4FE8", flexShrink:0}}>
                  {(teacher.full_name||"?").split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)}
                </div>
                <div>
                  <div style={{fontWeight:800, fontSize:16}}>{teacher.full_name || "Sans nom"}</div>
                  <div style={{fontSize:12, color:"#6B7280"}}>{teacher.email || teacher.id}</div>
                </div>
                {teacher.verified ? <span className="badge badge-green">✅ Vérifié</span> : <span className="badge badge-amber">⏳ En attente</span>}
              </div>

              {teacher.teaching_subjects?.length > 0 && (
                <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:8}}>
                  {teacher.teaching_subjects.map(s => <span key={s} className="badge badge-purple">{s}</span>)}
                </div>
              )}

              <div style={{display:"flex", flexWrap:"wrap", gap:8, fontSize:12, color:"#6B7280", fontWeight:600}}>
                {teacher.teaching_cycles?.length > 0 && <span>📚 {teacher.teaching_cycles.join(", ")}</span>}
                {teacher.teaching_langs?.length > 0 && <span>🗣 {teacher.teaching_langs.join(", ")}</span>}
                {teacher.teaching_rate && <span>💰 {teacher.teaching_rate} AED/h</span>}
                {teacher.country_code && <span>📍 {teacher.country_code}</span>}
              </div>

              {teacher.bank_iban && (
                <div style={{marginTop:8, fontSize:12, color:"#6B7280", fontWeight:600}}>
                  🏦 {teacher.bank_name} · ****{teacher.bank_iban.slice(-4)} · {teacher.bank_holder}
                </div>
              )}

              {teacher.teaching_bio && (
                <div style={{marginTop:8, fontSize:13, color:"#374151", fontStyle:"italic", background:"#FAFBFF", borderRadius:8, padding:"8px 12px"}}>
                  "{teacher.teaching_bio}"
                </div>
              )}
              {(teacher.id_doc_url||teacher.diploma_url)&&(
                <div style={{marginTop:10,display:"flex",gap:10,flexWrap:"wrap"}}>
                  {teacher.id_doc_url&&<a href={teacher.id_doc_url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,fontWeight:700,color:"#5B4FE8",background:"#EEF2FF",padding:"5px 12px",borderRadius:8,textDecoration:"none"}}>🪪 Voir pièce d'identité</a>}
                  {teacher.diploma_url&&<a href={teacher.diploma_url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,fontWeight:700,color:"#0F766E",background:"#ECFDF5",padding:"5px 12px",borderRadius:8,textDecoration:"none"}}>📜 Voir diplôme</a>}
                </div>
              )}
            </div>

            {!teacher.verified && (
              <div style={{display:"flex", flexDirection:"column", gap:8, flexShrink:0}}>
                <button className="btn-teal" onClick={() => handleVerify(teacher)} style={{padding:"10px 20px", fontSize:13}}>✅ Valider</button>
                <button className="btn-ghost" onClick={() => handleReject(teacher)} style={{color:"#EF4444", borderColor:"#EF4444"}}>❌ Refuser</button>
              </div>
            )}
          </div>
        </div>
      ))}
      </>}
    </div>
  );
}

function StudentHistory({ userId, lang, onBookAgain }: { userId: string, lang: string, onBookAgain?: (subject: string, teacherName: string) => void }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(()=>{
    if(!userId) return;
    supabase.from("bookings")
      .select("*, teacher:profiles!teacher_id(full_name)")
      .eq("poster_id", userId)
      .order("created_at", {ascending:false})
      .then(({data})=>{
        setBookings(data||[]);
        const spent = (data||[]).filter(b=>b.status==="completed").reduce((s,b)=>s+(b.gross_price_aed||0),0);
        setTotalSpent(spent);
        setLoading(false);
      });
  },[userId]);

  if(loading) return <div className="loading">⏳ {lang==="fr"?"Chargement...":lang==="ar"?"جار التحميل...":"Loading..."}</div>;

  return (
    <div>
      {totalSpent > 0 && (
        <div style={{background:"#EEF2FF",border:"1.5px solid #D8DBFE",borderRadius:14,padding:"1rem",marginBottom:"1.5rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontWeight:700,color:"#5B4FE8"}}>{lang==="fr"?"Total dépensé":lang==="ar"?"إجمالي المصروف":"Total spent"}</span>
          <span style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,color:"#5B4FE8"}}>{totalSpent} AED</span>
        </div>
      )}
      {bookings.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📚</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{lang==="fr"?"Aucun cours pour l'instant":lang==="ar"?"لا توجد دروس بعد":"No lessons yet"}</div>
          <div style={{fontSize:13,color:"#9CA3AF"}}>{lang==="fr"?"Poste ta première annonce pour trouver un prof":lang==="ar"?"انشر إعلانك الأول للعثور على مدرس":"Post your first request to find a tutor"}</div>
        </div>
      )}
      {bookings.map((b,i)=>(
        <div key={b.id||i} style={{border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>

            <div>
              <div style={{fontWeight:800,fontSize:15}}>{b.subject||"Cours"}</div>
              <div style={{fontSize:13,color:"#64748B",marginTop:3}}>{b.teacher?.full_name}</div>
              <div style={{fontSize:11,color:"#9CA3AF",fontWeight:600,marginTop:3}}>{new Date(b.created_at).toLocaleDateString(lang==="ar"?"ar-AE":lang==="fr"?"fr-FR":"en-AE",{day:"numeric",month:"long",year:"numeric"})}</div>
            </div>
            <div style={{textAlign:"end"}}>
              <div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900,color:"#5B4FE8"}}>{b.gross_price_aed} AED</div>
              <span className={`badge ${b.status==="completed"?"badge-green":b.status==="pending_payment"?"badge-amber":"badge-gray"}`} style={{marginTop:4,display:"inline-flex"}}>
                {b.status==="completed"?(lang==="fr"?"✅ Confirmé":lang==="ar"?"✅ مكتمل":"✅ Done"):b.status==="pending_payment"?(lang==="fr"?"⏳ En attente":lang==="ar"?"⏳ في الانتظار":"⏳ Pending"):b.status}
              </span>
            </div>
          </div>
          {b.status==="completed"&&onBookAgain&&(
            <button className="btn-teal" style={{width:"100%",padding:"8px",fontSize:13,marginTop:8}} onClick={()=>onBookAgain(b.subject||"",b.teacher?.full_name||"")}>
              🔄 {lang==="fr"?`Reprendre avec ${b.teacher?.full_name}`:lang==="ar"?`الاستمرار مع ${b.teacher?.full_name}`:`Book again with ${b.teacher?.full_name}`}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function TeacherHistory({ userId, lang }: { userId: string, lang: string }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    if(!userId) return;
    supabase.from("bookings")
      .select("*, student:profiles!poster_id(full_name), request:requests!request_id(subject)")
      .eq("teacher_id", userId)
      .order("created_at", {ascending:false})
      .then(({data})=>{ setBookings(data||[]); setLoading(false); });
  },[userId]);

  if(loading) return <div className="loading">⏳ {lang==="fr"?"Chargement...":lang==="ar"?"جار التحميل...":"Loading..."}</div>;

  const completed = bookings.filter(b=>b.status==="completed");
  const totalEarned = completed.reduce((s,b)=>s+Math.round((b.net_price_aed||0)*0.94),0);

  return (
    <div>
      {totalEarned>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:"1.5rem"}}>
          <div className="stat-card"><div className="stat-val" style={{color:"#0ABFA3"}}>{totalEarned} AED</div><div className="stat-lbl">{lang==="fr"?"Total gagné":lang==="ar"?"إجمالي الأرباح":"Total earned"}</div></div>
          <div className="stat-card"><div className="stat-val">{completed.length}</div><div className="stat-lbl">{lang==="fr"?"Cours effectués":lang==="ar"?"الحصص المكتملة":"Lessons done"}</div></div>
        </div>
      )}
      {bookings.length===0&&(
        <div className="empty">
          <div className="empty-icon">🎓</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{lang==="fr"?"Aucun cours pour l'instant":lang==="ar"?"لا توجد حصص بعد":"No lessons yet"}</div>
          <div style={{fontSize:13,color:"#9CA3AF"}}>{lang==="fr"?"Réponds aux annonces pour commencer":lang==="ar"?"ابدأ بالرد على الطلبات":"Start by replying to student requests"}</div>
        </div>
      )}
      {bookings.map((b,i)=>{
        const subject=b.request?.subject||b.subject||"Cours";
        const netEarned=Math.round((b.net_price_aed||0)*0.94);
        const dateStr=new Date(b.created_at).toLocaleDateString(lang==="ar"?"ar-AE":lang==="fr"?"fr-FR":"en-AE",{day:"numeric",month:"long",year:"numeric"});
        return(
          <div key={b.id||i} style={{border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:15}}>{subject}</div>
                <div style={{fontSize:13,color:"#64748B",marginTop:3}}>👤 {b.student?.full_name||"—"}</div>
                <div style={{fontSize:11,color:"#9CA3AF",fontWeight:600,marginTop:3}}>{dateStr}</div>
              </div>
              <div style={{textAlign:"end"}}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:900,color:"#0ABFA3"}}>+{netEarned} AED</div>
                <span className={`badge ${b.status==="completed"?"badge-green":b.status==="pending_payment"?"badge-amber":"badge-gray"}`} style={{marginTop:4,display:"inline-flex"}}>
                  {b.status==="completed"?(lang==="fr"?"✅ Payé":lang==="ar"?"✅ مدفوع":"✅ Paid"):b.status==="pending_payment"?(lang==="fr"?"⏳ En attente":lang==="ar"?"⏳ معلّق":"⏳ Pending"):b.status}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TESTIMONIALS = [
  { name: "Layla M.", text: { fr: "Prof trouvé en 7 minutes pour l'exam de demain !", en: "Found a tutor in 7 minutes for tomorrow's exam!", ar: "وجدت مدرساً في 7 دقائق للامتحان غداً!" }, stars: 5 },
  { name: "Ahmed K.", text: { fr: "Ma fille a eu 18/20 après 3 cours avec Sarah.", en: "My daughter got 18/20 after 3 lessons with Sarah.", ar: "حصلت ابنتي على 18/20 بعد 3 حصص مع سارة." }, stars: 5 },
  { name: "Sophie L.", text: { fr: "Beaucoup plus simple que de chercher sur Google !", en: "Way easier than searching on Google!", ar: "أسهل بكثير من البحث على غوغل!" }, stars: 5 },
  { name: "Fatima R.", text: { fr: "Le prof était parfait et le paiement après le cours c'est top.", en: "The tutor was perfect and paying after the lesson is great.", ar: "المدرس كان رائعاً والدفع بعد الحصة ممتاز." }, stars: 5 },
];

export default function TutorApp() {
  const [lang,setLang]=useState("en");
  const [country]=useState("UAE");
  const [page,setPage]=useState("home");
  const [appTab,setAppTab]=useState("student-home");
  const [teacherState,setTeacherState]=useState<"idle"|"has_requests"|"offer_sent"|"booked"|"pending_payment">("idle");
  const [toast,setToast]=useState(null);
  const [selectedOffer,setSelectedOffer]=useState(null);
  const [payResult,setPayResult]=useState(null);
  const [showOnboard,setShowOnboard]=useState(false);
  const [curriculum,setCurriculum]=useState("");
  const [user,setUser]=useState(null);
  const [userProfile,setUserProfile]=useState(null);
  const [showAuth,setShowAuth]=useState(false);
  const [currentRequestId,setCurrentRequestId]=useState(null);
  const [realBids,setRealBids]=useState([]);
  const [realRequests,setRealRequests]=useState([]);
  const [bidsLoading,setBidsLoading]=useState(false);
  const [requestsLoading,setRequestsLoading]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [submittingBid,setSubmittingBid]=useState(false);
  const [selectedRate,setSelectedRate]=useState(150);
  const [teacherStats,setTeacherStats]=useState({revenue:0,courses:0,rating:"—"});
  const [form,setForm]=useState({subject:"",instrLang:"",curriculum:"",level:"",cycle:[],duration:"1h",message:""});
  const [teacherForm,setTeacherForm]=useState({name:"",email:"",bio:"",cycles:[],subjects:[],curricula:[],instrLangs:[],rate:150,idFile:null,diplomaFile:null,photoFile:null,withdrawal:"wW",bankName:"",bankIban:"",bankHolder:"",whatsapp:"",cguAccepted:false,childProtectionAccepted:false});
  const [pushSubscribed,setPushSubscribed]=useState(false);
  const [firstOfferJustArrived,setFirstOfferJustArrived]=useState(false);
  const [allRequests,setAllRequests]=useState<any[]>([]);
  const [studentView,setStudentView]=useState<"list"|"form"|"detail">("form");
  const [bidForm,setBidForm]=useState({message:""});
  const [selectedRequest,setSelectedRequest]=useState(null);
  const [profileLoading,setProfileLoading]=useState(true);
  const [studentState,setStudentState]=useState<"idle"|"waiting"|"offers"|"payment"|"booked"|"rate"|"post_rate">("idle");
  const [activeRequest,setActiveRequest]=useState(null);
  const [activeBooking,setActiveBooking]=useState(null);
  const [activeOffers,setActiveOffers]=useState([]);
  const [studentStats,setStudentStats]=useState({totalLessons:0,totalSpent:0});
  const [waitingSeconds,setWaitingSeconds]=useState(0);
  const [hoveredStar,setHoveredStar]=useState(0);
  const [stripeError,setStripeError]=useState("");
  const [retryingPayment,setRetryingPayment]=useState(false);
  const [childName,setChildName]=useState("");
  const [childCurriculum,setChildCurriculum]=useState("");
  const [childLevel,setChildLevel]=useState("");
  const [childLang,setChildLang]=useState("");
  const [childSubjects,setChildSubjects]=useState<string[]>([]);
  const [savingChild,setSavingChild]=useState(false);
  const childLevels=childCurriculum&&CURRICULA[childCurriculum]?CURRICULA[childCurriculum].levels[lang]||CURRICULA[childCurriculum].levels.en:[];
  const [teacherActiveBooking,setTeacherActiveBooking]=useState(null);
  const [teacherPendingOffers,setTeacherPendingOffers]=useState([]);
  const [matchedRequests,setMatchedRequests]=useState([]);
  const [teacherRevenue,setTeacherRevenue]=useState({thisMonth:0,total:0,pending:0,courses:0,rating:null});
  const [selectedRequestForBid,setSelectedRequestForBid]=useState(null);
  const [liveStats,setLiveStats]=useState({todayLessons:0,avgResponseMin:12,activeTeachers:0});
  const [requestViews,setRequestViews]=useState(0);
  const [suggestedTeachers,setSuggestedTeachers]=useState<any[]>([]);
  const [currentTestimonial,setCurrentTestimonial]=useState(0);
  const [lastCompletedTeacher,setLastCompletedTeacher]=useState<{name:string,id:string,subject:string}|null>(null);
  const [showStudentOnboard,setShowStudentOnboard]=useState(false);
  const [showCancelConfirm,setShowCancelConfirm]=useState(false);
  const [activePack,setActivePack]=useState<any>(null);
  const [showPackModal,setShowPackModal]=useState(false);
  const [showCancelPackConfirm,setShowCancelPackConfirm]=useState(false);
  const [packCreating,setPackCreating]=useState(false);
  const [cancellingBooking,setCancellingBooking]=useState(false);
  const [showRecurringModal,setShowRecurringModal]=useState(false);
  const [recurringSetup,setRecurringSetup]=useState<"weekly"|"biweekly"|null>(null);
  const [bidSlots,setBidSlots]=useState(["",""]);
  const [selectedSlot,setSelectedSlot]=useState<Record<string,string>>({});
  const [chatMessages,setChatMessages]=useState<any[]>([]);
  const [chatInput,setChatInput]=useState("");
  const [showChat,setShowChat]=useState(false);
  const [sendingMsg,setSendingMsg]=useState(false);
  const [showVideoCall,setShowVideoCall]=useState(false);
  const [videoCallUrl,setVideoCallUrl]=useState<string|null>(null);
  const [onboardStep,setOnboardStep]=useState(1);
  const [teacherOnboardStep,setTeacherOnboardStep]=useState(1);
  const [expandedOffer,setExpandedOffer]=useState<string|null>(null);
  const [reviewComment,setReviewComment]=useState("");
  const [offerRatings,setOfferRatings]=useState<Record<string,{avg:string,count:number}>>({});
  const [relanceSent,setRelanceSent]=useState(false);
  const [showReportModal,setShowReportModal]=useState(false);
  const [reportMessage,setReportMessage]=useState("");
  const [landingStats,setLandingStats]=useState({teachers:0,lessons:0,rating:"4.9"});
  const [realTeachers,setRealTeachers]=useState([]);
  const [teachersLoading,setTeachersLoading]=useState(false);
  const [teachersSearch,setTeachersSearch]=useState("");
  const [teachersSubjectFilter,setTeachersSubjectFilter]=useState("");
  const [teachersLangFilter,setTeachersLangFilter]=useState("");
  const [selectedTeacherProfile,setSelectedTeacherProfile]=useState(null);
  const [teacherProfileReviews,setTeacherProfileReviews]=useState([]);

  // ✅ FIX DÉFINITIF : toujours charger avec l'ID auth réel
  const loadProfile = async (userId: string) => {
    setProfileLoading(true);
    try {
      // On récupère TOUJOURS l'ID auth réel depuis Supabase
      const { data: authData } = await supabase.auth.getUser();
      const realUserId = authData?.user?.id || userId;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", realUserId)
        .maybeSingle();

      if (profileError) console.error("loadProfile: failed to fetch profile", profileError);
      if (profile) {
        setUserProfile(profile);
        if (profile.role === "teacher") {
          setTeacherForm(f => ({
            ...f,
            name: profile.full_name || "",
            email: authData?.user?.email || "",
            bio: profile.teaching_bio || "",
            cycles: profile.teaching_cycles || [],
            subjects: profile.teaching_subjects || [],
            instrLangs: profile.teaching_langs || [],
            rate: profile.teaching_rate || 150,
            curricula: profile.teaching_curricula || [],
            bankName: profile.bank_name || "",
            bankIban: profile.bank_iban || "",
            bankHolder: profile.bank_holder || "",
            withdrawal: profile.withdrawal_frequency || "wW",
          }));

          const requests = await getMatchedRequests(profile);
          setMatchedRequests(requests);

          const { data: pendingBids } = await supabase
            .from("bids")
            .select("*, request:requests(subject, level, duration_min, created_at)")
            .eq("teacher_id", realUserId)
            .eq("status", "pending");

          if (pendingBids?.length > 0) {
            setTeacherPendingOffers(pendingBids);
            setTeacherState("offer_sent");
          } else if (requests.length > 0) {
            setTeacherState("has_requests");
          }

          const { data: activeBookingData } = await supabase
            .from("bookings")
            .select("*, student:profiles!poster_id(full_name)")
            .eq("teacher_id", realUserId)
            .in("status", ["pending_payment", "confirmed"])
            .limit(1)
            .maybeSingle();

          if (activeBookingData) {
            setTeacherActiveBooking(activeBookingData);
            setTeacherState(activeBookingData.status === "completed" ? "pending_payment" : "booked");
          }

          const revenue = await getTeacherRevenueStats(realUserId);
          setTeacherRevenue(revenue);

          setPage("app");
          setAppTab("teacher-home");
          if (!profile?.bank_iban) openTeacherOnboard();
          setProfileLoading(false);
          return profile;
        }
      } else console.warn("loadProfile: no profile row found for id", realUserId);

      const { data: studentProf } = await supabase
        .from("student_profiles")
        .select("*")
        .eq("owner_id", realUserId)
        .limit(1)
        .maybeSingle();

      if (studentProf) {
        const instrLangMap = { en: T.en.instrLangs[0], ar: T.ar.instrLangs[0], fr: T.fr.instrLangs[0] };
        setForm(f => ({
          ...f,
          curriculum: studentProf.curriculum || "",
          instrLang: instrLangMap[studentProf.default_lang] || "",
          level: studentProf.level || ""
        }));
        if (studentProf.curriculum) setCurriculum(studentProf.curriculum);
      }

      if (profile?.role === "student") {
        setPage("app");setAppTab("student-home");
        if(!profile?.child_curriculum&&!profile?.child_name){setShowStudentOnboard(true);setOnboardStep(1);}
        const {data:completedBookings}=await supabase.from("bookings").select("gross_price_aed").eq("poster_id",realUserId).eq("status","completed");
        setStudentStats({totalLessons:completedBookings?.length||0,totalSpent:completedBookings?.reduce((s,b)=>s+b.gross_price_aed,0)||0});
        const {count:todayCount}=await supabase.from("bookings").select("*",{count:"exact",head:true}).eq("status","completed").gte("created_at",new Date(new Date().setHours(0,0,0,0)).toISOString());
        const {count:teacherCount}=await supabase.from("profiles").select("*",{count:"exact",head:true}).eq("role","teacher").eq("verified",true);
        setLiveStats({todayLessons:todayCount||0,avgResponseMin:12,activeTeachers:teacherCount||0});
        setChildName(profile.child_name||"");setChildCurriculum(profile.child_curriculum||"");
        setChildLevel(profile.child_level||"");setChildLang(profile.child_lang||"");
        setChildSubjects(profile.child_subjects||[]);
        if(profile.child_level)setForm(f=>({...f,level:profile.child_level}));
        const {data:sp}=await supabase.from("student_profiles").select("*").eq("owner_id",realUserId).limit(1).maybeSingle();
        const prefCurriculum=profile.child_curriculum||sp?.curriculum||"";
        const prefLevel=profile.child_level||sp?.level||"";
        const ilMap={en:T.en.instrLangs[0],ar:T.ar.instrLangs[0],fr:T.fr.instrLangs[0]};
        const prefLang=profile.child_lang||(sp?ilMap[sp.default_lang]:"")||"";
        if(prefCurriculum||prefLevel||prefLang){setForm(f=>({...f,curriculum:prefCurriculum,level:prefLevel,instrLang:prefLang}));if(prefCurriculum)setCurriculum(prefCurriculum);}
        const all=await loadAllStudentRequests(realUserId);
        if(all.length>0){setStudentView("list");}
        else{setStudentView("form");}
      }

      setProfileLoading(false);
      return profile;
    } catch (e) {
      console.error("loadProfile: unexpected error", e);
      setProfileLoading(false);
      return null;
    }
  };

  useEffect(()=>{
    supabase.auth.getSession().then(async ({data:{session}})=>{
      if (session?.user) {
        setUser(session.user);
        const profile = await loadProfile(session.user.id);
        if (profile?.role !== "teacher") {
          if (profile?.role === "student") {
            setPage("app"); setAppTab("student-home");
          }
        }
      } else {
        setProfileLoading(false);
      }
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user??null);
      if(!session?.user){setUserProfile(null);setPage("home");setProfileLoading(false);}
    });
    // Load real landing stats for non-logged-in visitors
    (async()=>{
      const [{count:tc},{count:lc},{data:revs}]=await Promise.all([
        supabase.from("profiles").select("*",{count:"exact",head:true}).eq("role","teacher").eq("verified",true),
        supabase.from("bookings").select("*",{count:"exact",head:true}).eq("status","completed"),
        supabase.from("reviews").select("score"),
      ]);
      const avg=revs?.length?(revs.reduce((s,r)=>s+r.score,0)/revs.length).toFixed(1):"4.9";
      setLandingStats({teachers:tc||0,lessons:lc||0,rating:avg});
    })();
    return ()=>subscription.unsubscribe();
  },[]);


  useEffect(()=>{
    if(studentState!=="waiting"){setWaitingSeconds(0);return;}
    const timer=setInterval(()=>setWaitingSeconds(prev=>prev+1),1000);
    const testimonialTimer=setInterval(()=>setCurrentTestimonial(prev=>(prev+1)%TESTIMONIALS.length),4000);
    return()=>{clearInterval(timer);clearInterval(testimonialTimer);};
  },[studentState]);

  useEffect(()=>{
    if(!user||userProfile?.role==="teacher") return;
    if(studentState!=="waiting"&&studentState!=="offers") return;
    if(!activeRequest?.id) return;
    let previousCount=activeOffers.length;
    // Realtime subscription on new bids for this request
    const channel=supabase.channel(`bids-${activeRequest.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"bids",filter:`request_id=eq.${activeRequest.id}`},async()=>{
        const offers=await getBidsForRequest(activeRequest.id);
        if(offers.length>previousCount){
          playNotificationSound();
          const newOffer=offers[offers.length-1];
          fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"new_offer_received",studentEmail:user?.email,studentName:userProfile?.full_name||user?.email?.split("@")[0],teacherName:newOffer?.teacher?.full_name,netPrice:newOffer?.net_price_aed,subject:activeRequest?.subject,lang})}).catch(()=>{});
          previousCount=offers.length;
        }
        if(offers.length>0){setActiveOffers(offers);setStudentState("offers");setFirstOfferJustArrived(true);setTimeout(()=>setFirstOfferJustArrived(false),4000);fetchOfferRatings(offers);}
      }).subscribe();
    const poll=async()=>{
      try{
        const {data:reqCheck}=await supabase.from("requests").select("status,created_at").eq("id",activeRequest.id).single();
        if(reqCheck){
          const ageHours=(Date.now()-new Date(reqCheck.created_at).getTime())/(1000*60*60);
          if(reqCheck.status!=="open"||ageHours>24){
            setStudentState("idle");setActiveRequest(null);setActiveOffers([]);setWaitingSeconds(0);
            if(ageHours>24)showToast(lang==="fr"?"⏰ Ton annonce a expiré — poste-en une nouvelle !":lang==="ar"?"⏰ انتهت صلاحية إعلانك — انشر إعلاناً جديداً !":"⏰ Your request expired — post a new one!");
            return;
          }
        }
        const {count:viewCount}=await supabase.from("profiles").select("*",{count:"exact",head:true}).eq("role","teacher").eq("verified",true);
        setRequestViews(Math.min(viewCount||0,8));
        const offers=await getBidsForRequest(activeRequest.id);
        if(offers.length>previousCount){
          playNotificationSound();
          const newOffer=offers[offers.length-1];
          fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({type:"new_offer_received",studentEmail:user?.email,studentName:userProfile?.full_name||user?.email?.split("@")[0],teacherName:newOffer?.teacher?.full_name,netPrice:newOffer?.net_price_aed,subject:activeRequest?.subject,lang}),
          }).catch(()=>{});
          previousCount=offers.length;
        }
        if(offers.length>0){
          setActiveOffers(offers);setStudentState("offers");fetchOfferRatings(offers);
          if(!relanceSent&&document.hidden){
            const firstOfferAge=(Date.now()-new Date(offers[0].created_at).getTime())/60000;
            if(firstOfferAge>30){
              setRelanceSent(true);
              fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"offers_reminder",studentEmail:user?.email,studentName:userProfile?.full_name,offerCount:offers.length,subject:activeRequest?.subject,lang})}).catch(()=>{});
            }
          }
        }
      }catch(e){}
    };
    poll();
    const interval=setInterval(poll,30000);
    return()=>{clearInterval(interval);supabase.removeChannel(channel);};
  },[studentState,activeRequest?.id,user,userProfile?.role]);

  useEffect(()=>{
    if(!user||userProfile?.role!=="teacher") return;
    if(teacherState==="pending_payment") return;
    // Realtime: notify teacher instantly when a booking is created for them
    const channel=supabase.channel(`bookings-teacher-${user.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"bookings",filter:`teacher_id=eq.${user.id}`},async(payload)=>{
        const booking=payload.new;
        if(["pending_payment","confirmed"].includes(booking.status)){
          const {data:full}=await supabase.from("bookings").select("*, student:profiles!poster_id(full_name)").eq("id",booking.id).single();
          if(full){setTeacherActiveBooking(full);setTeacherState("booked");playNotificationSound();showToast("🎉 "+(lang==="fr"?"Une famille a accepté ton offre !":"A family accepted your offer!"));}
        }
      }).subscribe();
    const poll=async()=>{
      const requests=await getMatchedRequests(userProfile);
      setMatchedRequests(requests);
      if(requests.length>0&&teacherState==="idle") setTeacherState("has_requests");

      if(teacherState==="offer_sent"){
        const {data:acceptedBooking}=await supabase.from("bookings").select("*, student:profiles!poster_id(full_name)").eq("teacher_id",user.id).in("status",["pending_payment","confirmed"]).limit(1).maybeSingle();
        if(acceptedBooking){setTeacherActiveBooking(acceptedBooking);setTeacherState("booked");showToast("🎉 "+(lang==="fr"?"Une famille a accepté ton offre !":"A family accepted your offer!"));}
      }
      if(teacherState==="booked"&&teacherActiveBooking){
        const {data:booking}=await supabase.from("bookings").select("status").eq("id",teacherActiveBooking.id).single();
        if(booking?.status==="completed"){setTeacherState("pending_payment");const revenue=await getTeacherRevenueStats(user.id);setTeacherRevenue(revenue);showToast("💰 "+(lang==="fr"?"Cours confirmé — paiement en route !":"Lesson confirmed — payment on its way!"));}
      }
    };
    poll();
    const interval=setInterval(poll,30000);
    return()=>{clearInterval(interval);supabase.removeChannel(channel);};
  },[user,userProfile?.role,teacherState,userProfile,teacherActiveBooking]);

  // Realtime messages for active booking
  useEffect(()=>{
    if(!activeBooking?.id||!showChat) return;
    const ch=supabase.channel(`messages-${activeBooking.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`booking_id=eq.${activeBooking.id}`},(payload)=>{
        const msg=payload.new;
        if(msg.sender_id!==user?.id) setChatMessages(prev=>[...prev,msg]);
      }).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[activeBooking?.id,showChat,user?.id]);

  const t=T[lang];
  const isRTL=lang==="ar";
  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),3500);};

  const playNotificationSound=()=>{
    try{
      const ctx=new (window.AudioContext||(window as any).webkitAudioContext)();
      const oscillator=ctx.createOscillator();const gainNode=ctx.createGain();
      oscillator.connect(gainNode);gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(523,ctx.currentTime);
      oscillator.frequency.setValueAtTime(659,ctx.currentTime+0.1);
      oscillator.frequency.setValueAtTime(784,ctx.currentTime+0.2);
      gainNode.gain.setValueAtTime(0.15,ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.5);
      oscillator.start(ctx.currentTime);oscillator.stop(ctx.currentTime+0.5);
    }catch(e){}
  };

  const formatWaitingTime=()=>{
    const minutes=Math.floor(waitingSeconds/60);
    if(minutes<1)return lang==="fr"?"moins d'une minute":lang==="ar"?"أقل من دقيقة":"less than a minute";
    return lang==="fr"?`${minutes} min`:lang==="ar"?`${minutes} دقيقة`:`${minutes} min`;
  };

  const sendConfirmationEmail=async(booking)=>{
    try{
      await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"lesson_confirmed",studentEmail:user?.email,studentName:userProfile?.full_name||user?.email,teacherName:booking?.teacher?.full_name,subject:activeRequest?.subject,amount:booking?.gross_price_aed,bookingId:booking?.id}),
      });
    }catch(e){}
  };

  const saveChildProfile=async()=>{
    if(!user)return;setSavingChild(true);
    try{
      await supabase.from("profiles").update({child_name:childName,child_curriculum:childCurriculum,child_level:childLevel,child_lang:childLang,child_subjects:childSubjects}).eq("id",user.id);
      setUserProfile(p=>({...p,child_name:childName,child_curriculum:childCurriculum,child_level:childLevel,child_lang:childLang,child_subjects:childSubjects}));
      setForm(f=>({...f,curriculum:childCurriculum,level:childLevel,instrLang:childLang}));
      if(childCurriculum)setCurriculum(childCurriculum);
      showToast("✅ "+(lang==="fr"?"Changements bien pris en compte !":lang==="ar"?"تم حفظ التغييرات !":"Changes saved successfully!"));
    }catch(e){showToast("❌ "+e.message);}
    finally{setSavingChild(false);}
  };
  const toggleArr=(arr,val)=>arr.includes(val)?arr.filter(x=>x!==val):[...arr,val];
  const currLevels=curriculum&&CURRICULA[curriculum]?CURRICULA[curriculum].levels[lang]||CURRICULA[curriculum].levels["en"]:[];
  const currentCountry=COUNTRIES.find(c=>c.code===country)||COUNTRIES[0];
  const go=(tab)=>{if(!user){setShowAuth(true);return;}setPage("app");setAppTab(tab);setShowOnboard(false);};

  const loadRealTeachers=async()=>{
    setTeachersLoading(true);
    const {data}=await supabase.from("profiles")
      .select("id,full_name,teaching_bio,teaching_subjects,teaching_langs,teaching_curricula,teaching_rate,teaching_cycles,country_code,verified,teaching_whatsapp,avatar_url")
      .eq("role","teacher").eq("verified",true).order("created_at",{ascending:false});
    const teachers=data||[];
    // fetch avg ratings
    const withRatings=await Promise.all(teachers.map(async t=>{
      const {data:revs}=await supabase.from("reviews").select("score,comment,created_at,student:profiles!student_id(full_name)").eq("teacher_id",t.id).order("created_at",{ascending:false});
      const avg=revs?.length?(revs.reduce((s,r)=>s+r.score,0)/revs.length).toFixed(1):null;
      return{...t,reviews:revs||[],avgRating:avg};
    }));
    setRealTeachers(withRatings);
    setTeachersLoading(false);
  };

  const fetchOfferRatings=async(offers)=>{
    if(!offers?.length) return;
    const ids=[...new Set(offers.map(o=>o.teacher_id).filter(Boolean))];
    const ratings:{[id:string]:{avg:string,count:number}}={};
    await Promise.all(ids.map(async id=>{
      const {data}=await supabase.from("reviews").select("score").eq("teacher_id",id);
      if(data?.length){
        const avg=(data.reduce((s,r)=>s+r.score,0)/data.length).toFixed(1);
        ratings[id]={avg,count:data.length};
      }
    }));
    setOfferRatings(ratings);
  };

  const loadAllStudentRequests=async(userId:string)=>{
    const now=Date.now();
    // Open requests
    const {data:reqs}=await supabase.from("requests").select("*").eq("poster_id",userId).eq("status","open");
    const validReqs=(reqs||[]).filter(r=>(now-new Date(r.created_at).getTime())<24*3600*1000);
    // Active bookings
    const {data:bookings}=await supabase.from("bookings").select("*, teacher:profiles!teacher_id(full_name,teaching_rate,email,avatar_url)").eq("poster_id",userId).in("status",["pending_payment","confirmed"]);
    // Bid counts per request
    const entries=await Promise.all(validReqs.map(async req=>{
      const {data:bids}=await supabase.from("bids").select("*, teacher:profiles!teacher_id(full_name,country_code,teaching_bio,teaching_curricula,teaching_rate,avatar_url)").eq("request_id",req.id).eq("status","pending");
      const booking=(bookings||[]).find(b=>b.request_id===req.id)||null;
      const reqState=booking?"booked":bids?.length>0?"offers":"waiting";
      return {request:req,booking,offers:bids||[],reqState};
    }));
    // Also include booked requests that are no longer "open"
    const bookedOnly=(bookings||[]).filter(b=>!entries.find(e=>e.booking?.id===b.id));
    const bookedEntries=await Promise.all(bookedOnly.map(async b=>{
      const {data:req}=await supabase.from("requests").select("*").eq("id",b.request_id).single();
      return {request:req,booking:b,offers:[],reqState:"booked"};
    }));
    const all=[...entries,...bookedEntries];
    setAllRequests(all);
    return all;
  };

  const openStudentRequest=async(entry:any)=>{
    setActiveRequest(entry.request);
    setActiveBooking(entry.booking||null);
    setActiveOffers(entry.offers||[]);
    if(entry.reqState==="booked") setStudentState("booked");
    else if(entry.reqState==="offers"){setStudentState("offers");if(entry.offers?.length) fetchOfferRatings(entry.offers);}
    else setStudentState("waiting");
    setStudentView("detail");
  };

  const openTeacherProfile=async(teacher)=>{
    setSelectedTeacherProfile(teacher);
    setTeacherProfileReviews(teacher.reviews||[]);
    setPage("teacher-profile");
  };
  const displayName=userProfile?.full_name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"";
  const isProfilePrefilled=!!(form.curriculum&&form.instrLang&&form.level);

  // ✅ FIX : isTeacher calculé SEULEMENT après chargement complet
  const isTeacher = !profileLoading && userProfile?.role === "teacher";

  const handleLogout=async()=>{
    await supabase.auth.signOut();
    setPage("home");setAppTab("student-home");setUser(null);setUserProfile(null);setProfileLoading(false);
    setStudentState("idle");setActiveRequest(null);setActiveBooking(null);setSelectedOffer(null);setActiveOffers([]);setPayResult(null);setWaitingSeconds(0);setHoveredStar(0);setStripeError("");
    showToast("👋 See you soon!");
  };

  const handlePublish=async()=>{
    if(!form.subject||!form.level){showToast("⚠️ "+(lang==="fr"?"Sélectionne une matière et un niveau":lang==="ar"?"اختر مادة ومستوى":"Please select subject and level"));return;}
    setPublishing(true);
    try{
      const dm={"30 min":30,"1h":60,"1h30":90,"2h":120,"2h30":150,"3h":180};
      const req=await postRequest({subject:form.subject,instrLang:form.instrLang||"English",curriculum:form.curriculum||"british",level:form.level,durationMin:dm[form.duration]||60,message:form.message,countryCode:"UAE"});
      const newEntry={request:req,booking:null,offers:[],reqState:"waiting"};
      setAllRequests(prev=>[newEntry,...prev]);
      setActiveRequest(req);setActiveOffers([]);setWaitingSeconds(0);setStudentState("waiting");setStudentView("detail");
      showToast("✅ "+(lang==="fr"?"Annonce publiée !":lang==="ar"?"تم نشر الإعلان !":"Request posted!"));
      // Notify matching teachers via push + fetch their profiles
      supabase.from("profiles")
        .select("id,full_name,bio,photo_url,teaching_subjects,hourly_rate_aed,rating,rating_count,teaching_langs")
        .eq("role","teacher")
        .eq("verified",true)
        .contains("teaching_subjects",[form.subject])
        .limit(6)
        .then(({data:matched})=>{
          setSuggestedTeachers(matched||[]);
          (matched||[]).forEach(t=>{
            sendPushTo(
              t.id,
              lang==="fr"?"📋 Nouvelle demande !":lang==="ar"?"📋 طلب جديد!":"📋 New request!",
              lang==="fr"?`${form.subject} · ${form.level} — Fais une offre maintenant !`:lang==="ar"?`${form.subject} · ${form.level} — قدّم عرضاً الآن!`:`${form.subject} · ${form.level} — Make an offer now!`
            );
          });
        });
    }catch(e){showToast("❌ "+e.message);}
    finally{setPublishing(false);}
  };

  const handleBidSubmit=async()=>{
    if(!bidForm.message){showToast("⚠️ Please write a message");return;}
    if(!selectedRequest?.id){return;}
    setSubmittingBid(true);
    try{
      await submitBid({requestId:selectedRequest.id,netPriceAed:selectedRate,message:bidForm.message});
      showToast("✅ Offer sent!");setBidForm({message:""});setSelectedRequest(null);
      setAppTab("teacher-home");
    }catch(e){showToast("❌ "+e.message);}
    finally{setSubmittingBid(false);}
  };

  const handleAcceptBid=async(bid)=>{
    const slot=selectedSlot[bid.id]||null;
    if(bid.proposed_slots?.length>0&&!slot){
      showToast("⚠️ "+(lang==="fr"?"Choisis un créneau horaire":lang==="ar"?"اختر موعداً":"Please select a time slot"));
      return;
    }
    try{
      const booking=await acceptBid(bid.id,activeRequest.id,slot);
      setSelectedOffer(bid);setActiveBooking(booking);setStripeError("");setStudentState("payment");
      sendPushTo(bid.teacher_id,lang==="fr"?"🎉 Offre acceptée !":lang==="ar"?"🎉 تم قبول عرضك !":"🎉 Offer accepted!",lang==="fr"?`${userProfile?.full_name||"Un élève"} a accepté ton offre — procède au paiement.`:lang==="ar"?`${userProfile?.full_name||"طالب"} قبل عرضك — في انتظار الدفع.`:`${userProfile?.full_name||"A student"} accepted your offer — awaiting payment.`);
    }catch(e){showToast("❌ "+e.message);}
  };

  const loadChatMessages=async(bookingId:string)=>{
    const {data}=await supabase.from("messages").select("*").eq("booking_id",bookingId).order("created_at",{ascending:true});
    setChatMessages(data||[]);
  };

  const sendChatMessage=async()=>{
    if(!chatInput.trim()||!activeBooking?.id) return;
    setSendingMsg(true);
    const content=chatInput.trim();
    const msg={booking_id:activeBooking.id,sender_id:user?.id,sender_name:userProfile?.full_name||"Vous",content};
    const {data}=await supabase.from("messages").insert(msg).select().single();
    if(data) setChatMessages(prev=>[...prev,data]);
    setChatInput("");
    setSendingMsg(false);
    const otherId=user?.id===activeBooking?.poster_id?activeBooking?.teacher_id:activeBooking?.poster_id;
    if(otherId) sendPushTo(otherId,"💬 "+(lang==="fr"?"Nouveau message":lang==="ar"?"رسالة جديدة":"New message"),content);
  };

  const sendPushTo=(userId:string,title:string,body:string)=>{
    fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-push",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({userId,title,body}),
    }).catch(()=>{});
  };

  const subscribeToPush=async()=>{
    if(!("Notification" in window)||!("serviceWorker" in navigator)) return;
    try{
      const permission=await Notification.requestPermission();
      if(permission!=="granted") return;
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:"BLeV-YqFg2WyZ0fid2HXOYHHkaFyhtp8jrff2ax6SergpAZEBXDKs8ZdzCLNxkjRZg32TD_BFJD5yEYcxKRu7JU",
      });
      const {data:{user:u}}=await supabase.auth.getUser();
      if(u){
        await supabase.from("push_subscriptions").upsert({user_id:u.id,subscription:JSON.stringify(sub)},{onConflict:"user_id"});
        setPushSubscribed(true);
      }
    }catch(e){console.error("Push subscribe:",e);}
  };

  const handleSetupRecurring=async(freq:"weekly"|"biweekly")=>{
    setRecurringSetup(freq);
    setShowRecurringModal(false);
    const freqLabel=freq==="weekly"?(lang==="fr"?"hebdomadaires":lang==="ar"?"أسبوعية":"weekly"):(lang==="fr"?"toutes les 2 semaines":lang==="ar"?"كل أسبوعين":"every 2 weeks");
    showToast("🔄 "+(lang==="fr"?`Cours ${freqLabel} activés !`:lang==="ar"?`تم تفعيل الدروس ${freqLabel} !`:`${freq==="weekly"?"Weekly":"Biweekly"} lessons activated!`));
    const body={type:"recurring_setup",freq,teacherEmail:activeBooking?.teacher?.email,teacherName:activeBooking?.teacher?.full_name,studentEmail:user?.email,studentName:userProfile?.full_name||childName,subject:activeRequest?.subject,lang};
    fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).catch(()=>{});
  };

  const handlePaymentSuccess=()=>{
    setStudentState("booked");
    setShowRecurringModal(true);
    showToast("🎉 "+(lang==="fr"?"Réservation confirmée !":lang==="ar"?"تم تأكيد الحجز !":"Booking confirmed!"));
    const jitsiRoom=activeBooking?.id?`TutorApp-${activeBooking.id.slice(-8).toUpperCase()}`:null;
    const jitsiLink=jitsiRoom?`https://meet.jit.si/${jitsiRoom}`:null;
    // Email to student
    fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type:"booking_confirmed",studentEmail:user?.email,studentName:userProfile?.full_name,teacherName:activeBooking?.teacher?.full_name,subject:activeRequest?.subject,jitsiLink,grossPrice:activeBooking?.gross_price_aed,lang}),
    }).catch(()=>{});
    // Email to teacher
    if(activeBooking?.teacher?.email){
      fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"teacher_booking_confirmed",teacherEmail:activeBooking.teacher.email,teacherName:activeBooking.teacher.full_name,studentName:userProfile?.full_name,subject:activeRequest?.subject,jitsiLink,netPrice:activeBooking.net_price_aed,lang}),
      }).catch(()=>{});
    }
  };

  const openTeacherOnboard=()=>{setShowOnboard(true);setTeacherOnboardStep(1);};

  const handleTeacherSubmit=async()=>{
    if(!teacherForm.name||!teacherForm.email||!teacherForm.cycles.length||!teacherForm.subjects.length||!teacherForm.idFile||!teacherForm.diplomaFile||!teacherForm.bankIban||!teacherForm.bankName||!teacherForm.bankHolder){
      showToast("⚠️ Please complete all fields including banking details");return;
    }
    if(!teacherForm.cguAccepted||!teacherForm.childProtectionAccepted){
      showToast("⚠️ Please accept the Terms of Service and Child Protection Charter");return;
    }
    if(user){
      let avatarUrl:string|null=null;
      if(teacherForm.photoFile){
        const ext=(teacherForm.photoFile as File).name.split(".").pop();
        const path=`${user.id}/avatar.${ext}`;
        const {error:upErr}=await supabase.storage.from("avatars").upload(path,teacherForm.photoFile as File,{upsert:true,contentType:(teacherForm.photoFile as File).type});
        if(!upErr){const {data:pub}=supabase.storage.from("avatars").getPublicUrl(path);avatarUrl=pub.publicUrl;}
      }
      let idDocUrl:string|null=null;
      if(teacherForm.idFile){
        const ext=(teacherForm.idFile as File).name.split(".").pop();
        const path=`${user.id}/id_doc.${ext}`;
        await supabase.storage.from("teacher-docs").upload(path,teacherForm.idFile as File,{upsert:true,contentType:(teacherForm.idFile as File).type});
        const {data:pub}=supabase.storage.from("teacher-docs").getPublicUrl(path);
        idDocUrl=pub.publicUrl;
      }
      let diplomaUrl:string|null=null;
      if(teacherForm.diplomaFile){
        const ext=(teacherForm.diplomaFile as File).name.split(".").pop();
        const path=`${user.id}/diploma.${ext}`;
        await supabase.storage.from("teacher-docs").upload(path,teacherForm.diplomaFile as File,{upsert:true,contentType:(teacherForm.diplomaFile as File).type});
        const {data:pub}=supabase.storage.from("teacher-docs").getPublicUrl(path);
        diplomaUrl=pub.publicUrl;
      }
      await supabase.from("profiles").update({
        full_name:teacherForm.name,email:teacherForm.email,withdrawal_frequency:teacherForm.withdrawal,
        bank_name:teacherForm.bankName,bank_iban:teacherForm.bankIban,bank_holder:teacherForm.bankHolder,
        withdrawal_changed_at:new Date().toISOString(),
        teaching_cycles:teacherForm.cycles,teaching_subjects:teacherForm.subjects,
        teaching_langs:teacherForm.instrLangs,teaching_rate:teacherForm.rate,
        teaching_bio:teacherForm.bio||"",teaching_curricula:teacherForm.curricula,
        teaching_whatsapp:teacherForm.whatsapp||null,
        ...(avatarUrl?{avatar_url:avatarUrl}:{}),
        ...(idDocUrl?{id_doc_url:idDocUrl}:{}),
        ...(diplomaUrl?{diploma_url:diplomaUrl}:{}),
      }).eq("id",user.id);

      try{
        await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            type:"new_teacher_pending",
            teacherName:teacherForm.name,
            teacherEmail:teacherForm.email,
            subjects:teacherForm.subjects,
            cycles:teacherForm.cycles,
            rate:teacherForm.rate,
            adminEmail:"pierre.garnier93@gmail.com",
          }),
        });
      }catch(e){console.error("handleTeacherSubmit: admin notification failed",e);}
    }
    setShowOnboard(false);setAppTab("teacher-home");
    showToast("🎉 Profile submitted! We will review within 24h.");
  };

  const handleLoginSuccess=async()=>{
    setShowAuth(false);
    subscribeToPush();
    const {data:{user:u}}=await supabase.auth.getUser();
    if(u){
      setUser(u);
      const profile=await loadProfile(u.id);
      const role=profile?.role||"student";
      const name=profile?.full_name||u.user_metadata?.full_name||u.email?.split("@")[0];
      showToast(`👋 ${t.teacher.hello}, ${name}!`);
      setPage("app");
      if(role==="teacher"){
        setAppTab("teacher-home");
        if(!profile?.bank_iban) openTeacherOnboard();
        const revenue = await getTeacherRevenueStats(u.id);
        setTeacherRevenue(revenue);
        const requests = await getMatchedRequests(profile);
        setMatchedRequests(requests);
        if(requests.length > 0) setTeacherState("has_requests");
      } else {
        setAppTab("student-home");
        const {data:cb}=await supabase.from("bookings").select("gross_price_aed").eq("poster_id",u.id).eq("status","completed");
        setStudentStats({totalLessons:cb?.length||0,totalSpent:cb?.reduce((s,b)=>s+b.gross_price_aed,0)||0});
        if(!profile?.child_curriculum&&!profile?.child_name){setShowStudentOnboard(true);setOnboardStep(1);}
      }
    }
  };

  return (
    <div className={`app-root${isRTL?" rtl":""}`}>
      <style>{css}</style>
      <nav className="nav">
        <div className="nav-logo" onClick={()=>setPage("home")}>TutorApp</div>
        <div className="nav-links">
          {user ? (
            // ✅ FIX NAV : on attend la fin du chargement avant d'afficher
            profileLoading ? null : isTeacher ? (
              <span className="nav-link" onClick={()=>{setPage("app");setAppTab("teacher-home");}}>{t.nav.teach}</span>
            ) : (
              <span className="nav-link" onClick={()=>{setPage("app");setAppTab("student-home");}}>{t.nav.search}</span>
            )
          ) : <>
            <span className="nav-link" onClick={()=>go("student-home")}>{t.nav.search}</span>
            <span className="nav-link" onClick={()=>go("teacher-home")}>{t.nav.teach}</span>
          </>}
          <span className="nav-link" onClick={()=>setPage("teachers")}>{t.nav.teachers}</span>
          {user?.email==="pierre.garnier93@gmail.com" && (
            <span className="nav-link" onClick={()=>setPage("admin")} style={{color:"#E24B4A",fontWeight:900}}>⚙️ Admin</span>
          )}
          <div className="lang-switch">{["en","ar","fr"].map(l=><button key={l} className={`lang-btn${lang===l?" active":""}`} onClick={()=>setLang(l)}>{l.toUpperCase()}</button>)}</div>
        </div>
        {user?(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div className="user-badge" onClick={()=>{setPage("app");setAppTab("profile");}}>👤 {displayName}</div>
            <button className="nav-logout" onClick={handleLogout}>Logout</button>
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
            <button className="btn-big btn-big-primary" onClick={()=>go("student-home")}>{t.hero.cta1}</button>
            <button className="btn-big btn-big-outline" onClick={()=>{if(!user){setShowAuth(true);return;}setPage("app");setAppTab("teacher-home");openTeacherOnboard();}}>{t.hero.cta2}</button>
          </div>
          <div className="hero-stats">{[
            {v:landingStats.teachers>0?`${landingStats.teachers}+`:t.hero.s1v,l:t.hero.s1l},
            {v:t.hero.s2v,l:t.hero.s2l},
            {v:landingStats.rating?`${landingStats.rating}★`:t.hero.s3v,l:t.hero.s3l},
            {v:landingStats.lessons>0?`${landingStats.lessons}+`:t.hero.s4v,l:lang==="fr"?"Cours effectués":lang==="ar"?"دروس مكتملة":"Lessons done"},
          ].map((s,i)=><div key={i} style={{textAlign:"center"}}><div className="hero-stat-val">{s.v}</div><div className="hero-stat-lbl">{s.l}</div></div>)}</div>
        </section>
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",borderBottom:"1.5px solid #E8EAF6",padding:"4rem 0"}}><div className="section" style={{padding:"0 2rem"}}><div className="section-label">{t.how.label}</div><div className="section-title">{t.how.title}<span>{t.how.titleSpan}</span></div><div className="steps-grid">{t.how.steps.map((s,i)=><div className="step-card" key={i}><div className="step-num-bg">{i+1}</div><div className="step-icon">{s.icon}</div><h3>{s.t}</h3><p>{s.d}</p></div>)}</div></div></div>
        <div className="section"><div className="section-label">{t.subjects.label}</div><div className="section-title">{t.subjects.title}<span>{t.subjects.titleSpan}</span></div><div className="subj-grid">{SUBJECTS.map(s=><div className="subj-card" key={s.en} onClick={()=>go("student-home")}><span style={{fontSize:20}}>{s.icon}</span><span>{s[lang]}</span></div>)}</div></div>
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",padding:"4rem 0"}}><div className="section" style={{padding:"0 2rem"}}><div className="section-label">{t.nav.teachers}</div><div className="section-title" style={{marginBottom:"2rem"}}>{lang==="ar"?"جميعهم موثّقون":lang==="fr"?"Tous vérifiés":"All verified, all passionate"}</div><div className="teachers-grid">{TEACHERS.map(tc=><div className="teacher-card" key={tc.name.en} onClick={()=>setPage("teachers")}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}><div className="tc-avatar" style={{background:tc.bg,color:tc.color}}>{tc.initials}</div><div><div style={{fontWeight:800,fontSize:15,color:"#1A1A2E"}}>{tc.name[lang]}</div>{tc.verified&&<div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ Verified</div>}</div></div><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>{tc.subjects.slice(0,2).map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return<span className="pill" key={s}>{subj?subj[lang]:s}</span>;})} {tc.instrLangs.map(l=><span className="pill pill-teal" key={l}>{l}</span>)}</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{fmtPrice(tc.rate,country)}<span style={{fontSize:12,fontWeight:500,color:"#6B7280"}}>/h</span></div><div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>★ {tc.rating} ({tc.reviews})</div></div></div>)}</div></div></div>
      </>}

      {page==="teachers"&&(()=>{
        if(realTeachers.length===0&&!teachersLoading){loadRealTeachers();}
        const filtered=realTeachers.filter(t=>{
          const matchSearch=!teachersSearch||t.full_name?.toLowerCase().includes(teachersSearch.toLowerCase())||(t.teaching_bio||"").toLowerCase().includes(teachersSearch.toLowerCase());
          const matchSubj=!teachersSubjectFilter||t.teaching_subjects?.includes(teachersSubjectFilter);
          const matchLang=!teachersLangFilter||t.teaching_langs?.includes(teachersLangFilter);
          return matchSearch&&matchSubj&&matchLang;
        });
        return(
          <div className="section" style={{maxWidth:1100}}>
            <div style={{marginBottom:"2rem"}}>
              <div className="section-label">{lang==="fr"?"Enseignants vérifiés":lang==="ar"?"المدرسون الموثّقون":"Verified tutors"}</div>
              <div className="section-title">{lang==="fr"?"Nos profs du Golfe":lang==="ar"?"مدرسونا في الخليج":"Our Gulf tutors"}</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:"1.5rem"}}>
                <input placeholder={lang==="fr"?"Rechercher un prof...":lang==="ar"?"ابحث عن مدرس...":"Search a tutor..."} value={teachersSearch} onChange={e=>setTeachersSearch(e.target.value)} style={{flex:2,minWidth:180,padding:"10px 16px",border:"1.5px solid #E2E8F0",borderRadius:12,fontSize:14,fontFamily:"inherit",outline:"none"}} />
                <select value={teachersSubjectFilter} onChange={e=>setTeachersSubjectFilter(e.target.value)} style={{flex:1,minWidth:140,padding:"10px 14px",border:"1.5px solid #E2E8F0",borderRadius:12,fontSize:13,fontFamily:"inherit",background:"#fff"}}>
                  <option value="">{lang==="fr"?"Toutes matières":lang==="ar"?"كل المواد":"All subjects"}</option>
                  {SUBJECTS.map(s=><option key={s.en} value={s.en}>{s[lang]||s.en}</option>)}
                </select>
                <select value={teachersLangFilter} onChange={e=>setTeachersLangFilter(e.target.value)} style={{flex:1,minWidth:130,padding:"10px 14px",border:"1.5px solid #E2E8F0",borderRadius:12,fontSize:13,fontFamily:"inherit",background:"#fff"}}>
                  <option value="">{lang==="fr"?"Toutes langues":lang==="ar"?"كل اللغات":"All languages"}</option>
                  {["English","Arabic","French"].map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            {teachersLoading&&<div className="loading">⏳ {lang==="fr"?"Chargement...":lang==="ar"?"جار التحميل...":"Loading..."}</div>}
            {!teachersLoading&&filtered.length===0&&(
              <div className="empty"><div className="empty-icon">🔍</div><div style={{fontWeight:700}}>{lang==="fr"?"Aucun enseignant trouvé":lang==="ar"?"لا يوجد مدرس":"No tutor found"}</div></div>
            )}
            <div className="teachers-grid">
              {filtered.map(tc=>{
                const initials=(tc.full_name||"T").split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2);
                const bgColors=["#EEF0FF","#E6FAF8","#FEF6E4","#FEE2E2","#F0FDF4"];
                const fgColors=["#5B4FE8","#0ABFA3","#B45309","#B91C1C","#16A34A"];
                const ci=(tc.full_name||"").charCodeAt(0)%5;
                return(
                  <div className="teacher-card" key={tc.id} style={{cursor:"pointer"}} onClick={()=>openTeacherProfile(tc)}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}>
                      {tc.avatar_url
                        ?<img src={tc.avatar_url} alt={tc.full_name} className="tc-avatar" style={{objectFit:"cover"}} />
                        :<div className="tc-avatar" style={{background:bgColors[ci],color:fgColors[ci]}}>{initials}</div>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tc.full_name}</div>
                        <div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ {lang==="fr"?"Vérifié":lang==="ar"?"موثّق":"Verified"}</div>
                      </div>
                      {tc.avgRating&&<div style={{fontSize:13,color:"#F59E0B",fontWeight:800}}>★ {tc.avgRating}</div>}
                    </div>
                    {tc.teaching_bio&&<div style={{fontSize:12,color:"#64748B",marginBottom:10,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{tc.teaching_bio}</div>}
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>
                      {(tc.teaching_subjects||[]).slice(0,3).map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return<span className="pill" key={s}>{subj?subj[lang]:s}</span>;})}
                      {(tc.teaching_langs||[]).map(l=><span className="pill pill-teal" key={l}>{l}</span>)}
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
                      <div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{tc.teaching_rate} AED/h</div>
                      <div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>{tc.reviews?.length||0} {lang==="fr"?"avis":lang==="ar"?"تقييم":"reviews"}</div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button className="submit-btn" style={{marginTop:0,padding:"10px",flex:1}} onClick={e=>{e.stopPropagation();openTeacherProfile(tc);}}>
                        {lang==="fr"?"Voir le profil →":lang==="ar"?"عرض الملف ←":"View profile →"}
                      </button>
                      {tc.teaching_whatsapp&&(
                        <a href={`https://wa.me/${tc.teaching_whatsapp.replace(/\+/,"")}?text=${encodeURIComponent(lang==="fr"?`Bonjour, je vous contacte via TutorApp pour des cours de ${(tc.teaching_subjects||[])[0]||"cours"}.`:lang==="ar"?`مرحباً، أتواصل معك عبر TutorApp لدروس ${(tc.teaching_subjects||[])[0]||""}.`:`Hi, I'm contacting you via TutorApp for ${(tc.teaching_subjects||[])[0]||"tutoring"} lessons.`)}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",justifyContent:"center",background:"#25D366",color:"#fff",borderRadius:12,padding:"10px 14px",fontSize:18,textDecoration:"none",flexShrink:0}}>
                          💬
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {page==="teacher-profile"&&selectedTeacherProfile&&(()=>{
        const tc=selectedTeacherProfile;
        const initials=(tc.full_name||"T").split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2);
        const bgColors=["#EEF0FF","#E6FAF8","#FEF6E4","#FEE2E2","#F0FDF4"];
        const fgColors=["#5B4FE8","#0ABFA3","#B45309","#B91C1C","#16A34A"];
        const ci=(tc.full_name||"").charCodeAt(0)%5;
        const netRate=Math.round((tc.teaching_rate||0)*0.94);
        return(
          <div className="section" style={{maxWidth:680}}>
            <button className="btn-ghost" style={{marginBottom:"1.5rem"}} onClick={()=>setPage("teachers")}>← {lang==="fr"?"Retour":lang==="ar"?"رجوع":"Back"}</button>
            {/* Header */}
            <div style={{background:"linear-gradient(135deg,#5B4FE8 0%,#3D34C4 100%)",borderRadius:24,padding:"2rem",marginBottom:"1.5rem",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
              {tc.avatar_url
                ?<img src={tc.avatar_url} alt={tc.full_name} style={{width:72,height:72,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:"3px solid rgba(255,255,255,.3)"}} />
                :<div style={{width:72,height:72,borderRadius:"50%",background:bgColors[ci],color:fgColors[ci],display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:24,flexShrink:0}}>{initials}</div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,color:"#fff",marginBottom:4}}>{tc.full_name}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.8)",fontWeight:700,marginBottom:8}}>✓ {lang==="fr"?"Enseignant vérifié":lang==="ar"?"مدرس موثّق":"Verified tutor"}</div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {tc.avgRating&&<span style={{background:"rgba(255,255,255,.15)",color:"#fff",borderRadius:20,padding:"4px 12px",fontSize:13,fontWeight:800}}>★ {tc.avgRating} ({tc.reviews?.length} {lang==="fr"?"avis":lang==="ar"?"تقييم":"reviews"})</span>}
                  <span style={{background:"rgba(255,255,255,.15)",color:"#fff",borderRadius:20,padding:"4px 12px",fontSize:13,fontWeight:800}}>{tc.teaching_rate} AED/h</span>
                </div>
              </div>
            </div>
            {/* Bio */}
            {tc.teaching_bio&&(
              <div style={{background:"#F8FAFF",border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:"1.25rem"}}>
                <div style={{fontWeight:800,fontSize:13,color:"#5B4FE8",marginBottom:8}}>💬 {lang==="fr"?"À propos":lang==="ar"?"عن المدرس":"About"}</div>
                <div style={{fontSize:14,color:"#374151",lineHeight:1.7}}>{tc.teaching_bio}</div>
              </div>
            )}
            {/* Info grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1.25rem"}}>
              {tc.teaching_subjects?.length>0&&(
                <div style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:14,padding:"1rem"}}>
                  <div style={{fontWeight:800,fontSize:12,color:"#5B4FE8",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>📚 {lang==="fr"?"Matières":lang==="ar"?"المواد":"Subjects"}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{tc.teaching_subjects.map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return<span className="badge badge-purple" key={s}>{subj?subj[lang]:s}</span>;})}</div>
                </div>
              )}
              {tc.teaching_langs?.length>0&&(
                <div style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:14,padding:"1rem"}}>
                  <div style={{fontWeight:800,fontSize:12,color:"#0ABFA3",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>🗣 {lang==="fr"?"Langues":lang==="ar"?"اللغات":"Languages"}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{tc.teaching_langs.map(l=><span className="badge badge-green" key={l}>{l}</span>)}</div>
                </div>
              )}
              {tc.teaching_curricula?.length>0&&(
                <div style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:14,padding:"1rem"}}>
                  <div style={{fontWeight:800,fontSize:12,color:"#92400E",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>🎓 {lang==="fr"?"Cursus":lang==="ar"?"المناهج":"Curricula"}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{tc.teaching_curricula.map(c=>{const cur=CURRICULA[c];return<span className="badge badge-amber" key={c}>{cur?cur.label[lang]:c}</span>;})}</div>
                </div>
              )}
              <div style={{background:"#ECFDF5",border:"1.5px solid #A7F3D0",borderRadius:14,padding:"1rem"}}>
                <div style={{fontWeight:800,fontSize:12,color:"#0F6E56",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>💰 {lang==="fr"?"Tarif":lang==="ar"?"السعر":"Rate"}</div>
                <div style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,color:"#0ABFA3"}}>{tc.teaching_rate} AED/h</div>
                <div style={{fontSize:11,color:"#64748B",marginTop:4}}>{lang==="fr"?`Tu paies ${tc.teaching_rate} AED → prof reçoit ${netRate} AED`:lang==="ar"?`تدفع ${tc.teaching_rate} AED → يستلم ${netRate} AED`:`You pay ${tc.teaching_rate} AED → tutor gets ${netRate} AED`}</div>
              </div>
            </div>
            {/* CTA */}
            <div style={{display:"flex",gap:10,marginBottom:"2rem",flexWrap:"wrap"}}>
              <button className="btn-full" style={{flex:2,minWidth:200,fontSize:15,marginBottom:0}} onClick={()=>{
                if(!user){setShowAuth(true);return;}
                const firstSubject=tc.teaching_subjects?.[0]||"";
                setForm(f=>({...f,subject:firstSubject}));
                setPage("app");setAppTab("student-home");
                showToast(lang==="fr"?`✅ Annonce pré-remplie pour ${tc.full_name}`:lang==="ar"?`✅ تم تعبئة الطلب لـ ${tc.full_name}`:`✅ Request pre-filled for ${tc.full_name}`);
              }}>📋 {lang==="fr"?"Poster une annonce":lang==="ar"?"نشر إعلان":"Post a request"}</button>
              {tc.teaching_whatsapp&&(
                <a href={`https://wa.me/${tc.teaching_whatsapp.replace(/\+/,"")}?text=${encodeURIComponent(lang==="fr"?`Bonjour ${tc.full_name}, je vous contacte via TutorApp pour des cours de ${(tc.teaching_subjects||[])[0]||"cours"}.`:lang==="ar"?`مرحباً ${tc.full_name}، أتواصل معك عبر TutorApp لدروس ${(tc.teaching_subjects||[])[0]||""}.`:`Hi ${tc.full_name}, I found you on TutorApp and would like to book ${(tc.teaching_subjects||[])[0]||"tutoring"} lessons.`)}`} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#25D366",color:"#fff",borderRadius:14,padding:"12px 20px",fontSize:14,fontWeight:800,textDecoration:"none",flex:1,minWidth:160}}>
                  💬 {lang==="fr"?"WhatsApp":lang==="ar"?"واتساب":"WhatsApp"}
                </a>
              )}
            </div>
            {/* Reviews */}
            {teacherProfileReviews.length>0&&(
              <div>
                <div style={{fontWeight:800,fontSize:16,marginBottom:"1rem"}}>⭐ {lang==="fr"?"Avis":lang==="ar"?"التقييمات":"Reviews"} ({teacherProfileReviews.length})</div>
                {teacherProfileReviews.map((r,i)=>(
                  <div key={i} style={{border:"1.5px solid #E2E8F0",borderRadius:14,padding:"1rem",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{fontWeight:700,fontSize:13}}>{r.student?.full_name||"Famille"}</div>
                      <div style={{fontSize:16}}>{"⭐".repeat(r.score)}</div>
                    </div>
                    {r.comment&&<div style={{fontSize:13,color:"#374151",fontStyle:"italic",lineHeight:1.6}}>"{r.comment}"</div>}
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:6}}>{new Date(r.created_at).toLocaleDateString(lang==="ar"?"ar-AE":lang==="fr"?"fr-FR":"en-AE",{month:"long",year:"numeric"})}</div>
                  </div>
                ))}
              </div>
            )}
            {teacherProfileReviews.length===0&&(
              <div style={{textAlign:"center",padding:"2rem",color:"#9CA3AF",fontSize:14}}>
                {lang==="fr"?"Pas encore d'avis.":lang==="ar"?"لا توجد تقييمات بعد.":"No reviews yet."}
              </div>
            )}
          </div>
        );
      })()}

      {page==="admin"&&user?.email==="pierre.garnier93@gmail.com"&&<AdminPage user={user} lang={lang} onBack={()=>setPage("home")} />}
      {page==="admin"&&user?.email!=="pierre.garnier93@gmail.com"&&<div style={{textAlign:"center",padding:"4rem 2rem",fontWeight:800,fontSize:18,color:"#EF4444"}}>⛔ Accès refusé</div>}

      {page==="app"&&<div className="section"><div className="app-container">
        <div className="app-topbar"><div className="app-dot-row"><div className="app-dot" style={{background:"#E24B4A"}}></div><div className="app-dot" style={{background:"#F5A623"}}></div><div className="app-dot" style={{background:"#0ABFA3"}}></div></div><div className="app-url">tutorapp.online · 🔒 {currentCountry.flag} {currentCountry.name[lang]}</div></div>

        <div className="app-tabs">
          {profileLoading ? (
            <div style={{padding:"14px 22px",fontSize:13,color:"#9CA3AF"}}>⏳ Loading...</div>
          ) : isTeacher ? <>
            <div className={`app-tab${appTab==="teacher-home"||appTab==="teacher-bid"?" active":""}`} onClick={()=>{setAppTab("teacher-home");setShowOnboard(false);}}>🏠 {lang==="fr"?"Accueil":lang==="ar"?"الرئيسية":"Home"}</div>
            <div className={`app-tab${appTab==="teacher-revenue"?" active":""}`} onClick={()=>setAppTab("teacher-revenue")}>💰 {lang==="fr"?"Revenus":lang==="ar"?"الإيرادات":"Revenue"}</div>
            <div className={`app-tab${appTab==="teacher-history"?" active":""}`} onClick={()=>setAppTab("teacher-history")}>📋 {lang==="fr"?"Historique":lang==="ar"?"السجل":"History"}</div>
            <div className={`app-tab${appTab==="profile"?" active":""}`} onClick={()=>setAppTab("profile")}>👤 {lang==="fr"?"Mon profil":lang==="ar"?"ملفي":"My profile"}</div>
          </> : <>
            <div className={`app-tab${appTab==="student-home"?" active":""}`} onClick={()=>setAppTab("student-home")}>🏠 {lang==="fr"?"Accueil":lang==="ar"?"الرئيسية":"Home"}{studentState==="offers"&&activeOffers.length>0&&<span style={{background:"#E34948",color:"#fff",borderRadius:"50%",fontSize:10,fontWeight:900,padding:"1px 6px",marginLeft:6,animation:"pulse 1s infinite"}}>{activeOffers.length}</span>}</div>
            <div className={`app-tab${appTab==="student-history"?" active":""}`} onClick={()=>setAppTab("student-history")}>📅 {lang==="fr"?"Mes cours":lang==="ar"?"دروسي":"My lessons"}</div>
            <div className={`app-tab${appTab==="profile"?" active":""}`} onClick={()=>setAppTab("profile")}>👤 {lang==="fr"?"Mon profil":lang==="ar"?"ملفي":"My profile"}</div>
          </>}
        </div>

        <div className="app-body">
          {appTab==="profile"&&<ProfilePage user={user} userProfile={userProfile} profileLoading={profileLoading} lang={lang} country={country} onSaved={(name)=>{setUserProfile(p=>({...p,full_name:name}));}} onEditTeachingProfile={()=>{setAppTab("teacher-home");openTeacherOnboard();}} />}

          {appTab==="student-home"&&<div style={{maxWidth:560,margin:"0 auto"}}>

            {/* VUE LISTE */}
            {studentView==="list"&&<div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:10}}>
                <div>
                  <div className="page-title">{lang==="fr"?"Mes demandes":lang==="ar"?"طلباتي":"My requests"}</div>
                  <div className="page-sub">{lang==="fr"?"Toutes tes recherches actives":lang==="ar"?"جميع طلباتك النشطة":"All your active searches"}</div>
                </div>
                <button className="submit-btn" style={{marginTop:0,padding:"10px 18px",fontSize:13,width:"auto"}} onClick={()=>{setStudentState("idle");setStudentView("form");}}>
                  + {lang==="fr"?"Nouvelle demande":lang==="ar"?"طلب جديد":"New request"}
                </button>
              </div>
              {allRequests.length===0&&<div style={{textAlign:"center",padding:"3rem 0",color:"#64748B"}}>
                <div style={{fontSize:48,marginBottom:12}}>📭</div>
                <div style={{fontWeight:700}}>{lang==="fr"?"Aucune demande active":lang==="ar"?"لا طلبات نشطة":"No active requests"}</div>
              </div>}
              {allRequests.map((entry,i)=>{
                const {request:r,booking,offers,reqState}=entry;
                const statusColor=reqState==="booked"?"#0ABFA3":reqState==="offers"?"#5B4FE8":"#F59E0B";
                const statusLabel=reqState==="booked"?(lang==="fr"?"Réservé ✅":lang==="ar"?"محجوز ✅":"Booked ✅"):reqState==="offers"?(lang==="fr"?`${offers.length} offre${offers.length>1?"s":""} 🎉`:lang==="ar"?`${offers.length} عروض 🎉`:`${offers.length} offer${offers.length>1?"s":""} 🎉`):(lang==="fr"?"En attente... 🔍":lang==="ar"?"في الانتظار... 🔍":"Waiting... 🔍");
                const minsAgo=Math.floor((Date.now()-new Date(r.created_at).getTime())/60000);
                const timeLabel=minsAgo<1?(lang==="fr"?"À l'instant":lang==="ar"?"الآن":"Just now"):minsAgo<60?`${minsAgo} min`:`${Math.floor(minsAgo/60)}h`;
                return(
                  <div key={r.id||i} style={{background:"#fff",border:`1.5px solid ${reqState==="offers"?"#C7D2FE":reqState==="booked"?"#A7F3D0":"#E2E8F0"}`,borderRadius:18,padding:"1.25rem 1.5rem",marginBottom:12,cursor:"pointer",transition:"transform .2s,box-shadow .2s",boxShadow:"0 4px 16px rgba(91,79,232,.06)"}}
                    onClick={()=>openStudentRequest(entry)}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{r.subject} · {r.level}</div>
                      <span style={{background:statusColor,color:"#fff",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:800,whiteSpace:"nowrap"}}>{statusLabel}</span>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      {r.instr_lang&&<span className="badge badge-blue">🗣 {r.instr_lang}</span>}
                      {r.curriculum&&<span className="badge badge-purple">{r.curriculum}</span>}
                      <span className="badge badge-amber">{r.duration_min} min</span>
                      <span className="badge badge-teal">📹 Online</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,color:"#6B7280",fontWeight:600}}>
                      <span>⏱ {timeLabel}</span>
                      {reqState==="booked"&&booking?.teacher&&<span>👤 {booking.teacher.full_name}</span>}
                      <span style={{color:statusColor,fontWeight:800}}>{lang==="fr"?"Voir →":lang==="ar"?"عرض ←":"View →"}</span>
                    </div>
                  </div>
                );
              })}
            </div>}

            {/* VUE FORMULAIRE */}
            {studentView==="form"&&<div style={{maxWidth:560,margin:"0 auto"}}>
              {allRequests.length>0&&<button className="btn-ghost" style={{marginBottom:"1rem"}} onClick={()=>setStudentView("list")}>← {lang==="fr"?"Mes demandes":lang==="ar"?"طلباتي":"My requests"}</button>}

            {/* ÉTAT 1 — idle */}
            {studentState==="idle"&&<div style={{maxWidth:560,margin:"0 auto"}}>
              <div style={{marginBottom:"1.5rem"}}>
                <div className="page-title">{lang==="fr"?"Bonjour":lang==="ar"?"مرحباً":"Hello"}, {displayName} 👋</div>
                <div className="page-sub">{lang==="fr"?"Trouve un prof en 5 minutes — paiement après le cours.":lang==="ar"?"ابحث عن مدرس في 5 دقائق — الدفع بعد الحصة.":"Find a tutor in 5 minutes — pay after the lesson."}</div>
              </div>

              {/* Preuve sociale */}
              <div style={{background:"linear-gradient(135deg, #5B4FE8 0%, #3D34C4 100%)",borderRadius:18,padding:"1.25rem 1.5rem",marginBottom:"1.5rem",display:"flex",justifyContent:"space-around",flexWrap:"wrap",gap:12}}>
                {[
                  [liveStats.todayLessons>0?`${liveStats.todayLessons}`:"10+",lang==="fr"?"cours aujourd'hui":lang==="ar"?"دروس اليوم":"lessons today"],
                  [`${liveStats.avgResponseMin} min`,lang==="fr"?"temps de réponse":lang==="ar"?"وقت الرد":"avg response"],
                  [liveStats.activeTeachers>0?`${liveStats.activeTeachers}`:"20+",lang==="fr"?"profs vérifiés":lang==="ar"?"مدرسون موثّقون":"verified tutors"],
                ].map(([val,lbl])=>(
                  <div key={String(lbl)} style={{textAlign:"center"}}>
                    <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,color:"#fff"}}>{val}</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.75)",fontWeight:600,marginTop:2}}>{lbl}</div>
                  </div>
                ))}
              </div>

              {/* Stats personnelles */}
              {studentStats.totalLessons>0&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:"1.5rem"}}>
                  <div className="stat-card"><span className="stat-val">{studentStats.totalLessons}</span><span className="stat-lbl">{lang==="fr"?"Cours effectués":lang==="ar"?"دروس مكتملة":"Lessons done"}</span></div>
                  <div className="stat-card"><span className="stat-val">{studentStats.totalSpent} AED</span><span className="stat-lbl">{lang==="fr"?"Total dépensé":lang==="ar"?"إجمالي المصروف":"Total spent"}</span></div>
                </div>
              )}

              {/* Formulaire */}
              <div style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:20,padding:"1.75rem"}}>
                <div style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,marginBottom:"1.25rem"}}>📋 {lang==="fr"?"Nouvelle annonce":lang==="ar"?"إعلان جديد":"Post a request"}</div>
                <div className="banner banner-blue" style={{marginBottom:"1rem"}}>📹 {lang==="fr"?"Cours en visioconférence — lien envoyé automatiquement":lang==="ar"?"الحصة عبر الفيديو — يُرسل الرابط تلقائياً":"Online lesson — video link sent automatically"}</div>

                {(form.curriculum&&form.level&&form.instrLang)?(<>
                  <div style={{background:"linear-gradient(135deg,#F0FDF4,#DCFCE7)",border:"1.5px solid #86EFAC",borderRadius:14,padding:"0.9rem 1.1rem",marginBottom:"1.25rem",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{fontSize:22}}>⚡</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:800,fontSize:13,color:"#0F6E56"}}>{lang==="fr"?"Profil pré-rempli !":lang==="ar"?"ملفك مُعبأ تلقائياً !":"Pre-filled from your profile!"}</div>
                      <div style={{fontSize:11,color:"#16A34A",marginTop:1}}>{lang==="fr"?"Choisis une matière et c'est parti.":lang==="ar"?"اختر المادة وانطلق.":"Just pick a subject and you're done."}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:"1.25rem"}}>
                    <span className="badge badge-purple">{Object.entries(CURRICULA).find(([k])=>k===form.curriculum)?.[1]?.label[lang]||form.curriculum}</span>
                    <span className="badge badge-blue">{form.level}</span>
                    <span className="badge badge-teal">🗣 {form.instrLang}</span>
                    <span style={{fontSize:11,color:"#5B4FE8",cursor:"pointer",fontWeight:700,textDecoration:"underline",alignSelf:"center"}} onClick={()=>setAppTab("profile")}>{lang==="fr"?"Modifier":lang==="ar"?"تعديل":"Edit"}</span>
                  </div>
                  <div className="form-group"><label className="form-label">{lang==="fr"?"Matière *":lang==="ar"?"المادة *":"Subject *"}</label><select className="form-select" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}><option value="">{lang==="fr"?"Choisir...":lang==="ar"?"اختر...":"Choose..."}</option>{SUBJECTS.map(s=><option key={s.en} value={s.en}>{s[lang]}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">{lang==="fr"?"Durée":lang==="ar"?"المدة":"Duration"}</label><div className="chips-row">{t.durations.map(d=><div key={d} className={`chip${form.duration===d?" selected":""}`} onClick={()=>setForm({...form,duration:d})}>{d}</div>)}</div></div>
                  <div className="form-group"><label className="form-label">{lang==="fr"?"Message (optionnel)":lang==="ar"?"رسالة (اختياري)":"Message (optional)"}</label><textarea className="form-textarea" placeholder={lang==="fr"?"Ex: exam dans 3 jours...":lang==="ar"?"مثال: امتحان بعد 3 أيام...":"Ex: exam in 3 days, struggling with algebra..."} value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></div>
                </>):(<>
                  <div className="banner banner-amber" style={{marginBottom:"1rem",cursor:"pointer"}} onClick={()=>setAppTab("profile")}>💡 {lang==="fr"?"Remplis le profil de l'élève pour aller encore plus vite →":lang==="ar"?"أكمل ملف الطالب لتنشر أسرع →":"Fill the student's profile to post faster →"}</div>
                  <div className="form-group"><label className="form-label">{t.form.subject}</label><select className="form-select" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}><option value="">{lang==="fr"?"Choisir...":lang==="ar"?"اختر...":"Choose..."}</option>{SUBJECTS.map(s=><option key={s.en} value={s.en}>{s[lang]}</option>)}</select></div>
                  <div className="form-row">
                    <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.form.lang}</label><select className={`form-select${form.instrLang?" prefilled":""}`} value={form.instrLang} onChange={e=>setForm({...form,instrLang:e.target.value})}><option value="">{lang==="fr"?"Choisir...":"Choose..."}</option>{t.instrLangs.map(l=><option key={l}>{l}</option>)}</select></div>
                    <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.form.curriculum}</label><select className={`form-select${form.curriculum?" prefilled":""}`} value={form.curriculum} onChange={e=>{setForm({...form,curriculum:e.target.value,level:""});setCurriculum(e.target.value);}}><option value="">{lang==="fr"?"Choisir...":"Choose..."}</option>{Object.entries(CURRICULA).map(([k,v])=><option key={k} value={k}>{v.label[lang]||v.label.en}</option>)}</select></div>
                  </div>
                  <div className="form-group"><label className="form-label">{t.form.level}</label><select className={`form-select${form.level?" prefilled":""}`} value={form.level} onChange={e=>setForm({...form,level:e.target.value})} disabled={!currLevels.length}><option value="">{currLevels.length?(lang==="fr"?"Choisir...":"Choose..."):(lang==="fr"?"Sélectionne un cursus":"Select curriculum first")}</option>{currLevels.map(l=><option key={l}>{l}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">{t.form.duration}</label><div className="chips-row">{t.durations.map(d=><div key={d} className={`chip${form.duration===d?" selected":""}`} onClick={()=>setForm({...form,duration:d})}>{d}</div>)}</div></div>
                  <div className="form-group"><label className="form-label">{t.form.msg}</label><textarea className="form-textarea" placeholder={t.form.msgPh} value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></div>
                </>)}

                {form.subject&&form.level&&(
                  <div style={{background:"#F8FAFF",border:"1.5px solid #C7D2FE",borderRadius:14,padding:"1rem",marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#5B4FE8",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                      👁 {lang==="fr"?"Aperçu — ce que les profs verront":lang==="ar"?"معاينة — ما سيراه المدرسون":"Preview — what tutors will see"}
                    </div>
                    <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>{form.subject} · {form.level}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:form.message?8:0}}>
                      {form.curriculum&&<span className="badge badge-purple">{Object.entries(CURRICULA).find(([k])=>k===form.curriculum)?.[1]?.label[lang]||form.curriculum}</span>}
                      {form.instrLang&&<span className="badge badge-blue">🗣 {form.instrLang}</span>}
                      <span className="badge badge-amber">{form.duration}</span>
                      <span className="badge badge-teal">📹 Online</span>
                    </div>
                    {form.message&&<div style={{fontSize:12,color:"#64748B",fontStyle:"italic",marginTop:4}}>"{form.message}"</div>}
                  </div>
                )}
                <button className="btn-full" onClick={handlePublish} disabled={publishing}>{publishing?"⏳ "+(lang==="fr"?"Publication...":"Posting..."):lang==="fr"?"Publier mon annonce →":lang==="ar"?"نشر إعلاني ←":"Post my request →"}</button>
              </div>
            </div>}
            </div>}

            {/* VUE DÉTAIL */}
            {studentView==="detail"&&<div>
              <button className="btn-ghost" style={{marginBottom:"1rem"}} onClick={()=>{setStudentView(allRequests.length>0?"list":"form");}}>← {lang==="fr"?"Mes demandes":lang==="ar"?"طلباتي":"My requests"}</button>

            {/* ÉTAT 2 — waiting */}
            {studentState==="waiting"&&<div style={{maxWidth:520,margin:"0 auto",textAlign:"center",padding:"2rem 0"}}>
              <div style={{fontSize:56,marginBottom:"1rem",animation:"pulse 2s infinite"}}>🔍</div>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:8}}>{lang==="fr"?"Recherche en cours...":lang==="ar"?"البحث جارٍ...":"Searching for tutors..."}</div>
              <div style={{fontSize:13,color:"#64748B",marginBottom:"1rem",lineHeight:1.7}}>{lang==="fr"?"Détendez-vous — les enseignants se disputent votre cours en ce moment.":lang==="ar"?"استرخِ — المدرسون يتنافسون على حصتك الآن.":"Sit back — tutors are competing for your lesson right now."}</div>
              <div style={{background:"#EEF2FF",border:"1.5px solid #D8DBFE",borderRadius:12,padding:"10px 20px",display:"inline-block",marginBottom:"1rem",fontSize:13,fontWeight:700,color:"#5B4FE8"}}>
                ⏱ {lang==="fr"?"Annonce publiée il y a":lang==="ar"?"نُشر الإعلان منذ":"Posted"} {formatWaitingTime()}{lang==="en"?" ago":""}
              </div>
              {requestViews>0&&(
                <div style={{fontSize:13,color:"#0ABFA3",fontWeight:700,marginBottom:"1rem",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  👁 {requestViews} {lang==="fr"?"enseignants ont vu ton annonce":lang==="ar"?"مدرسون رأوا إعلانك":"tutors have seen your request"}
                </div>
              )}
              <div style={{background:"#E2E8F0",borderRadius:4,height:4,marginBottom:"1.5rem",overflow:"hidden",maxWidth:300,margin:"0 auto 1.5rem"}}>
                <div style={{background:"#5B4FE8",height:"100%",width:`${Math.min((waitingSeconds/(24*3600))*100,100)}%`,transition:"width 1s linear",borderRadius:4}}/>
              </div>
              <div style={{background:"#F8FAFF",border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:"1.5rem",textAlign:"start"}}>
                <div style={{fontWeight:800,fontSize:15,marginBottom:10}}>{activeRequest?.subject} · {activeRequest?.level}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span className="badge badge-purple">{activeRequest?.curriculum}</span>
                  <span className="badge badge-blue">🗣 {activeRequest?.instr_lang}</span>
                  <span className="badge badge-amber">{activeRequest?.duration_min} min</span>
                  <span className="badge badge-teal">📹 Online</span>
                </div>
              </div>
              <div style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:"1.5rem",textAlign:"start",transition:"all .5s ease"}}>
                <div style={{display:"flex",gap:4,marginBottom:8}}>{"⭐".repeat(TESTIMONIALS[currentTestimonial].stars)}</div>
                <div style={{fontSize:13,color:"#1A1A2E",fontStyle:"italic",lineHeight:1.6,marginBottom:8}}>"{TESTIMONIALS[currentTestimonial].text[lang]||TESTIMONIALS[currentTestimonial].text.en}"</div>
                <div style={{fontSize:12,color:"#64748B",fontWeight:700}}>— {TESTIMONIALS[currentTestimonial].name}</div>
              </div>
              <div style={{fontSize:12,color:"#9CA3AF",marginBottom:"1.5rem",fontWeight:600}}>🔄 {lang==="fr"?"Mise à jour automatique toutes les 10 secondes":lang==="ar"?"تحديث تلقائي كل 10 ثوانٍ":"Auto-refreshing every 10 seconds"}</div>
              {suggestedTeachers.length>0&&(
                <div style={{textAlign:"start",marginBottom:"1.5rem"}}>
                  <div style={{fontWeight:800,fontSize:15,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{background:"linear-gradient(135deg,#5B4FE8,#0ABFA3)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                      ⚡ {lang==="fr"?"Profs disponibles — déjà notifiés !":lang==="ar"?"المدرسون المتاحون — تم إخطارهم!":"Available tutors — already notified!"}
                    </span>
                  </div>
                  {suggestedTeachers.map(t=>(
                    <div key={t.id} style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:14,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                      <div style={{width:46,height:46,borderRadius:"50%",background:"linear-gradient(135deg,#5B4FE8,#0ABFA3)",flexShrink:0,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {t.photo_url?<img src={t.photo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:20,color:"#fff"}}>👤</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.full_name||"Tutor"}</div>
                        <div style={{fontSize:12,color:"#64748B",marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                          {t.rating>0&&<span>⭐ {Number(t.rating).toFixed(1)} ({t.rating_count||0})</span>}
                          {t.hourly_rate_aed&&<span style={{color:"#5B4FE8",fontWeight:700}}>{t.hourly_rate_aed} AED/h</span>}
                        </div>
                      </div>
                      <div style={{flexShrink:0,fontSize:11,color:"#0ABFA3",fontWeight:700,background:"#F0FDF4",borderRadius:8,padding:"4px 10px"}}>✓ {lang==="fr"?"Notifié":lang==="ar"?"تم الإخطار":"Notified"}</div>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn-ghost" onClick={async()=>{
                if(activeRequest?.id){await supabase.from("requests").update({status:"cancelled"}).eq("id",activeRequest.id);}
                setStudentState("idle");setActiveRequest(null);setActiveOffers([]);setWaitingSeconds(0);setRequestViews(0);setSuggestedTeachers([]);
              }}>{lang==="fr"?"Annuler l'annonce":lang==="ar"?"إلغاء الإعلان":"Cancel request"}</button>
            </div>}

            {/* ÉTAT 3 — offers */}
            {studentState==="offers"&&<>
              {firstOfferJustArrived&&(
                <div style={{background:"linear-gradient(135deg,#5B4FE8,#0ABFA3)",borderRadius:16,padding:"1rem 1.25rem",marginBottom:"1rem",display:"flex",alignItems:"center",gap:12,animation:"popIn .4s ease"}}>
                  <div style={{fontSize:32}}>🎉</div>
                  <div>
                    <div style={{fontWeight:900,fontSize:15,color:"#fff"}}>{lang==="fr"?"Des profs ont répondu !":lang==="ar"?"ردّ عليك مدرسون !":"Tutors responded to your request!"}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.85)",marginTop:2}}>{lang==="fr"?"Compare les offres et choisis le meilleur pour toi.":lang==="ar"?"قارن العروض واختر الأفضل.":"Compare offers and pick the best fit."}</div>
                  </div>
                </div>
              )}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
                <div>
                  <div className="page-title">{lang==="fr"?"Offres reçues":lang==="ar"?"العروض المستلمة":"Offers received"} 🎉</div>
                  <div style={{fontSize:13,color:"#64748B"}}>{activeRequest?.subject} · {activeRequest?.level} · {activeRequest?.duration_min} min</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                  <span className="badge badge-amber">{activeOffers.length} {lang==="fr"?"offres":lang==="ar"?"عروض":"offers"}</span>
                  {activeRequest?.created_at&&(()=>{
                    const minLeft=Math.max(0,24*60-Math.floor((Date.now()-new Date(activeRequest.created_at).getTime())/60000));
                    const h=Math.floor(minLeft/60),m=minLeft%60;
                    return minLeft<120?(
                      <span style={{fontSize:11,color:"#DC2626",fontWeight:700,background:"#FEE2E2",padding:"2px 8px",borderRadius:20}}>
                        ⏳ {lang==="fr"?`Expire dans ${h}h${m}m`:lang==="ar"?`تنتهي خلال ${h}س${m}د`:`Expires in ${h}h${m}m`}
                      </span>
                    ):(
                      <span style={{fontSize:11,color:"#92400E",fontWeight:700,background:"#FEF3C7",padding:"2px 8px",borderRadius:20}}>
                        ⏳ {lang==="fr"?`${h}h${m}m restantes`:lang==="ar"?`${h}س${m}د متبقية`:`${h}h${m}m left`}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="banner banner-teal">💳 {lang==="fr"?"Tu paies UNIQUEMENT après le cours — 6% de frais de service":lang==="ar"?"تدفع فقط بعد الحصة — رسوم خدمة 6٪":"Pay ONLY after the lesson — 6% service fee"}</div>
              <div style={{textAlign:"end",marginBottom:8}}>
                <button className="btn-ghost" style={{fontSize:12,color:"#DC2626",borderColor:"#FCA5A5"}} onClick={async()=>{
                  if(!confirm(lang==="fr"?"Annuler l'annonce et toutes les offres reçues ?":lang==="ar"?"إلغاء الإعلان وجميع العروض المستلمة؟":"Cancel request and all received offers?")) return;
                  if(activeRequest?.id){
                    await supabase.from("requests").update({status:"cancelled"}).eq("id",activeRequest.id);
                    await supabase.from("bids").update({status:"declined"}).eq("request_id",activeRequest.id).eq("status","pending");
                  }
                  setStudentState("idle");setActiveRequest(null);setActiveOffers([]);setWaitingSeconds(0);setRequestViews(0);
                  showToast(lang==="fr"?"Annonce annulée.":lang==="ar"?"تم إلغاء الإعلان.":"Request cancelled.");
                }}>🗑 {lang==="fr"?"Annuler l'annonce":lang==="ar"?"إلغاء الإعلان":"Cancel request"}</button>
              </div>
              {activeOffers.map((offer,i)=>{
                const offerAgeMin=Math.floor((Date.now()-new Date(offer.created_at).getTime())/60000);
                const isFast=offerAgeMin<5;
                return (
                  <div key={offer.id||i} className="offer-card">
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        {offer.teacher?.avatar_url
                          ?<img src={offer.teacher.avatar_url} alt={offer.teacher?.full_name} style={{width:46,height:46,borderRadius:"50%",objectFit:"cover",flexShrink:0}} />
                          :<div style={{width:46,height:46,borderRadius:"50%",background:"#EEF2FF",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:16,color:"#5B4FE8",flexShrink:0}}>
                            {(offer.teacher?.full_name||"T").split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)}
                          </div>}
                        <div>
                          <div style={{fontWeight:800,fontSize:15}}>{offer.teacher?.full_name||"Tutor"}</div>
                          <div style={{display:"flex",gap:6,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                            <span style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✅ {lang==="fr"?"Vérifié":lang==="ar"?"موثّق":"Verified"}</span>
                            {offerRatings[offer.teacher_id]&&(
                              <span style={{fontSize:12,color:"#F59E0B",fontWeight:800,background:"#FEF9C3",padding:"2px 7px",borderRadius:8}}>
                                ★ {offerRatings[offer.teacher_id].avg} <span style={{color:"#92400E",fontWeight:600}}>({offerRatings[offer.teacher_id].count})</span>
                              </span>
                            )}
                            {isFast&&<span style={{fontSize:11,color:"#F59E0B",fontWeight:700}}>⚡ {lang==="fr"?"Répond vite":lang==="ar"?"يرد بسرعة":"Fast reply"}</span>}
                            {offer.teacher?.teaching_curricula?.length>0&&<span style={{fontSize:11,color:"#64748B",fontWeight:600}}>📚 {offer.teacher.teaching_curricula.map(c=>CURRICULA[c]?.label[lang]||c).join(", ")}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{textAlign:"end"}}>
                        <div style={{fontFamily:"Fraunces,serif",fontSize:26,fontWeight:900,color:"#5B4FE8"}}>{offer.net_price_aed} AED</div>
                        <div style={{fontSize:11,color:"#9CA3AF"}}>/heure</div>
                      </div>
                    </div>
                    <div style={{fontSize:13,color:"#64748B",lineHeight:1.65,margin:"10px 0 12px",fontStyle:"italic",background:"#F8FAFF",borderRadius:10,padding:"10px 14px",borderLeft:"3px solid #D8DBFE"}}>"{offer.message}"</div>
                    <div style={{background:"#F8FAFF",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#64748B",fontWeight:600}}>
                      {lang==="fr"?"Tu paieras":lang==="ar"?"ستدفع":"You'll pay"}{" "}
                      <strong style={{color:"#5B4FE8",fontFamily:"Fraunces,serif",fontSize:15}}>{Math.round(offer.net_price_aed*1.06)} AED</strong>
                      {" · "}{lang==="fr"?"Prof reçoit":lang==="ar"?"يستلم المدرس":"Tutor receives"}{" "}
                      <strong style={{color:"#0ABFA3"}}>{Math.round(offer.net_price_aed*0.94)} AED</strong>
                    </div>
                    <div style={{fontSize:11,color:"#9CA3AF",fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:4}}>
                      🛡 {lang==="fr"?"Si le cours n'a pas lieu, remboursement 100%":lang==="ar"?"إذا لم تتم الحصة، استرداد 100%":"If lesson doesn't happen, 100% refund"}
                    </div>
                    {/* Bio expandable */}
                    {offer.teacher?.teaching_bio&&(
                      <div style={{marginBottom:10}}>
                        <button style={{background:"none",border:"none",color:"#5B4FE8",fontSize:12,fontWeight:700,cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>setExpandedOffer(expandedOffer===offer.id?null:offer.id)}>
                          {expandedOffer===offer.id?(lang==="fr"?"▲ Masquer le profil":lang==="ar"?"▲ إخفاء الملف":"▲ Hide profile"):(lang==="fr"?"▼ Voir le profil complet":lang==="ar"?"▼ عرض الملف الكامل":"▼ View full profile")}
                        </button>
                        {expandedOffer===offer.id&&(
                          <div style={{marginTop:8,padding:"12px 14px",background:"#F8FAFF",borderRadius:10,fontSize:13,color:"#1A1A2E",lineHeight:1.65,borderLeft:"3px solid #5B4FE8"}}>
                            {offer.teacher.teaching_bio}
                          </div>
                        )}
                      </div>
                    )}
                    {offer.proposed_slots?.length>0&&(
                      <div style={{background:"#F0FDF4",border:"1.5px solid #A7F3D0",borderRadius:12,padding:"12px 14px",marginBottom:12}}>
                        <div style={{fontWeight:800,fontSize:12,color:"#0F6E56",marginBottom:8}}>📅 {lang==="fr"?"Créneaux proposés — choisis un :":lang==="ar"?"المواعيد المقترحة — اختر واحداً:":"Proposed slots — pick one:"}</div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {offer.proposed_slots.map((slot,si)=>{
                            const d=new Date(slot);
                            const label=d.toLocaleDateString(lang==="ar"?"ar-AE":lang==="fr"?"fr-FR":"en-AE",{weekday:"short",day:"numeric",month:"short"})+" · "+d.toLocaleTimeString(lang==="ar"?"ar-AE":lang==="fr"?"fr-FR":"en-AE",{hour:"2-digit",minute:"2-digit"});
                            const isSelected=selectedSlot[offer.id]===slot;
                            return(
                              <label key={si} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",background:isSelected?"#D1FAE5":"#fff",border:isSelected?"1.5px solid #0ABFA3":"1.5px solid #E2E8F0",borderRadius:8,padding:"8px 12px",fontSize:13,fontWeight:isSelected?700:500,transition:"all .15s"}}>
                                <input type="radio" name={`slot-${offer.id}`} checked={isSelected} onChange={()=>setSelectedSlot(prev=>({...prev,[offer.id]:slot}))} style={{accentColor:"#0ABFA3"}} />
                                {label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{display:"flex",gap:10}}>
                      <button className="btn-accept" style={{flex:2}} onClick={()=>handleAcceptBid(offer)}>{lang==="fr"?"Accepter & Réserver →":lang==="ar"?"قبول وحجز ←":"Accept & Book →"}</button>
                      <button className="btn-decline" style={{flex:1}} onClick={()=>{const remaining=activeOffers.filter(o=>o.id!==offer.id);setActiveOffers(remaining);if(remaining.length===0)setStudentState("waiting");}}>{lang==="fr"?"Refuser":lang==="ar"?"رفض":"Decline"}</button>
                    </div>
                  </div>
                );
              })}
            </>}

            {/* ÉTAT D — payment */}
            {studentState==="payment"&&selectedOffer&&activeBooking&&<div style={{maxWidth:480,margin:"0 auto"}}>
              <div className="page-title">{t.payment.title}</div>
              <div className="page-sub">{t.payment.sub}</div>
              <div className="payment-card">
                <div className="payment-row"><span style={{color:"#6B7280"}}>{t.payment.lessonPrice}</span><span style={{fontWeight:700}}>{selectedOffer.net_price_aed} AED</span></div>
                <div className="payment-row"><span style={{color:"#6B7280"}}>{t.payment.serviceFee}</span><span style={{fontWeight:700,color:"#9CA3AF"}}>+ {Math.round(selectedOffer.net_price_aed*0.06)} AED</span></div>
                <div className="payment-row" style={{borderTop:"2px solid #E8EAF6",paddingTop:12,marginTop:4}}>
                  <span style={{fontWeight:800,color:"#1A1A2E",fontSize:16}}>{t.payment.total}</span>
                  <span className="payment-total">{activeBooking.gross_price_aed} AED</span>
                </div>
              </div>
              {stripeError&&<div style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#B91C1C",marginBottom:14,fontWeight:600}}>
                <div style={{marginBottom:8}}>❌ {stripeError}</div>
                <div style={{fontSize:12,color:"#B91C1C",fontWeight:500}}>{lang==="fr"?"Tu peux réessayer avec une autre carte ci-dessous.":lang==="ar"?"يمكنك المحاولة مرة أخرى ببطاقة أخرى أدناه.":"You can retry with another card below."}</div>
              </div>}
              <div style={{background:"#EEF2FF",border:"1.5px solid #C7D2FE",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12,fontWeight:700,color:"#3730A3",display:"flex",alignItems:"center",gap:8}}>
                🔒 {lang==="fr"?"Sécurisé par Stripe — vous ne serez débité qu'après le cours":lang==="ar"?"مؤمَّن بـ Stripe — لن يُخصم منك إلا بعد الحصة":"Secured by Stripe — you'll only be charged after the lesson"}
              </div>
              <div className="payment-note">⚠️ {t.payment.payNote}</div>
              <Elements stripe={stripePromise}>
                <CheckoutForm booking={activeBooking} totalAmount={activeBooking.gross_price_aed} onSuccess={handlePaymentSuccess} onBack={()=>{setStudentState("offers");}} lang={lang} />
              </Elements>
            </div>}

            {/* ÉTAT 4 — booked */}
            {studentState==="booked"&&<div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
              <div style={{background:"linear-gradient(135deg, #0ABFA3 0%, #089e87 100%)",borderRadius:20,padding:"2rem 1.5rem",marginBottom:"1.5rem"}}>
                <div style={{fontSize:48,marginBottom:8}}>🎉</div>
                <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,color:"#fff",marginBottom:8}}>
                  {childName?(lang==="fr"?`${childName} va avoir son cours de ${activeRequest?.subject} !`:lang==="ar"?`${childName} سيحصل على حصة ${activeRequest?.subject} !`:`${childName} is getting their ${activeRequest?.subject} lesson!`):(lang==="fr"?"Cours réservé !":lang==="ar"?"تم حجز الدرس !":"Lesson booked!")}
                </div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.85)"}}>{lang==="fr"?"Avec":lang==="ar"?"مع":"With"} <strong>{activeBooking?.teacher?.full_name}</strong> · {lang==="fr"?"Enseignant vérifié ✅":lang==="ar"?"مدرس موثّق ✅":"Verified tutor ✅"}</div>
              </div>
              <div style={{background:"#F8FAFF",border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:"1.25rem",textAlign:"start",animation:"slideUp .4s ease"}}>
                <div style={{fontWeight:800,fontSize:13,color:"#5B4FE8",marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>📋 {lang==="fr"?"Comment ça se passe ?":lang==="ar"?"كيف تسير الأمور؟":"What happens next?"}</div>
                {[
                  {icon:"📅",title:lang==="fr"?"Convenez d'un horaire":lang==="ar"?"حددوا الموعد":"Agree on a time",sub:lang==="fr"?"Via la messagerie ou WhatsApp ci-dessous":lang==="ar"?"عبر الرسائل أو واتساب أدناه":"Via chat or WhatsApp below"},
                  {icon:"📹",title:lang==="fr"?"Rejoignez le cours en ligne":lang==="ar"?"انضموا للحصة أونلاين":"Join the online lesson",sub:lang==="fr"?"Cliquez sur le lien Jitsi — aucune installation requise":lang==="ar"?"انقر رابط Jitsi — لا تثبيت مطلوب":"Click the Jitsi link — no install needed"},
                  {icon:"✅",title:lang==="fr"?"Confirmez après le cours":lang==="ar"?"أكدوا بعد الحصة":"Confirm after the lesson",sub:lang==="fr"?"Le paiement est libéré uniquement à ce moment":lang==="ar"?"يُحرر الدفع فقط بعد التأكيد":"Payment is released only then"},
                  {icon:"⭐",title:lang==="fr"?"Notez votre enseignant":lang==="ar"?"قيّموا مدرسكم":"Rate your tutor",sub:lang==="fr"?"Aidez d'autres familles à choisir":lang==="ar"?"ساعدوا عائلات أخرى في الاختيار":"Help other families choose"},
                ].map((step,i)=>(
                  <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:i<3?12:0}}>
                    <div style={{fontSize:20,flexShrink:0,marginTop:1}}>{step.icon}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:"#1A1A2E"}}>{step.title}</div>
                      <div style={{fontSize:12,color:"#64748B",marginTop:1}}>{step.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {activeBooking?.scheduled_at&&(
                <div style={{background:"linear-gradient(135deg,#F0FDF4,#DCFCE7)",border:"1.5px solid #86EFAC",borderRadius:14,padding:"1rem 1.25rem",marginBottom:"1.25rem",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontSize:28}}>📅</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:"#0F6E56",marginBottom:2}}>{lang==="fr"?"Cours prévu le":lang==="ar"?"موعد الحصة":"Lesson scheduled"}</div>
                    <div style={{fontWeight:900,fontSize:15,color:"#166534"}}>{new Date(activeBooking.scheduled_at).toLocaleDateString(lang==="ar"?"ar-AE":lang==="fr"?"fr-FR":"en-AE",{weekday:"long",day:"numeric",month:"long"})} · {new Date(activeBooking.scheduled_at).toLocaleTimeString(lang==="ar"?"ar-AE":lang==="fr"?"fr-FR":"en-AE",{hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                </div>
              )}
              <div style={{background:"#F8FAFF",border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:"1.5rem",textAlign:"start"}}>
                {([
                  [lang==="fr"?"Matière":lang==="ar"?"المادة":"Subject",activeRequest?.subject,false],
                  [lang==="fr"?"Enseignant":lang==="ar"?"المدرس":"Tutor",activeBooking?.teacher?.full_name,false],
                  [lang==="fr"?"Tu paieras":lang==="ar"?"ستدفع":"You'll pay",`${activeBooking?.gross_price_aed} AED`,true],
                  [lang==="fr"?"Paiement":lang==="ar"?"الدفع":"Payment",lang==="fr"?"✓ Après le cours":lang==="ar"?"✓ بعد الحصة":"✓ After lesson",false],
                ] as [string,string,boolean][]).map(([label,value,isPrimary],idx)=>(
                  <div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:idx<3?"1px solid #E2E8F0":"none",fontSize:14}}>
                    <span style={{color:"#64748B"}}>{label}</span>
                    <span style={{fontWeight:isPrimary?900:700,color:isPrimary?"#5B4FE8":"#1A1A2E",fontFamily:isPrimary?"Fraunces,serif":"inherit",fontSize:isPrimary?17:14}}>{value}</span>
                  </div>
                ))}
              </div>
              {(()=>{
                const jitsiRoom=activeBooking?.id?`TutorApp-${activeBooking.id.slice(-8).toUpperCase()}`:null;
                const jitsiLink=jitsiRoom?`https://meet.jit.si/${jitsiRoom}`:null;
                return jitsiLink?(
                  <div style={{background:"#ECFDF5",border:"1.5px solid #A7F3D0",borderRadius:14,padding:"1.25rem",marginBottom:"1.5rem"}}>
                    <div style={{fontWeight:800,fontSize:14,color:"#0F6E56",marginBottom:8}}>📹 {lang==="fr"?"Visioconférence":lang==="ar"?"مكالمة فيديو":"Video call"}</div>
                    <button onClick={()=>{setVideoCallUrl(jitsiLink);setShowVideoCall(true);}} style={{width:"100%",background:"#0ABFA3",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:8}}>
                      🎥 {lang==="fr"?"Lancer le cours maintenant":lang==="ar"?"ابدأ الحصة الآن":"Start lesson now"}
                    </button>
                    <div style={{display:"flex",gap:8}}>
                      <button style={{flex:1,background:"transparent",border:"1.5px solid #0ABFA3",color:"#0ABFA3",borderRadius:10,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}} onClick={()=>{navigator.clipboard?.writeText(jitsiLink);showToast("📋 "+(lang==="fr"?"Lien copié !":lang==="ar"?"تم نسخ الرابط !":"Link copied!"));}}>
                        📋 {lang==="fr"?"Copier le lien":lang==="ar"?"نسخ الرابط":"Copy link"}
                      </button>
                      <a href={`https://wa.me/?text=${encodeURIComponent((lang==="fr"?"Lien de ton cours :":lang==="ar"?"رابط حصتك:":`Your lesson link:`)+" "+jitsiLink)}`} target="_blank" rel="noopener noreferrer" style={{flex:1,background:"#25D366",color:"#fff",borderRadius:10,padding:"8px",fontSize:13,fontWeight:700,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                        💬 {lang==="fr"?"WhatsApp":lang==="ar"?"واتساب":"WhatsApp"}
                      </a>
                    </div>
                  </div>
                ):null;
              })()}
              {recurringSetup&&(
                <div style={{background:"#EEF2FF",border:"1.5px solid #C7D2FE",borderRadius:14,padding:"1rem",marginBottom:"1.25rem",textAlign:"start"}}>
                  <div style={{fontWeight:800,fontSize:14,color:"#4338CA",marginBottom:4}}>🔄 {lang==="fr"?`Cours ${recurringSetup==="weekly"?"hebdomadaires":"bimensuels"} activés !`:lang==="ar"?`دروس ${recurringSetup==="weekly"?"أسبوعية":"نصف أسبوعية"} مفعّلة !`:`${recurringSetup==="weekly"?"Weekly":"Biweekly"} lessons activated!`}</div>
                  <div style={{fontSize:12,color:"#6366F1",lineHeight:1.5}}>{lang==="fr"?`Tu recevras un rappel avant chaque prochain cours avec ${activeBooking?.teacher?.full_name}.`:lang==="ar"?`ستتلقى تذكيراً قبل كل حصة قادمة مع ${activeBooking?.teacher?.full_name}.`:`You'll get a reminder before each upcoming lesson with ${activeBooking?.teacher?.full_name}.`}</div>
                </div>
              )}
              {activePack&&activePack.status==="active"?(
                <div style={{background:"linear-gradient(135deg,#EEF2FF,#F0FDF4)",border:"1.5px solid #C7D2FE",borderRadius:14,padding:"1rem 1.25rem",marginBottom:"1.25rem",textAlign:"start"}}>
                  <div style={{fontWeight:800,fontSize:14,color:"#4338CA",marginBottom:6}}>📦 {lang==="fr"?"Pack actif":lang==="ar"?"الباقة النشطة":"Active pack"}</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:13,color:"#374151"}}>
                      {lang==="fr"?`${activePack.total_lessons - activePack.lessons_done} cours restant(s) sur ${activePack.total_lessons}`:lang==="ar"?`${activePack.total_lessons - activePack.lessons_done} درس متبقٍ من ${activePack.total_lessons}`:`${activePack.total_lessons - activePack.lessons_done} lesson(s) left of ${activePack.total_lessons}`}
                    </div>
                    <div style={{fontWeight:900,fontSize:15,color:"#5B4FE8"}}>{(activePack.total_lessons - activePack.lessons_done) * activePack.price_per_lesson_aed} AED</div>
                  </div>
                  <div style={{background:"#E2E8F0",borderRadius:4,height:6,overflow:"hidden",marginBottom:10}}>
                    <div style={{background:"linear-gradient(90deg,#5B4FE8,#0ABFA3)",height:"100%",width:`${(activePack.lessons_done/activePack.total_lessons)*100}%`,borderRadius:4,transition:"width .5s ease"}}/>
                  </div>
                  <button onClick={()=>setShowCancelPackConfirm(true)} style={{fontSize:12,color:"#DC2626",background:"none",border:"none",cursor:"pointer",fontWeight:700,padding:0}}>
                    🗑 {lang==="fr"?"Annuler le pack":lang==="ar"?"إلغاء الباقة":"Cancel pack"}
                  </button>
                </div>
              ):(
                !activePack&&<div style={{background:"linear-gradient(135deg,#EEF2FF,#F5F3FF)",border:"1.5px dashed #A5B4FC",borderRadius:14,padding:"1rem 1.25rem",marginBottom:"1.25rem",cursor:"pointer"}} onClick={()=>setShowPackModal(true)}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:14,color:"#4338CA",marginBottom:3}}>📦 {lang==="fr"?"Prendre un pack de cours ?":lang==="ar"?"هل تريد باقة دروس؟":"Get a lesson pack?"}</div>
                      <div style={{fontSize:12,color:"#6366F1"}}>{lang==="fr"?"4, 8 ou 12 cours — économise jusqu'à 10%":lang==="ar"?"4 أو 8 أو 12 درساً — وفّر حتى 10%":"4, 8 or 12 lessons — save up to 10%"}</div>
                    </div>
                    <div style={{fontSize:22}}>→</div>
                  </div>
                </div>
              )}
              <div style={{background:"#FEF3C7",border:"1.5px solid #FCD34D",borderRadius:14,padding:"1rem",marginBottom:"1.25rem",fontSize:13,color:"#92400E",fontWeight:600}}>
                ⚠️ {lang==="fr"?"Clique 'Confirmer' UNIQUEMENT après le cours.":lang==="ar"?"انقر 'تأكيد' فقط بعد انتهاء الحصة.":"Click 'Confirm' ONLY after the lesson."}
              </div>
              <button className="btn-ghost" style={{width:"100%",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#F8FAFF",borderColor:"#C7D2FE",color:"#5B4FE8"}} onClick={()=>{setShowChat(true);if(activeBooking?.id)loadChatMessages(activeBooking.id);}}>
                💬 {lang==="fr"?"Messagerie avec le prof":lang==="ar"?"المراسلة مع المدرس":"Message the tutor"}
              </button>
              <button className="btn-full" style={{background:"#0ABFA3",marginBottom:12}} onClick={async()=>{
                try{
                  await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/capture-payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bookingId:activeBooking?.id})});
                  await supabase.from("bookings").update({status:"completed"}).eq("id",activeBooking?.id);
                  await sendConfirmationEmail(activeBooking);
                  setStudentState("rate");
                  showToast("✅ "+(lang==="fr"?"Cours confirmé !":lang==="ar"?"تم تأكيد الحصة !":"Lesson confirmed!"));
                }catch(e){showToast("❌ "+e.message);}
              }}>✅ {lang==="fr"?"Confirmer — le cours a eu lieu":lang==="ar"?"تأكيد — انتهت الحصة":"Confirm — lesson completed"}</button>
              <button className="btn-ghost" style={{width:"100%"}} onClick={()=>setShowReportModal(true)}>⚠️ {lang==="fr"?"Signaler un problème":lang==="ar"?"الإبلاغ عن مشكلة":"Report an issue"}</button>
              <button className="btn-ghost" style={{width:"100%",marginTop:8,color:"#DC2626",borderColor:"#FCA5A5",fontSize:12}} onClick={()=>setShowCancelConfirm(true)}>
                🗑 {lang==="fr"?"Annuler la réservation":lang==="ar"?"إلغاء الحجز":"Cancel booking"}
              </button>
            </div>}

            {/* MODAL PACK */}
            {showPackModal&&activeBooking&&(
              <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.6)",zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"1rem"}}>
                <div style={{background:"#fff",borderRadius:20,padding:"1.75rem",maxWidth:440,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.2)"}}>
                  <div style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,marginBottom:4,color:"#1A1A2E"}}>📦 {lang==="fr"?"Choisir un pack":lang==="ar"?"اختر الباقة":"Choose a pack"}</div>
                  <div style={{fontSize:13,color:"#64748B",marginBottom:"1.25rem"}}>{lang==="fr"?`Avec ${activeBooking.teacher?.full_name} · ${activeRequest?.subject}`:lang==="ar"?`مع ${activeBooking.teacher?.full_name} · ${activeRequest?.subject}`:`With ${activeBooking.teacher?.full_name} · ${activeRequest?.subject}`}</div>
                  {([4,8,12] as const).map(n=>{
                    const pricePerLesson=activeBooking.gross_price_aed;
                    const discount=n===4?0:n===8?0.05:0.10;
                    const discountedPrice=Math.round(pricePerLesson*(1-discount));
                    const total=discountedPrice*n;
                    return(
                      <button key={n} onClick={async()=>{
                        setPackCreating(true);
                        try{
                          const pi=await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/create-payment-intent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amountAed:total,bookingId:activeBooking.id,packLessons:n})});
                          const {clientSecret,paymentIntentId}=await pi.json();
                          // Confirm payment (for simplicity, store intent — in prod use Stripe.js)
                          const {data:pack}=await supabase.from("packs").insert({
                            student_id:user?.id,
                            teacher_id:activeBooking.teacher_id,
                            subject:activeRequest?.subject,
                            total_lessons:n,
                            lessons_done:0,
                            price_per_lesson_aed:discountedPrice,
                            stripe_payment_intent_id:paymentIntentId,
                            status:"active"
                          }).select().single();
                          setActivePack(pack);
                          setShowPackModal(false);
                          showToast("✅ "+(lang==="fr"?`Pack de ${n} cours activé !`:lang==="ar"?`تم تفعيل باقة ${n} دروس!`:`${n}-lesson pack activated!`));
                        }catch(e){showToast("❌ "+e.message);}
                        finally{setPackCreating(false);}
                      }} style={{width:"100%",background:n===8?"linear-gradient(135deg,#5B4FE8,#0ABFA3)":"#F8FAFF",border:n===8?"none":"1.5px solid #E2E8F0",borderRadius:14,padding:"14px 16px",marginBottom:10,textAlign:"start",cursor:"pointer",position:"relative"}}>
                        {n===8&&<div style={{position:"absolute",top:-8,right:12,background:"#F59E0B",color:"#fff",fontSize:11,fontWeight:800,padding:"2px 10px",borderRadius:20}}>⭐ {lang==="fr"?"Populaire":lang==="ar"?"الأكثر طلباً":"Most popular"}</div>}
                        <div style={{fontWeight:800,fontSize:15,color:n===8?"#fff":"#1A1A2E",marginBottom:4}}>{n} {lang==="fr"?"cours":lang==="ar"?"دروس":"lessons"}{discount>0&&<span style={{fontSize:12,marginLeft:8,background:n===8?"rgba(255,255,255,.2)":"#EEF2FF",color:n===8?"#fff":"#5B4FE8",borderRadius:10,padding:"1px 8px"}}>-{discount*100}%</span>}</div>
                        <div style={{fontSize:13,color:n===8?"rgba(255,255,255,.85)":"#64748B"}}>{discountedPrice} AED {lang==="fr"?"/ cours":lang==="ar"?"/ درس":"/ lesson"} · <strong style={{color:n===8?"#fff":"#1A1A2E"}}>{total} AED {lang==="fr"?"au total":lang==="ar"?"الإجمالي":"total"}</strong></div>
                      </button>
                    );
                  })}
                  <button className="btn-ghost" style={{width:"100%",marginTop:4}} onClick={()=>setShowPackModal(false)}>{lang==="fr"?"Annuler":lang==="ar"?"إلغاء":"Cancel"}</button>
                  {packCreating&&<div style={{textAlign:"center",marginTop:8,fontSize:13,color:"#64748B"}}>⏳ {lang==="fr"?"Création du pack...":lang==="ar"?"جاري إنشاء الباقة...":"Creating pack..."}</div>}
                </div>
              </div>
            )}

            {/* MODAL ANNULATION PACK */}
            {showCancelPackConfirm&&activePack&&(
              <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
                <div style={{background:"#fff",borderRadius:20,padding:"2rem",maxWidth:400,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.2)",textAlign:"center"}}>
                  <div style={{fontSize:40,marginBottom:12}}>📦</div>
                  <div style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,marginBottom:8,color:"#1A1A2E"}}>
                    {lang==="fr"?"Annuler le pack ?":lang==="ar"?"إلغاء الباقة؟":"Cancel the pack?"}
                  </div>
                  <div style={{fontSize:13,color:"#64748B",marginBottom:6,lineHeight:1.6}}>
                    {lang==="fr"?`Tu seras remboursé(e) pour ${activePack.total_lessons-activePack.lessons_done} cours non-utilisés.`:lang==="ar"?`سيتم استرداد ${activePack.total_lessons-activePack.lessons_done} درس غير مستخدم.`:`You'll be refunded for ${activePack.total_lessons-activePack.lessons_done} unused lessons.`}
                  </div>
                  <div style={{fontWeight:900,fontSize:22,color:"#0ABFA3",marginBottom:"1.5rem"}}>
                    {(activePack.total_lessons-activePack.lessons_done)*activePack.price_per_lesson_aed} AED
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button className="btn-ghost" style={{flex:1}} onClick={()=>setShowCancelPackConfirm(false)}>
                      {lang==="fr"?"Retour":lang==="ar"?"رجوع":"Go back"}
                    </button>
                    <button style={{flex:1,background:"#DC2626",color:"#fff",border:"none",borderRadius:12,padding:"12px",fontWeight:800,fontSize:14,cursor:"pointer"}} onClick={async()=>{
                      try{
                        await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/cancel-pack",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({packId:activePack.id})});
                        await supabase.from("packs").update({status:"cancelled"}).eq("id",activePack.id);
                        setActivePack(null);setShowCancelPackConfirm(false);
                        showToast("✅ "+(lang==="fr"?"Pack annulé — remboursement en cours":lang==="ar"?"تم إلغاء الباقة — الاسترداد قيد المعالجة":"Pack cancelled — refund processing"));
                      }catch(e){showToast("❌ "+e.message);}
                    }}>
                      {lang==="fr"?"Confirmer l'annulation":lang==="ar"?"تأكيد الإلغاء":"Confirm cancellation"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL CONFIRMATION ANNULATION */}
            {showCancelConfirm&&(
              <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
                <div style={{background:"#fff",borderRadius:20,padding:"2rem",maxWidth:400,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.2)",textAlign:"center"}}>
                  <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
                  <div style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,marginBottom:8,color:"#1A1A2E"}}>
                    {lang==="fr"?"Annuler la réservation ?":lang==="ar"?"إلغاء الحجز؟":"Cancel the booking?"}
                  </div>
                  <div style={{fontSize:13,color:"#64748B",marginBottom:"1.5rem",lineHeight:1.6}}>
                    {lang==="fr"?"L'autorisation bancaire sera annulée. Le prof sera notifié. Cette action est irréversible.":lang==="ar"?"سيتم إلغاء التفويض البنكي وإخطار المدرس. هذا الإجراء لا يمكن التراجع عنه.":"The bank authorization will be cancelled and the tutor notified. This cannot be undone."}
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button className="btn-ghost" style={{flex:1}} onClick={()=>setShowCancelConfirm(false)}>
                      {lang==="fr"?"Retour":lang==="ar"?"رجوع":"Go back"}
                    </button>
                    <button style={{flex:1,background:"#DC2626",color:"#fff",border:"none",borderRadius:12,padding:"12px",fontWeight:800,fontSize:14,cursor:"pointer",opacity:cancellingBooking?0.6:1}} disabled={cancellingBooking} onClick={async()=>{
                      setCancellingBooking(true);
                      try{
                        await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/cancel-booking",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bookingId:activeBooking?.id})});
                        if(activeRequest?.id) await supabase.from("requests").update({status:"cancelled"}).eq("id",activeRequest.id);
                        // Email au prof
                        if(activeBooking?.teacher?.email){
                          fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"booking_cancelled",teacherEmail:activeBooking.teacher.email,teacherName:activeBooking.teacher.full_name,studentName:userProfile?.full_name,subject:activeRequest?.subject,lang})}).catch(()=>{});
                        }
                        setShowCancelConfirm(false);setRecurringSetup(null);setShowRecurringModal(false);
                        setStudentState("idle");setActiveRequest(null);setActiveBooking(null);setSelectedOffer(null);setActiveOffers([]);setWaitingSeconds(0);setRequestViews(0);
                        const updated=await loadAllStudentRequests(user?.id||"");
                        setStudentView(updated.length>0?"list":"form");
                        showToast(lang==="fr"?"Réservation annulée.":lang==="ar"?"تم إلغاء الحجز.":"Booking cancelled.");
                      }catch(e){showToast("❌ "+(lang==="fr"?"Erreur lors de l'annulation":"Cancellation error"));}
                      finally{setCancellingBooking(false);}
                    }}>
                      {cancellingBooking?"⏳ "+(lang==="fr"?"Annulation...":"Cancelling..."):(lang==="fr"?"Confirmer l'annulation":lang==="ar"?"تأكيد الإلغاء":"Confirm cancellation")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL MESSAGERIE */}
            {showChat&&(
              <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.7)",zIndex:2001,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0"}}>
                <div style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px rgba(0,0,0,.2)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"1rem 1.25rem",borderBottom:"1px solid #E2E8F0"}}>
                    <div style={{fontWeight:900,fontSize:16,color:"#1A1A2E"}}>💬 {activeBooking?.teacher?.full_name}</div>
                    <button style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9CA3AF"}} onClick={()=>setShowChat(false)}>✕</button>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:"1rem",display:"flex",flexDirection:"column",gap:8}}>
                    {chatMessages.length===0&&(
                      <div style={{textAlign:"center",color:"#9CA3AF",fontSize:13,padding:"2rem 0"}}>
                        {lang==="fr"?"Pas encore de messages. Dis bonjour !":lang==="ar"?"لا رسائل بعد. قل مرحباً !":"No messages yet. Say hello!"}
                      </div>
                    )}
                    {chatMessages.map((msg,i)=>{
                      const isMe=msg.sender_id===user?.id;
                      return(
                        <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
                          <div style={{background:isMe?"#5B4FE8":"#F1F5F9",color:isMe?"#fff":"#1A1A2E",borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"10px 14px",maxWidth:"80%",fontSize:14,lineHeight:1.5}}>
                            {msg.content}
                          </div>
                          <div style={{fontSize:11,color:"#9CA3AF",marginTop:3}}>{msg.sender_name} · {new Date(msg.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{padding:"0.75rem 1rem",borderTop:"1px solid #E2E8F0",display:"flex",gap:8}}>
                    <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChatMessage();}}} placeholder={lang==="fr"?"Écris un message...":lang==="ar"?"اكتب رسالة...":"Write a message..."} style={{flex:1,padding:"10px 14px",border:"1.5px solid #E2E8F0",borderRadius:12,fontSize:14,fontFamily:"inherit",outline:"none"}} />
                    <button onClick={sendChatMessage} disabled={sendingMsg||!chatInput.trim()} style={{background:"#5B4FE8",color:"#fff",border:"none",borderRadius:12,padding:"10px 16px",fontSize:18,cursor:"pointer",opacity:sendingMsg||!chatInput.trim()?0.5:1}}>➤</button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL COURS RÉCURRENTS */}
            {showRecurringModal&&(
              <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.7)",zIndex:2001,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
                <div style={{background:"#fff",borderRadius:24,padding:"2rem 1.5rem",maxWidth:400,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.25)",textAlign:"center"}}>
                  <div style={{fontSize:48,marginBottom:12}}>🔄</div>
                  <div style={{fontFamily:"Fraunces,serif",fontSize:21,fontWeight:900,marginBottom:8,color:"#1A1A2E"}}>
                    {lang==="fr"?"Cours réguliers ?":lang==="ar"?"دروس منتظمة؟":"Regular lessons?"}
                  </div>
                  <div style={{fontSize:13,color:"#64748B",marginBottom:"1.75rem",lineHeight:1.65}}>
                    {lang==="fr"?`Continue avec ${activeBooking?.teacher?.full_name} — on te rappelle avant chaque séance.`:lang==="ar"?`استمر مع ${activeBooking?.teacher?.full_name} — سنذكّرك قبل كل حصة.`:`Keep learning with ${activeBooking?.teacher?.full_name} — we'll remind you before each session.`}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <button onClick={()=>handleSetupRecurring("weekly")} style={{background:"linear-gradient(135deg,#5B4FE8,#7C73F0)",color:"#fff",border:"none",borderRadius:14,padding:"14px 20px",fontSize:15,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                      📅 {lang==="fr"?"Toutes les semaines":lang==="ar"?"كل أسبوع":"Every week"}
                    </button>
                    <button onClick={()=>handleSetupRecurring("biweekly")} style={{background:"#F1F5F9",color:"#1A1A2E",border:"1.5px solid #E2E8F0",borderRadius:14,padding:"14px 20px",fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                      📆 {lang==="fr"?"Toutes les 2 semaines":lang==="ar"?"كل أسبوعين":"Every 2 weeks"}
                    </button>
                    <button onClick={()=>setShowRecurringModal(false)} style={{background:"transparent",color:"#94A3B8",border:"none",borderRadius:14,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==="fr"?"Non merci":lang==="ar"?"لا شكراً":"No thanks"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ÉTAT 5 — rate */}
            {studentState==="rate"&&<div style={{maxWidth:480,margin:"0 auto",textAlign:"center",padding:"2rem 0"}}>
              <div style={{fontSize:56,marginBottom:"1rem"}}>⭐</div>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:8}}>{lang==="fr"?"Comment s'est passé le cours ?":lang==="ar"?"كيف كانت الحصة؟":"How was the lesson?"}</div>
              <div style={{fontSize:14,color:"#64748B",marginBottom:"2rem",lineHeight:1.7}}>{lang==="fr"?"Ta note aide les autres familles à choisir.":lang==="ar"?"تقييمك يساعد الأسر الأخرى.":"Your rating helps other families choose."}</div>
              <div style={{fontSize:14,color:"#5B4FE8",fontWeight:700,marginBottom:"1rem",minHeight:22}}>
                {hoveredStar===1?(lang==="fr"?"Décevant":lang==="ar"?"مخيب":"Disappointing"):hoveredStar===2?(lang==="fr"?"Passable":lang==="ar"?"مقبول":"Fair"):hoveredStar===3?(lang==="fr"?"Bien":lang==="ar"?"جيد":"Good"):hoveredStar===4?(lang==="fr"?"Très bien":lang==="ar"?"جيد جداً":"Very good"):hoveredStar===5?(lang==="fr"?"Excellent !":lang==="ar"?"ممتاز !":"Excellent!"):""}
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:"1.5rem"}}>
                {[1,2,3,4,5].map(star=>(
                  <div key={star}
                    style={{fontSize:44,cursor:"pointer",transition:"transform .15s,filter .15s",transform:star<=hoveredStar?"scale(1.2)":"scale(1)",filter:star<=hoveredStar?"drop-shadow(0 0 8px rgba(245,166,35,.6))":"grayscale(0.3)"}}
                    onMouseEnter={()=>setHoveredStar(star)}
                    onMouseLeave={()=>setHoveredStar(0)}
                    onClick={async()=>{
                      try{await supabase.from("reviews").insert({booking_id:activeBooking?.id,teacher_id:activeBooking?.teacher_id,student_id:user?.id,score:star,comment:reviewComment||null});}catch(e){}
                      const teacherName=activeBooking?.teacher?.full_name;
                      const subject=activeRequest?.subject;
                      const teacherId=activeBooking?.teacher_id;
                      setLastCompletedTeacher(teacherName&&teacherId&&subject?{name:teacherName,id:teacherId,subject}:null);
                      setHoveredStar(0);setReviewComment("");
                      setStudentState("post_rate");
                      setActiveRequest(null);setActiveBooking(null);setSelectedOffer(null);setActiveOffers([]);setPayResult(null);setWaitingSeconds(0);setStripeError("");setRequestViews(0);
                      const {data:cb}=await supabase.from("bookings").select("gross_price_aed").eq("poster_id",user?.id).eq("status","completed");
                      setStudentStats({totalLessons:cb?.length||0,totalSpent:cb?.reduce((s,b)=>s+b.gross_price_aed,0)||0});
                      showToast("⭐ "+(lang==="fr"?"Merci !":lang==="ar"?"شكراً !":"Thanks!"));
                    }}>{star<=hoveredStar?"⭐":"☆"}</div>
                ))}
              </div>
              <textarea
                placeholder={lang==="fr"?"Laisse un commentaire (optionnel)...":lang==="ar"?"اترك تعليقاً (اختياري)...":"Leave a comment (optional)..."}
                value={reviewComment}
                onChange={e=>setReviewComment(e.target.value)}
                style={{width:"100%",padding:"12px 16px",border:"1.5px solid #E2E8F0",borderRadius:12,fontSize:13,fontFamily:"inherit",resize:"vertical",minHeight:80,marginBottom:"1.5rem",outline:"none",lineHeight:1.6}}
              />
              <button className="btn-ghost" onClick={()=>{setHoveredStar(0);setReviewComment("");setStudentState("idle");setActiveRequest(null);setActiveBooking(null);setSelectedOffer(null);setActiveOffers([]);setPayResult(null);setWaitingSeconds(0);setStripeError("");setRequestViews(0);}}>
                {lang==="fr"?"Passer":lang==="ar"?"تخطي":"Skip"}
              </button>
            </div>}

            {/* ÉTAT 6 — post_rate */}
            {studentState==="post_rate"&&<div style={{maxWidth:480,margin:"0 auto",textAlign:"center",padding:"2rem 0"}}>
              <div style={{fontSize:48,marginBottom:"1rem"}}>🙌</div>
              <div style={{fontFamily:"Fraunces,serif",fontSize:20,fontWeight:900,marginBottom:8}}>{lang==="fr"?"Super, merci !":lang==="ar"?"رائع، شكراً !":"Great, thanks!"}</div>
              <div style={{fontSize:14,color:"#64748B",marginBottom:"2rem"}}>{lang==="fr"?"Que veux-tu faire maintenant ?":lang==="ar"?"ماذا تريد أن تفعل الآن؟":"What would you like to do now?"}</div>
              <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:360,margin:"0 auto"}}>
                {lastCompletedTeacher&&(
                  <button className="btn-full" style={{background:"#0ABFA3"}} onClick={()=>{setForm(f=>({...f,subject:lastCompletedTeacher.subject}));setStudentState("idle");showToast(lang==="fr"?`✅ Reprendre avec ${lastCompletedTeacher.name}`:`✅ Continue with ${lastCompletedTeacher.name}`);}}>
                    🔄 {lang==="fr"?`Reprendre avec ${lastCompletedTeacher.name}`:lang==="ar"?`الاستمرار مع ${lastCompletedTeacher.name}`:`Continue with ${lastCompletedTeacher.name}`}
                  </button>
                )}
                <button className="btn-full" onClick={async()=>{if(lastCompletedTeacher)setForm(f=>({...f,subject:lastCompletedTeacher.subject}));setLastCompletedTeacher(null);setStudentState("idle");setStudentView("form");}}>
                  📋 {lang==="fr"?"Poster une nouvelle annonce":lang==="ar"?"نشر إعلان جديد":"Post a new request"}
                </button>
                <button className="btn-ghost" onClick={()=>{setStudentState("idle");setLastCompletedTeacher(null);setAppTab("student-history");}}>
                  📅 {lang==="fr"?"Voir mes cours":lang==="ar"?"عرض دروسي":"View my lessons"}
                </button>
              </div>
            </div>}

            </div>}

          </div>}

          {appTab==="student-history"&&<div style={{maxWidth:560,margin:"0 auto"}}>
            <div className="page-title">{lang==="fr"?"Mes cours":lang==="ar"?"دروسي":"My lessons"}</div>
            <div className="page-sub">{lang==="fr"?"Historique de tous tes cours":lang==="ar"?"سجل جميع دروسك":"All your lesson history"}</div>
            <StudentHistory userId={user?.id} lang={lang} onBookAgain={(subject,teacherName)=>{setAppTab("student-home");setStudentState("idle");setForm(f=>({...f,subject}));showToast(lang==="fr"?`🔄 Reprendre avec ${teacherName}`:`🔄 Continue with ${teacherName}`);}} />
          </div>}


          {appTab==="teacher-home"&&showOnboard&&<>
            {/* Progress bar */}
            <div style={{marginBottom:"1.5rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                {[
                  lang==="fr"?"Profil":lang==="ar"?"الملف":"Profile",
                  lang==="fr"?"Matières":lang==="ar"?"المواد":"Subjects",
                  lang==="fr"?"Documents":lang==="ar"?"الوثائق":"Documents",
                ].map((label,i)=>(
                  <div key={i} style={{flex:1,textAlign:"center",fontSize:11,fontWeight:700,color:teacherOnboardStep>i+1?"#0ABFA3":teacherOnboardStep===i+1?"#5B4FE8":"#9CA3AF"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",margin:"0 auto 4px",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,background:teacherOnboardStep>i+1?"#0ABFA3":teacherOnboardStep===i+1?"#5B4FE8":"#E5E7EB",color:teacherOnboardStep>=i+1?"#fff":"#9CA3AF",transition:"all .3s"}}>
                      {teacherOnboardStep>i+1?"✓":i+1}
                    </div>
                    {label}
                  </div>
                ))}
              </div>
              <div style={{height:4,background:"#E5E7EB",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${((teacherOnboardStep-1)/2)*100}%`,background:"linear-gradient(90deg,#5B4FE8,#0ABFA3)",borderRadius:2,transition:"width .4s ease"}}/>
              </div>
            </div>

            {/* STEP 1 — Profil */}
            {teacherOnboardStep===1&&<>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:6,color:"#1A1A2E"}}>
                {lang==="fr"?"Parle-nous de toi":lang==="ar"?"أخبرنا عنك":"Tell us about yourself"}
              </div>
              <div style={{fontSize:14,color:"#6B7280",marginBottom:"1.5rem"}}>{lang==="fr"?"Ces infos apparaîtront sur ton profil":lang==="ar"?"ستظهر هذه المعلومات في ملفك":"This info will appear on your profile"}</div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.name}</label><input className="form-input" placeholder="Sarah Al-Mansouri" value={teacherForm.name} onChange={e=>setTeacherForm({...teacherForm,name:e.target.value})} /></div>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.email}</label><input className="form-input" type="email" placeholder="sarah@email.com" value={teacherForm.email} onChange={e=>setTeacherForm({...teacherForm,email:e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">{t.onboard.bio}</label><textarea className="form-textarea" placeholder={t.onboard.bioPh} value={teacherForm.bio} onChange={e=>setTeacherForm({...teacherForm,bio:e.target.value})} /></div>
              <div className="form-group">
                <label className="form-label">📸 {lang==="fr"?"Photo de profil (optionnel)":lang==="ar"?"صورة الملف الشخصي (اختياري)":"Profile photo (optional)"}</label>
                <div className="upload-zone" onClick={()=>document.getElementById('photo-upload').click()} style={{textAlign:"center"}}>
                  {teacherForm.photoFile
                    ?<><div style={{fontSize:28}}>✅</div><div style={{fontSize:12,fontWeight:700,color:"#0ABFA3",marginTop:4}}>{(teacherForm.photoFile as File).name}</div></>
                    :<><div style={{fontSize:28}}>👤</div><div style={{fontSize:12,fontWeight:700,color:"#5B4FE8",marginTop:4}}>{lang==="fr"?"Clique pour ajouter ta photo":lang==="ar"?"انقر لإضافة صورتك":"Click to add your photo"}</div></>}
                </div>
                <input id="photo-upload" type="file" accept="image/*" style={{display:"none"}} onChange={e=>setTeacherForm({...teacherForm,photoFile:e.target.files?.[0]||null})} />
              </div>
              <div className="form-group">
                <label className="form-label">💬 WhatsApp {lang==="fr"?"(optionnel)":lang==="ar"?"(اختياري)":"(optional)"}</label>
                <input className="form-input" placeholder="+971 50 123 4567" value={teacherForm.whatsapp} onChange={e=>setTeacherForm({...teacherForm,whatsapp:e.target.value.replace(/\s/g,"")})} />
              </div>
              <button className="submit-btn" onClick={()=>{
                if(!teacherForm.name||!teacherForm.email){showToast("⚠️ "+(lang==="fr"?"Nom et email requis":lang==="ar"?"الاسم والبريد مطلوبان":"Name and email required"));return;}
                setTeacherOnboardStep(2);window.scrollTo(0,0);
              }}>{lang==="fr"?"Continuer →":lang==="ar"?"متابعة ←":"Continue →"}</button>
            </>}

            {/* STEP 2 — Matières & Tarif */}
            {teacherOnboardStep===2&&<>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:6,color:"#1A1A2E"}}>
                {lang==="fr"?"Que vas-tu enseigner ?":lang==="ar"?"ماذا ستدرّس؟":"What will you teach?"}
              </div>
              <div style={{fontSize:14,color:"#6B7280",marginBottom:"1.5rem"}}>{lang==="fr"?"Sélectionne tout ce qui correspond":lang==="ar"?"اختر كل ما ينطبق عليك":"Select everything that applies"}</div>
              <div className="form-group"><label className="form-label">{t.onboard.cycle}</label><div className="chips-row">{t.cycles.map(c=><div key={c} className={`chip${teacherForm.cycles.includes(c)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,cycles:[c]})}>{c}</div>)}</div></div>
              <div className="form-group"><label className="form-label">{t.onboard.curriculum}</label><div className="chips-row">{Object.entries(CURRICULA).map(([k,v])=><div key={k} className={`chip${teacherForm.curricula.includes(k)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,curricula:toggleArr(teacherForm.curricula,k)})}>{v.label[lang]}</div>)}</div></div>
              <div className="form-group"><label className="form-label">{t.onboard.subjects}</label><div className="chips-row">{SUBJECTS.map(s=><div key={s.en} className={`chip${teacherForm.subjects.includes(s.en)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,subjects:toggleArr(teacherForm.subjects,s.en)})}>{s[lang]}</div>)}</div></div>
              <div className="form-group"><label className="form-label">{t.onboard.langTeach}</label><div className="chips-row">{t.instrLangs.map(l=><div key={l} className={`chip${teacherForm.instrLangs.includes(l)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,instrLangs:toggleArr(teacherForm.instrLangs,l)})}>{l}</div>)}</div></div>
              <div className="form-group">
                <label className="form-label">{t.onboard.rate}</label>
                <div className="rate-chips">{TEACHER_RATES.map(r=><div key={r} className={`rate-chip${teacherForm.rate===r?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,rate:r})}>{fmtPrice(r,country)}/h</div>)}</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:6}}>{t.teacher.rateHint} → {fmtPrice(Math.round(teacherForm.rate*(1-TEACHER_FEE)),country)}/h</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>{setTeacherOnboardStep(1);window.scrollTo(0,0);}}>← {lang==="fr"?"Retour":lang==="ar"?"رجوع":"Back"}</button>
                <button className="submit-btn" style={{flex:2,marginTop:0}} onClick={()=>{
                  if(!teacherForm.subjects.length||!teacherForm.instrLangs.length){showToast("⚠️ "+(lang==="fr"?"Choisis au moins une matière et une langue":lang==="ar"?"اختر مادة ولغة على الأقل":"Choose at least one subject and language"));return;}
                  setTeacherOnboardStep(3);window.scrollTo(0,0);
                }}>{lang==="fr"?"Continuer →":lang==="ar"?"متابعة ←":"Continue →"}</button>
              </div>
            </>}

            {/* STEP 3 — Documents & Paiement */}
            {teacherOnboardStep===3&&<>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:6,color:"#1A1A2E"}}>
                {lang==="fr"?"Documents & paiement":lang==="ar"?"الوثائق والدفع":"Documents & payment"}
              </div>
              <div style={{fontSize:14,color:"#6B7280",marginBottom:"1.5rem"}}>{lang==="fr"?"Dernière étape — sécurisée et chiffrée":lang==="ar"?"الخطوة الأخيرة — آمنة ومشفّرة":"Last step — secure and encrypted"}</div>
              <div style={{fontSize:12,color:"#6B7280",marginBottom:12,fontWeight:600}}>ℹ️ {t.onboard.idDocHint}</div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.onboard.idDoc}</label>
                  <div className="upload-zone" onClick={()=>document.getElementById('id-upload').click()}>
                    {teacherForm.idFile?<><div style={{fontSize:28}}>✅</div><div style={{fontSize:12,fontWeight:700,color:"#0ABFA3",marginTop:4}}>{teacherForm.idFile.name}</div></>:<><div style={{fontSize:28}}>🪪</div><div style={{fontSize:12,fontWeight:700,color:"#5B4FE8",marginTop:4}}>{t.onboard.idPh}</div></>}
                  </div>
                  <input id="id-upload" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>setTeacherForm({...teacherForm,idFile:e.target.files[0]})} />
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.onboard.diploma}</label>
                  <div className="upload-zone" onClick={()=>document.getElementById('diploma-upload').click()}>
                    {teacherForm.diplomaFile?<><div style={{fontSize:28}}>✅</div><div style={{fontSize:12,fontWeight:700,color:"#0ABFA3",marginTop:4}}>{teacherForm.diplomaFile.name}</div></>:<><div style={{fontSize:28}}>📜</div><div style={{fontSize:12,fontWeight:700,color:"#5B4FE8",marginTop:4}}>{t.onboard.diplomaPh}</div></>}
                  </div>
                  <input id="diploma-upload" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>setTeacherForm({...teacherForm,diplomaFile:e.target.files[0]})} />
                </div>
              </div>
              <div className="section-divider">🏦 {t.onboard.banking}</div>
              <div className="banking-card">
                <div style={{fontSize:12,color:"#92400E",fontWeight:600,marginBottom:"1rem"}}>🔒 {t.onboard.bankHint}</div>
                <div className="form-group"><label className="form-label">{t.onboard.bankName}</label><input className="form-input" placeholder="Wio Bank, Emirates NBD, QNB, ADCB..." value={teacherForm.bankName} onChange={e=>setTeacherForm({...teacherForm,bankName:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">{t.onboard.bankIban}</label><input className="form-input" placeholder="AE07 0331 2345 6789 0123 456" value={teacherForm.bankIban} onChange={e=>setTeacherForm({...teacherForm,bankIban:e.target.value})} /></div>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.bankHolder}</label><input className="form-input" placeholder="Sarah Al-Mansouri" value={teacherForm.bankHolder} onChange={e=>setTeacherForm({...teacherForm,bankHolder:e.target.value})} /></div>
              </div>
              <div className="form-group">
                <label className="form-label">💳 {t.onboard.withdrawal}</label>
                <div className="chips-row">{[["wI",t.onboard.wI],["wW",t.onboard.wW],["wM",t.onboard.wM]].map(([k,v])=><div key={k} className={`chip${teacherForm.withdrawal===k?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,withdrawal:k})}>{v}</div>)}</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:6}}>⚠️ {t.onboard.wInfo}</div>
              </div>
              <div className="section-divider">📄 {lang==="fr"?"Conditions générales":lang==="ar"?"الشروط والأحكام":"Terms & Conditions"}</div>
              <div style={{background:"#FAFBFF",border:"1.5px solid #E8EAF6",borderRadius:14,padding:"1.25rem",marginBottom:"1rem"}}>
                <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",marginBottom:12}}>
                  <input type="checkbox" checked={teacherForm.cguAccepted} onChange={e=>setTeacherForm({...teacherForm,cguAccepted:e.target.checked})} style={{width:18,height:18,marginTop:2,accentColor:"#5B4FE8",flexShrink:0}} />
                  <span style={{fontSize:13,color:"#374151",fontWeight:600,lineHeight:1.5}}>
                    {lang==="fr"?"J'ai lu et j'accepte les ":lang==="ar"?"لقد قرأت وأوافق على ":"I have read and accept the "}
                    <span style={{color:"#5B4FE8",cursor:"pointer",textDecoration:"underline"}} onClick={()=>setPage("legal")}>
                      {lang==="fr"?"Conditions Générales d'Utilisation":lang==="ar"?"شروط الخدمة":"Terms of Service"}
                    </span>
                    {lang==="fr"?" et la ":" and the "}
                    <span style={{color:"#5B4FE8",cursor:"pointer",textDecoration:"underline"}} onClick={()=>setPage("legal")}>
                      {lang==="fr"?"Politique de Confidentialité":lang==="ar"?"سياسة الخصوصية":"Privacy Policy"}
                    </span>
                  </span>
                </label>
                <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
                  <input type="checkbox" checked={teacherForm.childProtectionAccepted} onChange={e=>setTeacherForm({...teacherForm,childProtectionAccepted:e.target.checked})} style={{width:18,height:18,marginTop:2,accentColor:"#5B4FE8",flexShrink:0}} />
                  <span style={{fontSize:13,color:"#374151",fontWeight:600,lineHeight:1.5}}>
                    {lang==="fr"?"J'accepte la ":lang==="ar"?"أوافق على ":"I accept the "}
                    <span style={{color:"#5B4FE8",cursor:"pointer",textDecoration:"underline"}} onClick={()=>setPage("legal")}>
                      {lang==="fr"?"Charte de Protection des Mineurs":lang==="ar"?"ميثاق حماية الأطفال":"Child Protection Charter"}
                    </span>
                    {lang==="fr"?" et l'":"  and the "}
                    <span style={{color:"#5B4FE8",cursor:"pointer",textDecoration:"underline"}} onClick={()=>setPage("legal")}>
                      {lang==="fr"?"Accord Enseignant":"Tutor Agreement"}
                    </span>
                  </span>
                </label>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>{setTeacherOnboardStep(2);window.scrollTo(0,0);}}>← {lang==="fr"?"Retour":lang==="ar"?"رجوع":"Back"}</button>
                <button className="submit-btn" style={{flex:2,marginTop:0,opacity:(!teacherForm.cguAccepted||!teacherForm.childProtectionAccepted)?0.5:1}} onClick={handleTeacherSubmit} disabled={!teacherForm.cguAccepted||!teacherForm.childProtectionAccepted}>
                  {t.onboard.submit}
                </button>
              </div>
            </>}
          </>}

          {/* ÉTAT A — idle */}
          {appTab==="teacher-home"&&!showOnboard&&teacherState==="idle"&&(
            <div style={{maxWidth:560,margin:"0 auto"}}>
              <div style={{marginBottom:"1.5rem"}}>
                <div className="page-title">{lang==="fr"?"Bonjour":lang==="ar"?"مرحباً":"Hello"}, {displayName} 👋</div>
                <div className="page-sub">{lang==="fr"?"Aucune nouvelle annonce pour l'instant.":lang==="ar"?"لا توجد إعلانات جديدة الآن.":"No new requests right now."}</div>
              </div>
              {(!userProfile?.teaching_subjects?.length||!userProfile?.teaching_langs?.length)&&(
                <div className="banner banner-amber" style={{cursor:"pointer",marginBottom:"1.5rem"}} onClick={openTeacherOnboard}>
                  <div>
                    <div style={{fontWeight:800,marginBottom:4}}>⚠️ {lang==="fr"?"Profil incomplet":lang==="ar"?"ملف غير مكتمل":"Incomplete profile"}</div>
                    <div style={{fontSize:12}}>{lang==="fr"?"Complète ton profil pour recevoir des annonces →":lang==="ar"?"أكمل ملفك لتستلم إعلانات →":"Complete your profile to receive matching requests →"}</div>
                  </div>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:"1.5rem"}}>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.thisMonth} AED</div><div className="stat-lbl">{lang==="fr"?"Ce mois":"This month"}</div></div>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.courses}</div><div className="stat-lbl">{lang==="fr"?"Cours effectués":"Lessons done"}</div></div>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.rating?`${teacherRevenue.rating}★`:"—"}</div><div className="stat-lbl">{lang==="fr"?"Note moyenne":"Avg rating"}</div></div>
                <div className="stat-card"><div className="stat-val" style={{color:"#0ABFA3"}}>{teacherRevenue.pending} AED</div><div className="stat-lbl">{lang==="fr"?"En attente":"Pending"}</div></div>
              </div>
              <div style={{background:"#F8FAFF",border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem"}}>
                <div style={{fontWeight:800,fontSize:14,marginBottom:12}}>🎓 {lang==="fr"?"Ton profil":lang==="ar"?"ملفك":"Your profile"}</div>
                {userProfile?.teaching_subjects?.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                    {userProfile.teaching_subjects.map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return <span key={s} className="badge badge-purple">{subj?subj[lang]:s}</span>;})}
                  </div>
                )}
                {userProfile?.teaching_langs?.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                    {userProfile.teaching_langs.map(l=><span key={l} className="badge badge-green">🗣 {l}</span>)}
                  </div>
                )}
                {userProfile?.teaching_rate&&(
                  <div style={{fontSize:13,color:"#64748B",fontWeight:600,marginBottom:12}}>
                    💰 {userProfile.teaching_rate} AED/h → <strong style={{color:"#0ABFA3"}}>{Math.round(userProfile.teaching_rate*0.94)} AED</strong>{lang==="fr"?" après commission":" after fee"}
                  </div>
                )}
                <button className="btn-ghost" style={{width:"100%"}} onClick={()=>{
                  setTeacherForm(f=>({
                    ...f,
                    name: userProfile?.full_name || "",
                    cycles: userProfile?.teaching_cycles || [],
                    subjects: userProfile?.teaching_subjects || [],
                    instrLangs: userProfile?.teaching_langs || [],
                    rate: userProfile?.teaching_rate || 150,
                    curricula: userProfile?.teaching_curricula || [],
                    bankName: userProfile?.bank_name || "",
                    bankIban: userProfile?.bank_iban || "",
                    bankHolder: userProfile?.bank_holder || "",
                    withdrawal: userProfile?.withdrawal_frequency || "wW",
                  }));
                  openTeacherOnboard();
                }}>✏️ {lang==="fr"?"Modifier mon profil":lang==="ar"?"تعديل ملفي":"Edit my profile"}</button>
              </div>
            </div>
          )}

          {/* ÉTAT B — has_requests */}
          {appTab==="teacher-home"&&!showOnboard&&teacherState==="has_requests"&&(
            <div style={{maxWidth:560,margin:"0 auto"}}>
              <div style={{background:"#5B4FE8",borderRadius:18,padding:"1.25rem 1.5rem",marginBottom:"1.5rem",display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:32}}>🔔</div>
                <div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:900,color:"#fff",marginBottom:4}}>{matchedRequests.length} {lang==="fr"?"nouvelle(s) annonce(s) !":lang==="ar"?"إعلان جديد !":"new request(s)!"}</div>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.8)"}}>{lang==="fr"?"Ces élèves correspondent à ton profil":lang==="ar"?"هؤلاء الطلاب يناسبون ملفك":"These students match your profile"}</div>
                </div>
              </div>
              {matchedRequests.map((r,i)=>(
                <div key={r.id||i} className="req-card">
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:20}}>📋</span>
                      <div className="req-title">{r.subject}</div>
                      {i===0&&<span className="badge badge-green" style={{fontSize:10}}>NEW</span>}
                    </div>
                    <span style={{fontSize:11,color:"#9CA3AF",fontWeight:600}}>{timeAgo(r.created_at,lang)}</span>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:r.message?8:12}}>
                    <span className="badge badge-purple">{r.level}</span>
                    <span className="badge badge-blue">🗣 {r.instr_lang}</span>
                    <span className="badge badge-amber">{r.duration_min} min</span>
                    <span className="badge badge-gray">{r.curriculum}</span>
                    <span className="badge badge-green">📹 Online</span>
                  </div>
                  {r.message&&(
                    <div style={{fontSize:13,color:"#64748B",marginBottom:12,fontStyle:"italic",background:"#F8FAFF",borderRadius:8,padding:"8px 12px",borderLeft:"3px solid #D8DBFE"}}>"{r.message}"</div>
                  )}
                  <div style={{background:"#ECFDF5",border:"1.5px solid #A7F3D0",borderRadius:10,padding:"8px 12px",marginBottom:8,fontSize:13,fontWeight:700,color:"#0F6E56"}}>
                    💰 {lang==="fr"?"Gain potentiel":lang==="ar"?"الربح المحتمل":"Potential earning"} <strong>{Math.round((userProfile?.teaching_rate||150)*0.94)} AED</strong>{lang==="fr"?" avec ton tarif actuel":lang==="ar"?" بتعريفتك الحالية":" at your current rate"}
                  </div>
                  {(()=>{const bidCount=(r.bids?.[0]?.count)||0;return bidCount>0?(
                    <div style={{fontSize:11,color:bidCount>=3?"#DC2626":"#92400E",fontWeight:700,background:bidCount>=3?"#FEE2E2":"#FEF3C7",borderRadius:8,padding:"4px 10px",marginBottom:12,display:"inline-flex",alignItems:"center",gap:4}}>
                      {bidCount>=3?"🔥":"⚡"} {lang==="fr"?`${bidCount} offre(s) déjà envoyée(s) — sois rapide !`:lang==="ar"?`${bidCount} عروض مُرسلة — كن سريعاً !`:`${bidCount} offer(s) already sent — act fast!`}
                    </div>
                  ):(
                    <div style={{fontSize:11,color:"#0F6E56",fontWeight:700,background:"#D1FAE5",borderRadius:8,padding:"4px 10px",marginBottom:12,display:"inline-flex",alignItems:"center",gap:4}}>
                      ✨ {lang==="fr"?"Sois le premier à répondre !":lang==="ar"?"كن أول من يرد !":"Be the first to respond!"}
                    </div>
                  );})()}
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn-teal" style={{flex:2}} onClick={()=>{setSelectedRequestForBid(r);setSelectedRate(userProfile?.teaching_rate||150);setBidForm({message:""});setAppTab("teacher-bid");}}>
                      {lang==="fr"?"Faire une offre →":lang==="ar"?"تقديم عرض ←":"Make an offer →"}
                    </button>
                    <button className="btn-ghost" onClick={()=>{const remaining=matchedRequests.filter(x=>x.id!==r.id);setMatchedRequests(remaining);if(remaining.length===0)setTeacherState("idle");}}>
                      {lang==="fr"?"Passer":lang==="ar"?"تجاهل":"Pass"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ÉTAT C — offer_sent */}
          {appTab==="teacher-home"&&!showOnboard&&teacherState==="offer_sent"&&(
            <div style={{maxWidth:520,margin:"0 auto"}}>
              <div style={{textAlign:"center",marginBottom:"1.5rem"}}>
                <div style={{fontSize:44,marginBottom:8,animation:"pulse 2s infinite"}}>📨</div>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:900,marginBottom:6}}>{lang==="fr"?"Offre(s) envoyée(s) !":lang==="ar"?"تم إرسال العرض !":"Offer(s) sent!"}</div>
                <div style={{fontSize:13,color:"#64748B"}}>{lang==="fr"?"Mise à jour automatique toutes les 30 secondes.":lang==="ar"?"تحديث تلقائي كل 30 ثانية.":"Auto-updates every 30 seconds."}</div>
              </div>
              {teacherPendingOffers.map((offer,i)=>(
                <div key={offer.id||i} style={{border:"1.5px solid #D8DBFE",borderRadius:16,padding:"1.25rem",marginBottom:12,background:"#FAFBFF"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontWeight:800,fontSize:15}}>{offer.request?.subject}</div>
                    <span style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:900,color:"#5B4FE8"}}>{offer.net_price_aed} AED/h</span>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                    <span className="badge badge-purple">{offer.request?.level}</span>
                    <span className="badge badge-amber">{offer.request?.duration_min} min</span>
                    <span className="badge badge-amber">⏳ {lang==="fr"?"En attente":"Pending"}</span>
                  </div>
                  <div style={{fontSize:12,color:"#9CA3AF",fontWeight:600}}>{lang==="fr"?"Envoyée":"Sent"} {timeAgo(offer.created_at,lang)}</div>
                </div>
              ))}
              <div style={{background:"#FFF7ED",border:"1.5px solid #FED7AA",borderRadius:14,padding:"1rem",marginBottom:"1.25rem",fontSize:13,color:"#92400E"}}>
                <div style={{fontWeight:800,marginBottom:6}}>💡 {lang==="fr"?"Conseil":lang==="ar"?"نصيحة":"Tip"}</div>
                <div style={{lineHeight:1.6}}>{lang==="fr"?"Les parents répondent en moyenne en 12 minutes. Profites-en pour consulter les nouvelles annonces.":lang==="ar"?"يرد الآباء في المتوسط خلال 12 دقيقة. استغل الوقت لمراجعة الطلبات الجديدة.":"Parents respond in ~12 minutes on average. Check new requests in the meantime."}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:"1rem"}}>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.thisMonth} AED</div><div className="stat-lbl">{lang==="fr"?"Ce mois":"This month"}</div></div>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.courses}</div><div className="stat-lbl">{lang==="fr"?"Cours total":"Total lessons"}</div></div>
              </div>
              {matchedRequests.length>0&&(
                <button className="btn-ghost" style={{width:"100%",marginBottom:8}} onClick={()=>setTeacherState("has_requests")}>
                  🔍 {lang==="fr"?`Voir ${matchedRequests.length} autre(s) annonce(s)`:lang==="ar"?`عرض ${matchedRequests.length} إعلان آخر`:`View ${matchedRequests.length} other request(s)`}
                </button>
              )}
              {teacherPendingOffers.length>0&&(
                <button className="btn-ghost" style={{width:"100%",color:"#DC2626",borderColor:"#FCA5A5",fontSize:12}} onClick={async()=>{
                  if(!confirm(lang==="fr"?"Retirer toutes tes offres en attente ?":lang==="ar"?"سحب جميع عروضك المعلقة؟":"Withdraw all pending offers?")) return;
                  const ids=teacherPendingOffers.map(o=>o.id);
                  await supabase.from("bids").update({status:"withdrawn"}).in("id",ids);
                  setTeacherPendingOffers([]);setTeacherState("idle");
                  showToast(lang==="fr"?"Offres retirées.":lang==="ar"?"تم سحب العروض.":"Offers withdrawn.");
                }}>🗑 {lang==="fr"?"Retirer mes offres":lang==="ar"?"سحب عروضي":"Withdraw my offers"}</button>
              )}
            </div>
          )}

          {/* ÉTAT D — booked */}
          {appTab==="teacher-home"&&!showOnboard&&teacherState==="booked"&&(
            <div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
              <div style={{fontSize:56,marginBottom:"1rem"}}>🎓</div>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:900,marginBottom:8}}>{lang==="fr"?"Cours réservé !":lang==="ar"?"لديك حصة محجوزة !":"Lesson booked!"}</div>
              <div style={{fontSize:14,color:"#64748B",marginBottom:"1.5rem"}}>{lang==="fr"?"Avec":lang==="ar"?"مع":"With"} <strong>{teacherActiveBooking?.student?.full_name}</strong></div>
              <div style={{background:"#F8FAFF",border:"1.5px solid #E2E8F0",borderRadius:16,padding:"1.25rem",marginBottom:"1.5rem",textAlign:"start"}}>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #E2E8F0",fontSize:14}}>
                  <span style={{color:"#64748B"}}>{lang==="fr"?"Élève":lang==="ar"?"الطالب":"Student"}</span>
                  <span style={{fontWeight:700}}>{teacherActiveBooking?.student?.full_name}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #E2E8F0",fontSize:14}}>
                  <span style={{color:"#64748B"}}>{lang==="fr"?"Tu recevras":lang==="ar"?"ستستلم":"You'll receive"}</span>
                  <span style={{fontWeight:900,color:"#0ABFA3",fontFamily:"'Fraunces',serif",fontSize:17}}>{Math.round((teacherActiveBooking?.net_price_aed||0)*0.94)} AED</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:14}}>
                  <span style={{color:"#64748B"}}>{lang==="fr"?"Paiement":lang==="ar"?"الدفع":"Payment"}</span>
                  <span style={{fontWeight:700,color:"#0ABFA3"}}>✓ {lang==="fr"?"Après confirmation élève":lang==="ar"?"بعد تأكيد الطالب":"After student confirms"}</span>
                </div>
              </div>
              {(()=>{
                const jRoom=teacherActiveBooking?.id?`TutorApp-${teacherActiveBooking.id.slice(-8).toUpperCase()}`:null;
                const jLink=jRoom?`https://meet.jit.si/${jRoom}`:null;
                return jLink?(
                  <div style={{background:"#ECFDF5",border:"1.5px solid #A7F3D0",borderRadius:14,padding:"1.25rem",marginBottom:"1.5rem",textAlign:"start"}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#0F6E56",marginBottom:8}}>📹 {lang==="fr"?"Visioconférence":lang==="ar"?"مكالمة فيديو":"Video call"}</div>
                    <button onClick={()=>{setVideoCallUrl(jLink);setShowVideoCall(true);}} style={{width:"100%",background:"#0ABFA3",color:"#fff",border:"none",borderRadius:10,padding:"12px",fontWeight:800,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:8}}>
                      🎥 {lang==="fr"?"Lancer le cours":lang==="ar"?"ابدأ الحصة":"Start lesson"}
                    </button>
                    <button onClick={()=>{navigator.clipboard?.writeText(jLink);showToast("📋 "+(lang==="fr"?"Lien copié !":lang==="ar"?"تم نسخ الرابط !":"Link copied!"));}} style={{width:"100%",background:"#fff",border:"1.5px solid #A7F3D0",borderRadius:10,padding:"8px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#0F6E56"}}>📋 {lang==="fr"?"Copier le lien":lang==="ar"?"نسخ الرابط":"Copy link"}</button>
                  </div>
                ):null;
              })()}
              <div style={{background:"#FEF3C7",border:"1.5px solid #FCD34D",borderRadius:14,padding:"1rem",fontSize:13,color:"#92400E",fontWeight:600,textAlign:"start"}}>
                ⏳ {lang==="fr"?"Tu recevras ton paiement dès que l'élève confirme le cours.":lang==="ar"?"ستستلم دفعتك فور تأكيد الطالب انتهاء الحصة.":"You'll receive payment once the student confirms."}
              </div>
            </div>
          )}

          {/* ÉTAT E — pending_payment */}
          {appTab==="teacher-home"&&!showOnboard&&teacherState==="pending_payment"&&(
            <div style={{maxWidth:480,margin:"0 auto",textAlign:"center",padding:"2rem 0"}}>
              <div style={{fontSize:56,marginBottom:"1rem"}}>💰</div>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:900,marginBottom:8}}>{lang==="fr"?"Paiement en route !":lang==="ar"?"الدفعة في الطريق !":"Payment on its way!"}</div>
              <div style={{fontSize:14,color:"#64748B",marginBottom:"1.5rem"}}>{lang==="fr"?"Le cours est confirmé. Ton virement arrive bientôt.":lang==="ar"?"تم تأكيد الحصة. تحويلك قادم قريباً.":"Lesson confirmed. Your payout is coming soon."}</div>
              <div style={{background:"#ECFDF5",border:"1.5px solid #A7F3D0",borderRadius:16,padding:"1.5rem",marginBottom:"1.5rem"}}>
                <div style={{fontSize:32,fontFamily:"'Fraunces',serif",fontWeight:900,color:"#0ABFA3",marginBottom:8}}>+{Math.round((teacherActiveBooking?.net_price_aed||0)*0.94)} AED</div>
                <div style={{fontSize:13,color:"#0F6E56",fontWeight:600}}>
                  {userProfile?.withdrawal_frequency==="wI"?(lang==="fr"?"Virement immédiat":"Immediate payout"):userProfile?.withdrawal_frequency==="wW"?(lang==="fr"?"Cette semaine":"This week"):(lang==="fr"?"Ce mois":"This month")}
                </div>
              </div>
              <button className="btn-full" onClick={async()=>{
                setTeacherState("idle");setTeacherActiveBooking(null);setTeacherPendingOffers([]);
                const revenue=await getTeacherRevenueStats(user.id);setTeacherRevenue(revenue);
                const requests=await getMatchedRequests(userProfile);setMatchedRequests(requests);
                if(requests.length>0)setTeacherState("has_requests");
              }}>{lang==="fr"?"Voir les nouvelles annonces →":lang==="ar"?"مشاهدة الإعلانات الجديدة ←":"See new requests →"}</button>
            </div>
          )}

          {/* FORMULAIRE OFFRE — teacher-bid */}
          {appTab==="teacher-bid"&&selectedRequestForBid&&!showOnboard&&(
            <div style={{maxWidth:520,margin:"0 auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1.5rem",flexWrap:"wrap"}}>
                <button className="btn-ghost" onClick={()=>{setSelectedRequestForBid(null);setAppTab("teacher-home");}}>
                  {lang==="fr"?"← Retour":lang==="ar"?"← رجوع":"← Back"}
                </button>
                <div>
                  <div className="page-title" style={{marginBottom:0}}>{selectedRequestForBid.subject}</div>
                  <div className="page-sub" style={{marginBottom:0}}>{selectedRequestForBid.level} · {selectedRequestForBid.instr_lang} · {selectedRequestForBid.duration_min} min · 📹 Online</div>
                </div>
              </div>
              {selectedRequestForBid.message&&(
                <div style={{background:"#F8FAFF",border:"1.5px solid #E2E8F0",borderRadius:12,padding:"12px 16px",marginBottom:"1.5rem",fontSize:13,color:"#64748B",fontStyle:"italic",borderLeft:"3px solid #D8DBFE"}}>
                  {lang==="fr"?"L'élève écrit :":lang==="ar"?"كتب الطالب :":"Student writes:"} "{selectedRequestForBid.message}"
                </div>
              )}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:"1.5rem"}}>
                <span className="badge badge-purple">{selectedRequestForBid.level}</span>
                <span className="badge badge-blue">🗣 {selectedRequestForBid.instr_lang}</span>
                <span className="badge badge-amber">{selectedRequestForBid.duration_min} min</span>
                <span className="badge badge-gray">{selectedRequestForBid.curriculum}</span>
              </div>
              <div className="form-group">
                <label className="form-label">{lang==="fr"?"Ton tarif (AED/h)":lang==="ar"?"سعرك (AED/ساعة)":"Your rate (AED/h)"}</label>
                <div className="rate-chips">{TEACHER_RATES.map(r=><div key={r} className={`rate-chip${selectedRate===r?" selected":""}`} onClick={()=>setSelectedRate(r)}>{r} AED/h</div>)}</div>
                <div style={{fontSize:13,color:"#0ABFA3",marginTop:8,fontWeight:700}}>✓ {lang==="fr"?"Tu recevras":lang==="ar"?"ستحصل على":"You receive"} <strong>{Math.round(selectedRate*0.94)} AED/h</strong> {lang==="fr"?"après 6% de frais":lang==="ar"?"بعد رسوم 6٪":"after 6% fee"}</div>
              </div>
              <div className="form-group">
                <label className="form-label">{lang==="fr"?"Ton message à l'élève":lang==="ar"?"رسالتك للطالب":"Your message to the student"}</label>
                <textarea className="form-textarea" style={{minHeight:110}} placeholder={lang==="fr"?"Présente-toi, ton expérience, ta disponibilité...":lang==="ar"?"عرّف بنفسك وخبرتك وتوفرك...":"Introduce yourself, experience, availability..."} value={bidForm.message} onChange={e=>setBidForm({...bidForm,message:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">📅 {lang==="fr"?"Propose des créneaux (optionnel)":lang==="ar"?"اقترح مواعيد (اختياري)":"Propose time slots (optional)"}</label>
                <div style={{fontSize:12,color:"#6B7280",marginBottom:8}}>{lang==="fr"?"La famille choisira parmi tes créneaux.":lang==="ar"?"ستختار العائلة من بين مواعيدك.":"The family will pick one of your slots."}</div>
                {bidSlots.map((slot,si)=>(
                  <input key={si} type="datetime-local" className="form-input" style={{marginBottom:8}} value={slot} min={new Date(Date.now()+3600000).toISOString().slice(0,16)} onChange={e=>{const s=[...bidSlots];s[si]=e.target.value;setBidSlots(s);}} />
                ))}
                {bidSlots.length<3&&(
                  <button type="button" style={{background:"none",border:"none",color:"#5B4FE8",fontSize:12,fontWeight:700,cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>setBidSlots([...bidSlots,""])}>
                    + {lang==="fr"?"Ajouter un créneau":lang==="ar"?"أضف موعداً":"Add a slot"}
                  </button>
                )}
              </div>
              <button className="btn-full" onClick={async()=>{
                if(!bidForm.message){showToast("⚠️ "+(lang==="fr"?"Écris un message":"Write a message"));return;}
                setSubmittingBid(true);
                try{
                  await submitBid({requestId:selectedRequestForBid.id,netPriceAed:selectedRate,message:bidForm.message,proposedSlots:bidSlots});
                  if(selectedRequestForBid?.poster_id) sendPushTo(selectedRequestForBid.poster_id,lang==="fr"?"📩 Nouvelle offre reçue !":lang==="ar"?"📩 عرض جديد !":"📩 New offer received!",lang==="fr"?`${userProfile?.full_name||"Un prof"} a répondu à ta demande`:lang==="ar"?`${userProfile?.full_name||"مدرس"} ردّ على طلبك`:`${userProfile?.full_name||"A tutor"} replied to your request`);
                  const {data:bids}=await supabase.from("bids").select("*, request:requests(subject,level,duration_min,created_at)").eq("teacher_id",user.id).eq("status","pending");
                  setTeacherPendingOffers(bids||[]);setTeacherState("offer_sent");
                  setSelectedRequestForBid(null);setBidForm({message:""});setBidSlots(["",""]);setAppTab("teacher-home");
                  showToast("✅ "+(lang==="fr"?"Offre envoyée !":lang==="ar"?"تم إرسال العرض !":"Offer sent!"));
                }catch(e){showToast("❌ "+e.message);}
                finally{setSubmittingBid(false);}
              }} disabled={submittingBid}>{submittingBid?"⏳ "+(lang==="fr"?"Envoi...":"Sending..."):lang==="fr"?"Envoyer mon offre →":lang==="ar"?"إرسال عرضي ←":"Send my offer →"}</button>
            </div>
          )}

          {/* ONGLET HISTORIQUE ENSEIGNANT */}
          {appTab==="teacher-history"&&!showOnboard&&(
            <div style={{maxWidth:560,margin:"0 auto"}}>
              <div className="page-title">📋 {lang==="fr"?"Mes cours":lang==="ar"?"حصصي":"My lessons"}</div>
              <div className="page-sub">{lang==="fr"?"Historique de tous vos cours":lang==="ar"?"سجل جميع حصصك":"Your complete lesson history"}</div>
              <TeacherHistory userId={user?.id} lang={lang} />
            </div>
          )}

          {/* ONGLET REVENUS */}
          {appTab==="teacher-revenue"&&!showOnboard&&(
            <div style={{maxWidth:560,margin:"0 auto"}}>
              <div className="page-title">💰 {lang==="fr"?"Mes revenus":lang==="ar"?"إيراداتي":"My revenue"}</div>
              <div className="page-sub">{lang==="fr"?"Après 6% de commission TutorApp":lang==="ar"?"بعد عمولة TutorApp 6٪":"After 6% TutorApp commission"}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:"1.5rem"}}>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.thisMonth} AED</div><div className="stat-lbl">{lang==="fr"?"Ce mois-ci":"This month"}</div></div>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.total} AED</div><div className="stat-lbl">{lang==="fr"?"Total cumulé":"Total earned"}</div></div>
                <div className="stat-card"><div className="stat-val" style={{color:"#0ABFA3"}}>{teacherRevenue.pending} AED</div><div className="stat-lbl">{lang==="fr"?"En attente":"Pending"}</div></div>
                <div className="stat-card"><div className="stat-val">{teacherRevenue.courses}</div><div className="stat-lbl">{lang==="fr"?"Cours effectués":"Lessons done"}</div></div>
              </div>
              {userProfile?.bank_iban?(
                <div className="banner banner-teal" style={{marginBottom:"1.25rem"}}>🏦 {userProfile.bank_name} · ****{userProfile.bank_iban?.slice(-4)} · {userProfile.withdrawal_frequency==="wI"?(lang==="fr"?"Virement immédiat":"Immediate payout"):userProfile.withdrawal_frequency==="wW"?(lang==="fr"?"Virement hebdomadaire":"Weekly payout"):(lang==="fr"?"Virement mensuel":"Monthly payout")}</div>
              ):(
                <div className="banner banner-amber" style={{cursor:"pointer",marginBottom:"1.25rem"}} onClick={()=>setAppTab("profile")}>⚠️ {lang==="fr"?"Ajoute ton IBAN →":lang==="ar"?"أضف IBAN →":"Add your IBAN →"}</div>
              )}
              {userProfile?.verified
                ?<div className="banner banner-teal">✅ {lang==="fr"?"Enseignant vérifié":"Verified tutor"}</div>
                :<div className="banner banner-amber">⏳ {lang==="fr"?"Documents en cours de vérification (24h)":"Documents under review (24h)"}</div>
              }
            </div>
          )}

        </div>
      </div></div>}

      <footer className="footer">
        <div className="footer-logo">TutorApp</div>
        <div style={{fontSize:13,lineHeight:1.65,maxWidth:500,margin:"0 auto"}}>{t.footer}</div>
        <div style={{marginTop:"1.5rem",fontSize:12,color:"#4B5563"}}>© 2026 TutorApp · {COUNTRIES.map(c=>`${c.flag} ${c.name[lang]}`).join(" · ")}</div>
      </footer>

      {showAuth&&<Auth onClose={()=>setShowAuth(false)} onSuccess={handleLoginSuccess} lang={lang} />}
      {toast&&<div className="toast">{toast}</div>}

      {/* VIDEO CALL MODAL */}
      {showVideoCall&&videoCallUrl&&(
        <div style={{position:"fixed",inset:0,zIndex:3000,background:"#000",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:"#1A1A2E",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#0ABFA3",animation:"pulse 1.5s infinite"}}/>
              <span style={{color:"#fff",fontWeight:700,fontSize:14}}>🎥 {lang==="fr"?"Cours en cours":lang==="ar"?"الحصة جارية":"Lesson in progress"}</span>
            </div>
            <button onClick={()=>setShowVideoCall(false)} style={{background:"#DC2626",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontWeight:800,fontSize:13,cursor:"pointer"}}>
              ✕ {lang==="fr"?"Quitter":lang==="ar"?"خروج":"Leave"}
            </button>
          </div>
          <iframe
            src={videoCallUrl}
            style={{flex:1,border:"none",width:"100%"}}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            title="Video lesson"
          />
        </div>
      )}

      {showReportModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
          <div style={{background:"#fff",borderRadius:20,padding:"2rem",maxWidth:420,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.2)"}}>
            <div style={{fontSize:36,marginBottom:8,textAlign:"center"}}>⚠️</div>
            <div style={{fontFamily:"Fraunces,serif",fontSize:18,fontWeight:900,marginBottom:6,textAlign:"center"}}>
              {lang==="fr"?"Signaler un problème":lang==="ar"?"الإبلاغ عن مشكلة":"Report an issue"}
            </div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:"1.25rem",textAlign:"center"}}>
              {lang==="fr"?"Décris le problème — nous revenons sous 2h.":lang==="ar"?"صف المشكلة — سنرد خلال ساعتين.":"Describe the issue — we'll respond within 2h."}
            </div>
            <textarea
              placeholder={lang==="fr"?"Ex: le prof n'est pas venu au cours, problème technique...":lang==="ar"?"مثال: لم يأت المدرس، مشكلة تقنية...":"E.g. tutor didn't show up, technical issue..."}
              value={reportMessage}
              onChange={e=>setReportMessage(e.target.value)}
              style={{width:"100%",padding:"12px 16px",border:"1.5px solid #E2E8F0",borderRadius:12,fontSize:13,fontFamily:"inherit",minHeight:100,resize:"vertical",outline:"none",marginBottom:"1.25rem"}}
            />
            <div style={{display:"flex",gap:10}}>
              <button className="btn-ghost" style={{flex:1}} onClick={()=>{setShowReportModal(false);setReportMessage("");}}>
                {lang==="fr"?"Annuler":lang==="ar"?"إلغاء":"Cancel"}
              </button>
              <button className="btn-full" style={{flex:1,background:"#DC2626"}} disabled={!reportMessage.trim()} onClick={async()=>{
                await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"dispute_report",adminEmail:"pierre.garnier93@gmail.com",studentEmail:user?.email,studentName:userProfile?.full_name,bookingId:activeBooking?.id,subject:activeRequest?.subject,message:reportMessage,lang})}).catch(()=>{});
                setShowReportModal(false);setReportMessage("");
                showToast(lang==="fr"?"✅ Signalement envoyé — nous revenons sous 2h.":lang==="ar"?"✅ تم إرسال البلاغ — سنرد خلال ساعتين.":"✅ Report sent — we'll get back to you within 2h.");
              }}>
                {lang==="fr"?"Envoyer":lang==="ar"?"إرسال":"Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStudentOnboard&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,15,40,.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
          <div style={{background:"#fff",borderRadius:24,padding:"2rem",maxWidth:460,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.2)"}}>
            {/* Barre de progression */}
            <div style={{display:"flex",gap:8,marginBottom:"1.75rem"}}>
              {[1,2,3].map(s=>(
                <div key={s} style={{flex:1,height:4,borderRadius:2,background:s<=onboardStep?"#5B4FE8":"#E2E8F0",transition:"background .3s"}}/>
              ))}
            </div>

            {onboardStep===1&&<>
              <div style={{fontSize:28,marginBottom:8}}>👋</div>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:6,color:"#1A1A2E"}}>
                {lang==="fr"?"Bienvenue ! Qui apprend ?":lang==="ar"?"مرحباً! من يتعلم؟":"Welcome! Who's learning?"}
              </div>
              <div style={{fontSize:13,color:"#64748B",marginBottom:"1.5rem",lineHeight:1.6}}>
                {lang==="fr"?"Ces infos pré-remplissent tes annonces automatiquement — 30 secondes, une seule fois.":lang==="ar"?"ستملأ هذه المعلومات إعلاناتك تلقائياً — 30 ثانية، مرة واحدة فقط.":"This pre-fills your requests automatically — 30 seconds, just once."}
              </div>
              <div className="form-group">
                <label className="form-label">{lang==="fr"?"Prénom de l'élève":lang==="ar"?"اسم الطالب":"Student's first name"}</label>
                <input className="form-input" placeholder="Emma" name="child_firstname" autoComplete="given-name-off" autoCorrect="off" value={childName} onChange={e=>setChildName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&childName.trim()&&setOnboardStep(2)}/>
              </div>
              <button className="btn-full" onClick={()=>setOnboardStep(2)} disabled={!childName.trim()}>
                {lang==="fr"?"Continuer →":lang==="ar"?"متابعة ←":"Continue →"}
              </button>
              <button className="btn-ghost" style={{width:"100%",marginTop:8,fontSize:12}} onClick={()=>setShowStudentOnboard(false)}>
                {lang==="fr"?"Passer pour l'instant":lang==="ar"?"تخطي الآن":"Skip for now"}
              </button>
            </>}

            {onboardStep===2&&<>
              <div style={{fontSize:28,marginBottom:8}}>📚</div>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:6,color:"#1A1A2E"}}>
                {lang==="fr"?`Quel est le cursus de ${childName||"l'enfant"} ?`:lang==="ar"?`ما هو منهج ${childName||"الطفل"}؟`:`What's ${childName||"the child"}'s curriculum?`}
              </div>
              <div className="form-group">
                <label className="form-label">{lang==="fr"?"Cursus":lang==="ar"?"المنهج":"Curriculum"}</label>
                <select className="form-select" value={childCurriculum} onChange={e=>{setChildCurriculum(e.target.value);setChildLevel("");}}>
                  <option value="">{lang==="fr"?"Choisir...":lang==="ar"?"اختر...":"Choose..."}</option>
                  {Object.entries(CURRICULA).map(([k,v])=><option key={k} value={k}>{v.label[lang]||v.label.en}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{lang==="fr"?"Niveau":lang==="ar"?"المستوى":"Level"}</label>
                <select className="form-select" value={childLevel} onChange={e=>setChildLevel(e.target.value)} disabled={!childLevels.length}>
                  <option value="">{childLevels.length?(lang==="fr"?"Choisir...":"Choose..."):(lang==="fr"?"Sélectionne un cursus d'abord":"Select curriculum first")}</option>
                  {childLevels.map(l=><option key={l}>{l}</option>)}
                </select>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setOnboardStep(1)}>← {lang==="fr"?"Retour":lang==="ar"?"رجوع":"Back"}</button>
                <button className="btn-full" style={{flex:2}} onClick={()=>setOnboardStep(3)} disabled={!childCurriculum||!childLevel}>
                  {lang==="fr"?"Continuer →":lang==="ar"?"متابعة ←":"Continue →"}
                </button>
              </div>
            </>}

            {onboardStep===3&&<>
              <div style={{fontSize:28,marginBottom:8}}>🗣</div>
              <div style={{fontFamily:"Fraunces,serif",fontSize:22,fontWeight:900,marginBottom:6,color:"#1A1A2E"}}>
                {lang==="fr"?"Langue d'enseignement préférée ?":lang==="ar"?"لغة التدريس المفضلة؟":"Preferred teaching language?"}
              </div>
              <div style={{fontSize:13,color:"#64748B",marginBottom:"1.25rem"}}>
                {lang==="fr"?"Les profs filtreront par langue.":lang==="ar"?"سيقوم المدرسون بالتصفية حسب اللغة.":"Tutors will filter by language."}
              </div>
              <div className="chips-row" style={{marginBottom:"1.5rem"}}>
                {t.instrLangs.map(l=><div key={l} className={`chip${childLang===l?" selected":""}`} onClick={()=>setChildLang(l)}>{l}</div>)}
              </div>
              <div style={{display:"flex",gap:10}}>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setOnboardStep(2)}>← {lang==="fr"?"Retour":lang==="ar"?"رجوع":"Back"}</button>
                <button className="btn-full" style={{flex:2}} onClick={async()=>{
                  await saveChildProfile();
                  setShowStudentOnboard(false);
                }}>
                  {lang==="fr"?"C'est parti 🚀":lang==="ar"?"انطلق 🚀":"Let's go 🚀"}
                </button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

