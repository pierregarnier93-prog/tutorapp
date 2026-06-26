import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadStripe } from "@stripe/stripe-js";

const supabase = createClient(
  "https://ihtcmemyrwejeetybepg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodGNtZW15cndlamVldHliZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ0NjAsImV4cCI6MjA5NDY5MDQ2MH0.xyGnBYE2ex1vn5jbwrbfTbvcUtNC9SmzBIUiRQoIPEo"
);

const stripePromise = loadStripe("pk_live_51TagWA4l4Z2J0IZfYprxlISAh0FG5mY8jnpugEHj5kVU5G55mViXn5dZUl53oZh5aLRPavhFk4sdEkyTp4eFfYKZ008mURFe7S");

const STUDENT_FEE = 0.06;
const TEACHER_FEE = 0.06;

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
    .select("*, teacher:profiles!teacher_id(full_name, country_code)")
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
  const grossPrice = Math.round(netPrice * (1 + STUDENT_FEE));
  const teacherPayout = Math.round(netPrice * (1 - TEACHER_FEE));
  const commission = grossPrice - teacherPayout;
  const { data: booking, error } = await supabase.from("bookings").insert({
    request_id: requestId, bid_id: bidId,
    poster_id: user.id, teacher_id: bid.teacher_id,
    net_price_aed: netPrice, gross_price_aed: grossPrice,
    commission_aed: commission, status: "pending_payment", country_code: "UAE",
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
.app-tabs{display:flex;border-bottom:1.5px solid #E2E8F0;background:#F8FAFF}
.app-tab{padding:14px 22px;font-size:13px;font-weight:800;cursor:pointer;border-bottom:2.5px solid transparent;color:#667085;transition:all .25s;white-space:nowrap}
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
@media(max-width:900px){.app-body{padding:1.5rem}.section{padding:4rem 1.25rem}.hero{padding:3.5rem 1.25rem}.app-topbar{flex-direction:column;align-items:flex-start;padding:18px 20px}.app-tabs{flex-wrap:wrap}.app-tab{flex:1;justify-content:center}.nav{padding:0 1rem;gap:10px;row-gap:8px;column-gap:8px}.hero-stats{gap:1.5rem}.form-row{grid-template-columns:1fr}.submit-btn{padding:14px}.hero h1{font-size:clamp(2.2rem,8vw,3.6rem)}}
@media(max-width:700px){.nav-links{display:none}.nav{justify-content:space-between}.hero{min-height:auto;padding:3rem 1rem}.section{padding:3rem 1rem}.app-body{padding:1rem}.app-container{border-radius:22px}.teacher-card,.offer-card,.payment-card,.profile-card{padding:1.25rem}.app-tab{padding:12px 14px;font-size:12px}.page-title{font-size:1.5rem}.hero-btns{flex-direction:column;gap:12px}.hero-stat-val{font-size:1.4rem}.hero p{max-width:100%}}`;

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
    if (error) { setLoading(false); setError(error.message); return; }
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
    else { setSuccess("✅ Account created! You can now sign in."); setTab("login"); }
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

function ProfilePage({ user, userProfile, profileLoading, lang, onSaved }) {
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
      <div className="profile-card">
        <div style={{fontWeight:800,fontSize:15,marginBottom:"1rem",color:"#1A1A2E"}}>🔒 {t.profile.changePassword}</div>
        <div className="form-group"><label className="form-label">{t.profile.newPassword}</label><input className="form-input" type="password" placeholder="Min. 6 characters" value={newPassword} onChange={e=>setNewPassword(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">{t.profile.confirmPassword}</label><input className="form-input" type="password" placeholder="Repeat new password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} /></div>
        <button className="submit-btn" onClick={handleChangePassword} disabled={savingPwd} style={{marginTop:"0.5rem"}}>{savingPwd?"⏳ Updating...":t.profile.savePassword}</button>
      </div>
    </div>
  );
}

function PaymentScreen({ bid, booking, form, country, lang, onSuccess, onBack }) {
  const t = T[lang] || T.en;
  const [paying, setPaying] = useState(false);
  const lessonPrice = bid?.net_price_aed || 0;
  const studentFee = Math.round(lessonPrice * STUDENT_FEE);
  const studentTotal = lessonPrice + studentFee;
  const teacherPayout = Math.round(lessonPrice * (1 - TEACHER_FEE));

  const handlePay = async () => {
    setPaying(true);
    try {
      const response = await fetch("https://ihtcmemyrwejeetybepg.supabase.co/functions/v1/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking?.id, amount: studentTotal }),
      });
      const { clientSecret, error } = await response.json();
      if (error) throw new Error(error);
      const stripe = await stripePromise;
      const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: { token: "tok_visa" } },
      });
      if (stripeError) throw new Error(stripeError.message);
      onSuccess({ lessonPrice, studentFee, studentTotal, teacherPayout });
    } catch(e) {
      alert("❌ " + e.message);
      setPaying(false);
    }
  };

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
      <button className="submit-btn" onClick={handlePay} disabled={paying}>{paying?"⏳ Processing...":t.payment.payBtn}</button>
      <div className="stripe-badge">🔒 Secured by Stripe</div>
      <div style={{textAlign:"center",marginTop:"1rem"}}><button className="btn-ghost" onClick={onBack}>← Back to offers</button></div>
    </div>
  );
}

export default function TutorApp() {
  const [lang,setLang]=useState("en");
  const [country]=useState("UAE");
  const [page,setPage]=useState("home");
  const [appTab,setAppTab]=useState("student-form");
  const [teacherSubTab,setTeacherSubTab]=useState("dashboard");
  const [toast,setToast]=useState(null);
  const [selectedBid,setSelectedBid]=useState(null);
  const [currentBooking,setCurrentBooking]=useState(null);
  const [paymentResult,setPaymentResult]=useState(null);
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
  const [teacherForm,setTeacherForm]=useState({name:"",email:"",cycles:[],subjects:[],curricula:[],instrLangs:[],rate:150,idFile:null,diplomaFile:null,withdrawal:"wW",bankName:"",bankIban:"",bankHolder:"",cguAccepted:false,childProtectionAccepted:false});
  const [bidForm,setBidForm]=useState({message:""});
  const [selectedRequest,setSelectedRequest]=useState(null);
  const [profileLoading,setProfileLoading]=useState(true);

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
      if (profile) setUserProfile(profile);
      else console.warn("loadProfile: no profile row found for id", realUserId);

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
        if (profile?.role === "teacher") {
          setPage("app");
          if (!profile?.bank_iban) {
            setAppTab("teacher-dashboard");
            setShowOnboard(true);
          } else {
            setAppTab("teacher-dashboard");
          }
          const stats = await getTeacherStats(session.user.id);
          setTeacherStats(stats);
        } else if (profile?.role === "student") {
          setPage("app"); setAppTab("student-form");
        }
      } else {
        setProfileLoading(false);
      }
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user??null);
      if(!session?.user){setUserProfile(null);setPage("home");setProfileLoading(false);}
    });
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(appTab==="teacher-dashboard"&&user){
      setRequestsLoading(true);
      getOpenRequests(country).then(data=>{setRealRequests(data);setRequestsLoading(false);}).catch(()=>setRequestsLoading(false));
      getTeacherStats(user.id).then(setTeacherStats).catch(()=>{});
    }
  },[appTab,user,country]);

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
  const displayName=userProfile?.full_name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"";
  const isProfilePrefilled=!!(form.curriculum&&form.instrLang&&form.level);

  // ✅ FIX : isTeacher calculé SEULEMENT après chargement complet
  const isTeacher = !profileLoading && userProfile?.role === "teacher";

  const handleLogout=async()=>{
    await supabase.auth.signOut();
    setPage("home");setAppTab("student-form");setUser(null);setUserProfile(null);setProfileLoading(false);
    showToast("👋 See you soon!");
  };

  const handlePublish=async()=>{
    if(!form.subject||!form.level){showToast("⚠️ Please select subject and level");return;}
    setPublishing(true);
    try{
      const durationMap={"30 min":30,"1h":60,"1h30":90,"2h":120,"2h30":150,"3h":180};
      const req=await postRequest({subject:form.subject,instrLang:form.instrLang||"English",curriculum:form.curriculum||"british",level:form.level,cycle:form.cycle,durationMin:durationMap[form.duration]||60,message:form.message,countryCode:country});
      setCurrentRequestId(req.id);setAppTab("student-bids");
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
      showToast("✅ Offer sent!");setBidForm({message:""});setSelectedRequest(null);
      setAppTab("teacher-dashboard");setTeacherSubTab("requests");
    }catch(e){showToast("❌ "+e.message);}
    finally{setSubmittingBid(false);}
  };

  const handleAcceptBid=async(bid)=>{
    try{
      const booking=await acceptBid(bid.id,currentRequestId);
      setSelectedBid(bid);setCurrentBooking(booking);setAppTab("student-payment");
    }catch(e){showToast("❌ "+e.message);}
  };

  const handlePaymentSuccess=(result)=>{setPaymentResult(result);setAppTab("student-confirm");showToast("🎉 Booking confirmed!");};
  const handleDeclineBid=(bidId)=>{setRealBids(prev=>prev.filter(b=>b.id!==bidId));showToast("Offer declined.");};

  const handleTeacherSubmit=async()=>{
    if(!teacherForm.name||!teacherForm.email||!teacherForm.cycles.length||!teacherForm.subjects.length||!teacherForm.idFile||!teacherForm.diplomaFile||!teacherForm.bankIban||!teacherForm.bankName||!teacherForm.bankHolder){
      showToast("⚠️ Please complete all fields including banking details");return;
    }
    if(!teacherForm.cguAccepted||!teacherForm.childProtectionAccepted){
      showToast("⚠️ Please accept the Terms of Service and Child Protection Charter");return;
    }
    if(user){
      await supabase.from("profiles").update({
        full_name:teacherForm.name,withdrawal_frequency:teacherForm.withdrawal,
        bank_name:teacherForm.bankName,bank_iban:teacherForm.bankIban,bank_holder:teacherForm.bankHolder,
        withdrawal_changed_at:new Date().toISOString(),
      }).eq("id",user.id);
    }
    setShowOnboard(false);setAppTab("teacher-dashboard");
    showToast("🎉 Profile submitted! We will review within 24h.");
  };

  const handleLoginSuccess=async()=>{
    setShowAuth(false);
    const {data:{user:u}}=await supabase.auth.getUser();
    if(u){
      setUser(u);
      const profile=await loadProfile(u.id);
      const role=profile?.role||"student";
      const name=profile?.full_name||u.user_metadata?.full_name||u.email?.split("@")[0];
      showToast(`👋 ${t.teacher.hello}, ${name}!`);
      setPage("app");
      if(role==="teacher"){
        if(!profile?.bank_iban){setAppTab("teacher-dashboard");setShowOnboard(true);}
        else{setAppTab("teacher-dashboard");}
        const stats=await getTeacherStats(u.id);setTeacherStats(stats);
      } else {
        setAppTab("student-form");
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
              <span className="nav-link" onClick={()=>{setPage("app");setAppTab("teacher-dashboard");}}>{t.nav.teach}</span>
            ) : (
              <span className="nav-link" onClick={()=>go("student-form")}>{t.nav.search}</span>
            )
          ) : <>
            <span className="nav-link" onClick={()=>go("student-form")}>{t.nav.search}</span>
            <span className="nav-link" onClick={()=>go("teacher-dashboard")}>{t.nav.teach}</span>
          </>}
          <span className="nav-link" onClick={()=>setPage("teachers")}>{t.nav.teachers}</span>
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
            <button className="btn-big btn-big-primary" onClick={()=>go("student-form")}>{t.hero.cta1}</button>
            <button className="btn-big btn-big-outline" onClick={()=>{if(!user){setShowAuth(true);return;}setPage("app");setAppTab("teacher-dashboard");setShowOnboard(true);}}>{t.hero.cta2}</button>
          </div>
          <div className="hero-stats">{[{v:t.hero.s1v,l:t.hero.s1l},{v:t.hero.s2v,l:t.hero.s2l},{v:t.hero.s3v,l:t.hero.s3l},{v:t.hero.s4v,l:t.hero.s4l}].map((s,i)=><div key={i} style={{textAlign:"center"}}><div className="hero-stat-val">{s.v}</div><div className="hero-stat-lbl">{s.l}</div></div>)}</div>
        </section>
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",borderBottom:"1.5px solid #E8EAF6",padding:"4rem 0"}}><div className="section" style={{padding:"0 2rem"}}><div className="section-label">{t.how.label}</div><div className="section-title">{t.how.title}<span>{t.how.titleSpan}</span></div><div className="steps-grid">{t.how.steps.map((s,i)=><div className="step-card" key={i}><div className="step-num-bg">{i+1}</div><div className="step-icon">{s.icon}</div><h3>{s.t}</h3><p>{s.d}</p></div>)}</div></div></div>
        <div className="section"><div className="section-label">{t.subjects.label}</div><div className="section-title">{t.subjects.title}<span>{t.subjects.titleSpan}</span></div><div className="subj-grid">{SUBJECTS.map(s=><div className="subj-card" key={s.en} onClick={()=>go("student-form")}><span style={{fontSize:20}}>{s.icon}</span><span>{s[lang]}</span></div>)}</div></div>
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",padding:"4rem 0"}}><div className="section" style={{padding:"0 2rem"}}><div className="section-label">{t.nav.teachers}</div><div className="section-title" style={{marginBottom:"2rem"}}>{lang==="ar"?"جميعهم موثّقون":lang==="fr"?"Tous vérifiés":"All verified, all passionate"}</div><div className="teachers-grid">{TEACHERS.map(tc=><div className="teacher-card" key={tc.name.en} onClick={()=>setPage("teachers")}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}><div className="tc-avatar" style={{background:tc.bg,color:tc.color}}>{tc.initials}</div><div><div style={{fontWeight:800,fontSize:15,color:"#1A1A2E"}}>{tc.name[lang]}</div>{tc.verified&&<div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ Verified</div>}</div></div><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>{tc.subjects.slice(0,2).map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return<span className="pill" key={s}>{subj?subj[lang]:s}</span>;})} {tc.instrLangs.map(l=><span className="pill pill-teal" key={l}>{l}</span>)}</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{fmtPrice(tc.rate,country)}<span style={{fontSize:12,fontWeight:500,color:"#6B7280"}}>/h</span></div><div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>★ {tc.rating} ({tc.reviews})</div></div></div>)}</div></div></div>
      </>}

      {page==="teachers"&&<div className="section"><div className="teachers-grid">{TEACHERS.map(tc=><div className="teacher-card" key={tc.name.en}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}><div className="tc-avatar" style={{background:tc.bg,color:tc.color}}>{tc.initials}</div><div><div style={{fontWeight:800,fontSize:15}}>{tc.name[lang]}</div>{tc.verified&&<div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ Verified</div>}</div></div><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>{tc.subjects.map(s=>{const subj=SUBJECTS.find(x=>x.en===s);return<span className="pill" key={s}>{subj?subj[lang]:s}</span>;})} {tc.instrLangs.map(l=><span className="pill pill-teal" key={l}>{l}</span>)}</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}><div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{fmtPrice(tc.rate,country)}/h</div><div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>★ {tc.rating} ({tc.reviews})</div></div><button className="submit-btn" style={{marginTop:0,padding:"10px"}} onClick={()=>go("student-form")}>{lang==="ar"?"احجز ←":lang==="fr"?"Réserver →":"Book →"}</button></div>)}</div></div>}

      {page==="app"&&<div className="section"><div className="app-container">
        <div className="app-topbar"><div className="app-dot-row"><div className="app-dot" style={{background:"#E24B4A"}}></div><div className="app-dot" style={{background:"#F5A623"}}></div><div className="app-dot" style={{background:"#0ABFA3"}}></div></div><div className="app-url">tutorapp.online · 🔒 {currentCountry.flag} {currentCountry.name[lang]}</div></div>

        <div className="app-tabs">
          {profileLoading ? (
            <div style={{padding:"14px 22px",fontSize:13,color:"#9CA3AF"}}>⏳ Loading...</div>
          ) : isTeacher ? <>
            <div className={`app-tab${teacherSubTab==="requests"&&appTab==="teacher-dashboard"||appTab==="teacher-bid"?" active":""}`} onClick={()=>{setAppTab("teacher-dashboard");setTeacherSubTab("requests");setShowOnboard(false);}}>📋 {t.teacher.requests}</div>
            <div className={`app-tab${teacherSubTab==="dashboard"&&appTab==="teacher-dashboard"?" active":""}`} onClick={()=>{setAppTab("teacher-dashboard");setTeacherSubTab("dashboard");setShowOnboard(false);}}>📊 {t.teacher.dashboard}</div>
            <div className={`app-tab${appTab==="profile"?" active":""}`} onClick={()=>setAppTab("profile")}>👤 {t.teacher.profile}</div>
          </> : <>
            <div className={`app-tab${["student-form","student-bids","student-payment","student-confirm"].includes(appTab)?" active":""}`} onClick={()=>{setAppTab("student-form");setShowOnboard(false);}}>🎓 {t.nav.search}</div>
            <div className={`app-tab${appTab==="profile"?" active":""}`} onClick={()=>setAppTab("profile")}>👤 {t.teacher.profile}</div>
          </>}
        </div>

        <div className="app-body">
          {appTab==="profile"&&<ProfilePage user={user} userProfile={userProfile} profileLoading={profileLoading} lang={lang} onSaved={(name)=>{setUserProfile(p=>({...p,full_name:name}));}} />}

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

          {appTab==="student-payment"&&selectedBid&&<PaymentScreen bid={selectedBid} booking={currentBooking} form={form} country={country} lang={lang} onSuccess={handlePaymentSuccess} onBack={()=>setAppTab("student-bids")} />}

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
            <div className="jitsi-box"><div style={{fontSize:24,marginBottom:6}}>📹</div><div style={{fontWeight:800,fontSize:14,color:"#0F6E56",marginBottom:4}}>{t.confirm.jitsi}</div><div style={{fontSize:12,color:"#6B7280"}}>{t.confirm.jitsiNote}</div></div>
            <button className="submit-btn" style={{maxWidth:300,margin:"0 auto"}} onClick={()=>{setAppTab("student-form");setSelectedBid(null);setCurrentRequestId(null);setRealBids([]);setPaymentResult(null);}}>{t.confirm.newReq}</button>
          </div>}

          {appTab==="teacher-dashboard"&&showOnboard&&<>
            <div className="page-title">{t.onboard.title}</div>
            <div className="page-sub">{t.onboard.sub}</div>
            <div className="form-row">
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.name}</label><input className="form-input" placeholder="Sarah Al-Mansouri" value={teacherForm.name} onChange={e=>setTeacherForm({...teacherForm,name:e.target.value})} /></div>
              <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.email}</label><input className="form-input" type="email" placeholder="sarah@email.com" value={teacherForm.email} onChange={e=>setTeacherForm({...teacherForm,email:e.target.value})} /></div>
            </div>
            <div className="form-group"><label className="form-label">{t.onboard.cycle}</label><div className="chips-row">{t.cycles.map(c=><div key={c} className={`chip${teacherForm.cycles.includes(c)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,cycles:[c]})}>{c}</div>)}</div></div>
            <div className="form-group"><label className="form-label">{t.onboard.curriculum}</label><div className="chips-row">{Object.entries(CURRICULA).map(([k,v])=><div key={k} className={`chip${teacherForm.curricula.includes(k)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,curricula:toggleArr(teacherForm.curricula,k)})}>{v.label[lang]}</div>)}</div></div>
            <div className="form-group"><label className="form-label">{t.onboard.subjects}</label><div className="chips-row">{SUBJECTS.map(s=><div key={s.en} className={`chip${teacherForm.subjects.includes(s.en)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,subjects:toggleArr(teacherForm.subjects,s.en)})}>{s[lang]}</div>)}</div></div>
            <div className="form-group"><label className="form-label">{t.onboard.langTeach}</label><div className="chips-row">{t.instrLangs.map(l=><div key={l} className={`chip${teacherForm.instrLangs.includes(l)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,instrLangs:toggleArr(teacherForm.instrLangs,l)})}>{l}</div>)}</div></div>
            <div className="form-group">
              <label className="form-label">{t.onboard.rate}</label>
              <div className="rate-chips">{TEACHER_RATES.map(r=><div key={r} className={`rate-chip${teacherForm.rate===r?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,rate:r})}>{fmtPrice(r,country)}/h</div>)}</div>
              <div style={{fontSize:12,color:"#6B7280",marginTop:6}}>{t.teacher.rateHint} → {fmtPrice(Math.round(teacherForm.rate*(1-TEACHER_FEE)),country)}/h</div>
            </div>
            <div className="form-group"><label className="form-label">{t.onboard.bio}</label><textarea className="form-textarea" placeholder={t.onboard.bioPh} /></div>

            <div className="section-divider">🪪 {t.onboard.idDoc}</div>
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
            <button className="submit-btn" onClick={handleTeacherSubmit} disabled={!teacherForm.cguAccepted||!teacherForm.childProtectionAccepted} style={{opacity:(!teacherForm.cguAccepted||!teacherForm.childProtectionAccepted)?0.5:1}}>{t.onboard.submit}</button>
          </>}

          {appTab==="teacher-dashboard"&&!showOnboard&&<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:8}}>
              <div>
                <div className="page-title">{t.teacher.hello}, {displayName} 👋</div>
                <div className="page-sub" style={{marginBottom:0}}>{t.teacher.sub}</div>
              </div>
              <button className="btn-ghost" onClick={()=>setShowOnboard(true)}>✏️ {lang==="fr"?"Modifier":lang==="ar"?"تعديل":"Edit profile"}</button>
            </div>

            {teacherSubTab==="dashboard"&&<>
              <div className="teacher-stats">
                <div className="stat-card"><div className="stat-val">{fmtPrice(teacherStats.revenue,country)}</div><div className="stat-lbl">{t.teacher.revenue}</div></div>
                <div className="stat-card"><div className="stat-val">{teacherStats.courses}</div><div className="stat-lbl">{t.teacher.courses}</div></div>
                <div className="stat-card"><div className="stat-val">{teacherStats.rating==="—"?"—":`${teacherStats.rating}★`}</div><div className="stat-lbl">{t.teacher.rating}</div></div>
              </div>
              {!userProfile?.bank_iban
                ? <div className="missing-bank" onClick={()=>setAppTab("profile")}>
                    <div style={{fontWeight:800,fontSize:14,color:"#92400E",marginBottom:4}}>⚠️ {lang==="fr"?"Coordonnées bancaires manquantes":lang==="ar"?"بيانات بنكية مفقودة":"Banking details missing"}</div>
                    <div style={{fontSize:13,color:"#92400E"}}>{lang==="fr"?"Ajoutez votre IBAN pour recevoir vos paiements →":lang==="ar"?"أضف IBAN لاستلام مدفوعاتك →":"Add your IBAN to receive payouts →"}</div>
                  </div>
                : <div className="payout-info">
                    💳 {lang==="fr"?"Virement":lang==="ar"?"تحويل":"Payout"}: {userProfile.bank_name} · ****{userProfile.bank_iban?.slice(-4)} · {userProfile.withdrawal_frequency==="wI"?t.onboard.wI:userProfile.withdrawal_frequency==="wW"?t.onboard.wW:t.onboard.wM}
                  </div>
              }
            </>}

            {teacherSubTab==="requests"&&<>
              {requestsLoading&&<div className="loading-spinner">⏳ Loading...</div>}
              {!requestsLoading&&realRequests.length===0&&<div className="empty-state"><div className="empty-icon">📋</div><div style={{fontWeight:700,fontSize:15,marginBottom:6}}>No open requests yet</div><div style={{fontSize:13,color:"#9CA3AF"}}>Student requests will appear here in real time.</div></div>}
              {!requestsLoading&&realRequests.map((r,i)=>(
                <div className="req-card" key={r.id||i}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>📋</span><div className="req-title">{r.subject}</div></div>
                    <span style={{fontSize:11,color:"#9CA3AF",fontWeight:600}}>{new Date(r.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:r.message?8:12}}>
                    <span className="badge badge-purple">{r.level}</span>
                    <span className="badge badge-blue">🗣 {r.instr_lang}</span>
                    <span className="badge badge-amber">{r.duration_min} min</span>
                    <span className="badge badge-green">📹 Online</span>
                    <span className="badge badge-gray">{r.curriculum}</span>
                  </div>
                  {r.message&&<div style={{fontSize:13,color:"#6B7280",marginBottom:12,fontStyle:"italic",background:"#FAFBFF",borderRadius:8,padding:"8px 12px"}}>"{r.message}"</div>}
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn-teal" onClick={()=>{setSelectedRequest(r);setAppTab("teacher-bid");}}>{t.teacher.bid}</button>
                    <button className="btn-ghost">{t.teacher.ignore}</button>
                  </div>
                </div>
              ))}
            </>}
          </>}

          {appTab==="teacher-bid"&&selectedRequest&&<>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1.5rem",flexWrap:"wrap"}}>
              <button className="btn-ghost" onClick={()=>{setAppTab("teacher-dashboard");setSelectedRequest(null);setTeacherSubTab("requests");}}>{t.bidForm.back}</button>
              <div><div className="page-title" style={{marginBottom:0}}>{selectedRequest.subject}</div><div className="page-sub" style={{marginBottom:0}}>{selectedRequest.level} · {selectedRequest.instr_lang} · {selectedRequest.duration_min} min · 📹</div></div>
            </div>
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
        <div style={{marginTop:"1.5rem",fontSize:12,color:"#4B5563"}}>© 2026 TutorApp · {COUNTRIES.map(c=>`${c.flag} ${c.name[lang]}`).join(" · ")}</div>
      </footer>

      {showAuth&&<Auth onClose={()=>setShowAuth(false)} onSuccess={handleLoginSuccess} lang={lang} />}
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}

