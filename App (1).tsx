import { useState } from "react";

// ─── CURRENCIES ────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code:"UAE", flag:"🇦🇪", name:{en:"UAE",ar:"الإمارات",fr:"Émirats"}, currency:"AED", rate:1 },
  { code:"KSA", flag:"🇸🇦", name:{en:"Saudi Arabia",ar:"المملكة العربية السعودية",fr:"Arabie Saoudite"}, currency:"SAR", rate:1.02 },
  { code:"QAT", flag:"🇶🇦", name:{en:"Qatar",ar:"قطر",fr:"Qatar"}, currency:"QAR", rate:1.02 },
  { code:"KWT", flag:"🇰🇼", name:{en:"Kuwait",ar:"الكويت",fr:"Koweït"}, currency:"KWD", rate:0.11 },
  { code:"BAH", flag:"🇧🇭", name:{en:"Bahrain",ar:"البحرين",fr:"Bahreïn"}, currency:"BHD", rate:0.14 },
];

// ─── CURRICULUM → LEVELS mapping ───────────────────────────────────────────────
const CURRICULA = {
  british: {
    label:{en:"British",ar:"البريطاني",fr:"Britannique"},
    levels:{en:["Year 1","Year 2","Year 3","Year 4","Year 5","Year 6","Year 7","Year 8","Year 9","Year 10","Year 11 (GCSE)","Year 12 (A-Level)","Year 13 (A-Level)"],
            ar:["السنة 1","السنة 2","السنة 3","السنة 4","السنة 5","السنة 6","السنة 7","السنة 8","السنة 9","السنة 10","السنة 11 (GCSE)","السنة 12 (A-Level)","السنة 13 (A-Level)"],
            fr:["Année 1","Année 2","Année 3","Année 4","Année 5","Année 6","7ème (Year 7)","8ème (Year 8)","9ème (Year 9)","10ème (Year 10)","GCSE (Year 11)","A-Level (Year 12)","A-Level (Year 13)"]},
  },
  french: {
    label:{en:"French (MEN)",ar:"الفرنسي (MEN)",fr:"Français (MEN)"},
    levels:{en:["CP (Year 1)","CE1 (Year 2)","CE2 (Year 3)","CM1 (Year 4)","CM2 (Year 5)","6ème (Year 6)","5ème (Year 7)","4ème (Year 8)","3ème (Year 9)","2nde (Year 10)","1ère (Year 11)","Terminale (Year 12)"],
            ar:["المستوى 1","المستوى 2","المستوى 3","المستوى 4","المستوى 5","الصف السادس","الصف السابع","الصف الثامن","الصف التاسع","الصف العاشر","الصف الحادي عشر","الصف الثاني عشر"],
            fr:["CP","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","2nde","1ère","Terminale"]},
  },
  american: {
    label:{en:"American",ar:"الأمريكي",fr:"Américain"},
    levels:{en:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"],
            ar:["الصف الأول","الصف الثاني","الصف الثالث","الصف الرابع","الصف الخامس","الصف السادس","الصف السابع","الصف الثامن","الصف التاسع","الصف العاشر","الصف الحادي عشر","الصف الثاني عشر"],
            fr:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"]},
  },
  emirati: {
    label:{en:"Emirati (MOE)",ar:"الإماراتي (وزارة التعليم)",fr:"Émirati (MEN)"},
    levels:{en:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"],
            ar:["الصف الأول","الصف الثاني","الصف الثالث","الصف الرابع","الصف الخامس","الصف السادس","الصف السابع","الصف الثامن","الصف التاسع","الصف العاشر","الصف الحادي عشر","الصف الثاني عشر"],
            fr:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"]},
  },
  ib: {
    label:{en:"IB (International)",ar:"البكالوريا الدولية",fr:"IB (International)"},
    levels:{en:["PYP Year 1","PYP Year 2","PYP Year 3","PYP Year 4","PYP Year 5","PYP Year 6","MYP Year 1","MYP Year 2","MYP Year 3","MYP Year 4","MYP Year 5","DP Year 1","DP Year 2"],
            ar:["PYP 1","PYP 2","PYP 3","PYP 4","PYP 5","PYP 6","MYP 1","MYP 2","MYP 3","MYP 4","MYP 5","DP 1","DP 2"],
            fr:["PYP Année 1","PYP Année 2","PYP Année 3","PYP Année 4","PYP Année 5","PYP Année 6","MYP Année 1","MYP Année 2","MYP Année 3","MYP Année 4","MYP Année 5","DP Année 1","DP Année 2"]},
  },
};

// ─── SUBJECTS ──────────────────────────────────────────────────────────────────
const SUBJECTS = [
  { icon:"➕", en:"Mathematics", ar:"الرياضيات", fr:"Mathématiques" },
  { icon:"⚗️", en:"Physics & Chemistry", ar:"الفيزياء والكيمياء", fr:"Physique-Chimie" },
  { icon:"📖", en:"English", ar:"اللغة الإنجليزية", fr:"Anglais" },
  { icon:"🌙", en:"Arabic", ar:"اللغة العربية", fr:"Arabe" },
  { icon:"🇫🇷", en:"French", ar:"اللغة الفرنسية", fr:"Français" },
  { icon:"🔬", en:"Biology (SVT)", ar:"علم الأحياء", fr:"SVT / Biologie" },
  { icon:"🗺️", en:"History & Geography", ar:"التاريخ والجغرافيا", fr:"Histoire-Géo" },
  { icon:"💻", en:"Computer Science", ar:"علوم الحاسوب", fr:"Informatique" },
  { icon:"📊", en:"Economics", ar:"الاقتصاد", fr:"Économie" },
  { icon:"🎨", en:"Arts", ar:"الفنون", fr:"Arts" },
  { icon:"💭", en:"Philosophy", ar:"الفلسفة", fr:"Philosophie" },
  { icon:"🌍", en:"Spanish", ar:"اللغة الإسبانية", fr:"Espagnol" },
];

// ─── TRANSLATIONS ───────────────────────────────────────────────────────────────
const T = {
  en: {
    dir:"ltr",
    nav:{ search:"Find a tutor", teach:"Teach", teachers:"Tutors", start:"Get started", country:"Country" },
    hero:{ badge:"Gulf Region · 100% Online · Verified Tutors", h1:"Find a tutor in ", h1span:"5 minutes,", h1b:" not 5 days.", sub:"Post your need, receive offers from verified tutors across the Gulf. Simple, fast, pay after the lesson.", cta1:"Find a tutor →", cta2:"Become a tutor", s1v:"200+", s1l:"Verified tutors", s2v:"15 min", s2l:"Avg response time", s3v:"4.9★", s3l:"Average rating", s4v:"5", s4l:"Gulf countries" },
    how:{ label:"How it works", title:"As simple as ", titleSpan:"booking a ride", steps:[{icon:"📋",t:"Post your request",d:"Subject, level, duration. 30 seconds."},{icon:"⚡",t:"Tutors respond",d:"Available tutors submit offers with pricing."},{icon:"👆",t:"You choose",d:"Browse profiles, ratings, reviews."},{icon:"🎓",t:"Online lesson!",d:"Video link sent automatically. Pay after."}] },
    subjects:{ label:"All subjects", title:"Maths in ", titleSpan:"English, Arabic or French" },
    form:{ title:"Post your request", sub:"Describe your need in 30 seconds.", subject:"Subject *", lang:"Language of instruction *", curriculum:"Curriculum *", level:"Level *", cycle:"Cycle", duration:"Duration", budget:"Max budget", age:"Student age", msg:"Message to tutors", msgPh:"Describe difficulties, goals, availability...", publish:"Post request →", onlineBanner:"All lessons are held via video call — link sent automatically after booking." },
    bids:{ title:"Offers received", new:"new offers", payAfter:"💳 You pay ONLY after the lesson is completed", choose:"Choose →", back:"← Edit request" },
    confirm:{ title:"Booking confirmed!", sub1:"You chose ", sub2:". Video link will be sent by email.", subject:"Subject", teacher:"Tutor", price:"Price", pay:"Pay after lesson", secured:"✓ Secured", newReq:"Post another request" },
    teacher:{ hello:"Hello, Sarah 👋", sub:"New requests matching your profile.", revenue:"this month", courses:"Lessons", rating:"Rating", newAds:"New requests", bid:"Make offer →", ignore:"Ignore", suggestions:"Suggested for you", withdrawal:"Automatic payout", wI:"Immediate", wW:"Weekly", wM:"Monthly", wInfo:"Earnings transferred automatically to your account.", profile:"My profile" },
    bidForm:{ back:"← Back", price:"Your price", maxB:"Student budget", comm:"Commission (15%)", ded:"deducted", recv:"✓ You receive", afterC:"after commission", msg:"Your message", msgPh:"Introduce yourself, experience, availability...", send:"Send offer →" },
    onboard:{ title:"Create tutor profile", sub:"Join 200+ verified tutors across the Gulf.", name:"Full name *", email:"Email *", phone:"Phone", bio:"Bio", bioPh:"Your background & teaching style...", cycle:"Teaching level(s) *", subjects:"Subjects *", curriculum:"Curriculum(s) *", langTeach:"Teaching language(s) *", rate:"Hourly rate", eid:"Emirates ID / Iqama *", diploma:"Diploma(s) *", eidPh:"Upload ID document (PDF/JPG)", diplomaPh:"Upload diploma(s) (PDF)", submit:"Create profile →" },
    cycles:["Primary (6-11)","Middle School (11-15)","High School (15-18)"],
    instrLangs:["English","Arabic","French"],
    durations:["30 min","1h","1h30","2h","2h30","3h"],
    footer:"The 100% online tutoring marketplace for the Gulf region. Verified tutors, pay after the lesson.",
  },
  ar: {
    dir:"rtl",
    nav:{ search:"أبحث عن مدرس", teach:"أدرّس", teachers:"المدرسون", start:"ابدأ الآن", country:"الدولة" },
    hero:{ badge:"منطقة الخليج · 100% عبر الإنترنت · مدرسون موثّقون", h1:"ابحث عن مدرس في ", h1span:"5 دقائق،", h1b:" لا 5 أيام.", sub:"انشر احتياجك، احصل على عروض من مدرسين موثّقين في الخليج. بسيط، سريع، ادفع بعد الحصة.", cta1:"ابحث عن مدرس ←", cta2:"أصبح مدرساً", s1v:"200+", s1l:"مدرس موثّق", s2v:"15 د", s2l:"متوسط وقت الرد", s3v:"4.9★", s3l:"متوسط التقييم", s4v:"5", s4l:"دول خليجية" },
    how:{ label:"كيف يعمل", title:"بسيط مثل ", titleSpan:"حجز سيارة أجرة", steps:[{icon:"📋",t:"انشر طلبك",d:"المادة، المستوى، المدة. 30 ثانية فقط."},{icon:"⚡",t:"المدرسون يردّون",d:"يقدم المدرسون المتاحون عروضهم مع الأسعار."},{icon:"👆",t:"أنت تختار",d:"تصفّح الملفات الشخصية والتقييمات."},{icon:"🎓",t:"حصة عبر الإنترنت!",d:"يُرسل رابط الفيديو تلقائياً. ادفع بعد الحصة."}] },
    subjects:{ label:"جميع المواد", title:"الرياضيات بـ", titleSpan:"العربية أو الإنجليزية أو الفرنسية" },
    form:{ title:"انشر طلبك", sub:"صف احتياجك في 30 ثانية.", subject:"المادة *", lang:"لغة التدريس *", curriculum:"المنهج *", level:"المستوى *", cycle:"المرحلة", duration:"المدة", budget:"الميزانية القصوى", age:"عمر الطالب", msg:"رسالة للمدرسين", msgPh:"صف الصعوبات، الأهداف، التوافر...", publish:"نشر الطلب ←", onlineBanner:"جميع الحصص تُعقد عبر مكالمة فيديو — يُرسل الرابط تلقائياً بعد الحجز." },
    bids:{ title:"العروض المستلمة", new:"عروض جديدة", payAfter:"💳 تدفع فقط بعد انتهاء الحصة", choose:"اختر ←", back:"← تعديل الطلب" },
    confirm:{ title:"تم تأكيد الحجز!", sub1:"اخترت ", sub2:". سيُرسل رابط الفيديو بالبريد الإلكتروني.", subject:"المادة", teacher:"المدرس", price:"السعر", pay:"الدفع بعد الحصة", secured:"✓ آمن", newReq:"نشر طلب جديد" },
    teacher:{ hello:"مرحباً، سارة 👋", sub:"طلبات جديدة تتناسب مع ملفك الشخصي.", revenue:"هذا الشهر", courses:"الحصص", rating:"التقييم", newAds:"طلبات جديدة", bid:"تقديم عرض ←", ignore:"تجاهل", suggestions:"مقترحات لك", withdrawal:"صرف تلقائي", wI:"فوري", wW:"أسبوعي", wM:"شهري", wInfo:"تُحوَّل أرباحك تلقائياً إلى حسابك البنكي.", profile:"ملفي الشخصي" },
    bidForm:{ back:"← رجوع", price:"سعرك", maxB:"ميزانية الطالب", comm:"عمولة المنصة (15%)", ded:"مخصوم", recv:"✓ ستحصل على", afterC:"بعد العمولة", msg:"رسالتك للطالب", msgPh:"عرّف بنفسك، خبرتك، توافرك...", send:"إرسال العرض ←" },
    onboard:{ title:"أنشئ ملف المدرس", sub:"انضم لأكثر من 200 مدرس موثّق في الخليج.", name:"الاسم الكامل *", email:"البريد الإلكتروني *", phone:"الهاتف", bio:"نبذة عنك", bioPh:"خلفيتك وأسلوبك في التدريس...", cycle:"مستوى التدريس *", subjects:"المواد *", curriculum:"المناهج *", langTeach:"لغة التدريس *", rate:"السعر بالساعة", eid:"الهوية الإماراتية / الإقامة *", diploma:"الشهادة/الدرجة العلمية *", eidPh:"رفع وثيقة الهوية (PDF/JPG)", diplomaPh:"رفع الشهادة (PDF)", submit:"إنشاء الملف ←" },
    cycles:["الابتدائية (6-11)","المتوسطة (11-15)","الثانوية (15-18)"],
    instrLangs:["الإنجليزية","العربية","الفرنسية"],
    durations:["30 دقيقة","ساعة","ساعة ونصف","ساعتان","ساعتان ونصف","3 ساعات"],
    footer:"سوق الدروس الخصوصية عبر الإنترنت في منطقة الخليج. مدرسون موثّقون، الدفع بعد الحصة.",
  },
  fr: {
    dir:"ltr",
    nav:{ search:"Je cherche un cours", teach:"J'enseigne", teachers:"Enseignants", start:"Commencer", country:"Pays" },
    hero:{ badge:"Golfe · 100% Distanciel · Enseignants vérifiés", h1:"Trouve un prof en ", h1span:"5 minutes,", h1b:" pas en 5 jours.", sub:"Poste ton besoin, reçois des offres d'enseignants vérifiés dans tout le Golfe. Simple, rapide, paiement après le cours.", cta1:"Je cherche un cours →", cta2:"Je suis enseignant", s1v:"200+", s1l:"Enseignants vérifiés", s2v:"15 min", s2l:"Temps de réponse", s3v:"4.9★", s3l:"Note moyenne", s4v:"5", s4l:"Pays du Golfe" },
    how:{ label:"Comment ça marche", title:"Aussi simple que ", titleSpan:"commander un taxi", steps:[{icon:"📋",t:"Tu postes ton besoin",d:"Matière, niveau, durée. 30 secondes chrono."},{icon:"⚡",t:"Les profs répondent",d:"Les enseignants disponibles font leurs offres."},{icon:"👆",t:"Tu choisis",d:"Consulte les profils, notes et avis."},{icon:"🎓",t:"Cours en ligne !",d:"Lien visio envoyé automatiquement. Tu paies après."}] },
    subjects:{ label:"Toutes les matières", title:"Les maths en ", titleSpan:"anglais, arabe ou français" },
    form:{ title:"Poste ton annonce", sub:"Décris ton besoin en 30 secondes.", subject:"Matière *", lang:"Langue d'enseignement *", curriculum:"Cursus *", level:"Niveau *", cycle:"Cycle", duration:"Durée", budget:"Budget max", age:"Âge de l'élève", msg:"Message pour les enseignants", msgPh:"Décris les difficultés, objectifs, disponibilité...", publish:"Publier l'annonce →", onlineBanner:"Tous les cours se font en visioconférence — lien envoyé automatiquement après réservation." },
    bids:{ title:"Offres reçues", new:"nouvelles offres", payAfter:"💳 Paiement UNIQUEMENT après le cours dispensé", choose:"Choisir →", back:"← Modifier mon annonce" },
    confirm:{ title:"Réservation confirmée !", sub1:"Tu as choisi ", sub2:". Le lien visio sera envoyé par email.", subject:"Cours", teacher:"Enseignant", price:"Prix", pay:"Paiement après le cours", secured:"✓ Sécurisé", newReq:"Poster une nouvelle annonce" },
    teacher:{ hello:"Bonjour, Sarah 👋", sub:"Nouvelles annonces correspondant à ton profil.", revenue:"ce mois", courses:"Cours", rating:"Note", newAds:"Nouvelles annonces", bid:"Faire une offre →", ignore:"Ignorer", suggestions:"Suggestions pour toi", withdrawal:"Retrait automatique", wI:"Immédiat", wW:"Hebdomadaire", wM:"Mensuel", wInfo:"Tes gains sont virés automatiquement sur ton compte bancaire.", profile:"Mon profil" },
    bidForm:{ back:"← Retour", price:"Ton prix", maxB:"Budget max élève", comm:"Commission (15%)", ded:"déduits", recv:"✓ Tu recevras", afterC:"après commission", msg:"Ton message à l'élève", msgPh:"Présente-toi, ton expérience, ta disponibilité...", send:"Envoyer mon offre →" },
    onboard:{ title:"Crée ton profil enseignant", sub:"Rejoins +200 enseignants vérifiés dans le Golfe.", name:"Nom complet *", email:"Email *", phone:"Téléphone", bio:"Biographie", bioPh:"Ton parcours et ta pédagogie...", cycle:"Niveau(x) enseigné(s) *", subjects:"Matières *", curriculum:"Cursus *", langTeach:"Langue(s) d'enseignement *", rate:"Tarif horaire", eid:"Emirates ID / Iqama *", diploma:"Diplôme(s) *", eidPh:"Uploader pièce d'identité (PDF/JPG)", diplomaPh:"Uploader diplôme(s) (PDF)", submit:"Créer mon profil →" },
    cycles:["Élémentaire (6-11 ans)","Collège (11-15 ans)","Lycée (15-18 ans)"],
    instrLangs:["Anglais","Arabe","Français"],
    durations:["30 min","1h","1h30","2h","2h30","3h"],
    footer:"La marketplace de cours particuliers 100% en ligne pour le Golfe. Enseignants vérifiés, paiement après le cours.",
  },
};

const TEACHERS = [
  { initials:"سا", name:{en:"Sarah Al-Mansouri",ar:"سارة المنصوري",fr:"Sarah Al-Mansouri"}, verified:true, subjects:["Mathematics","Arabic","Physics & Chemistry"], instrLangs:["English","Arabic"], rate:90, rating:4.9, reviews:47, bg:"#EEF0FF", color:"#5B4FE8", country:"UAE", cycles:["Middle School","High School"] },
  { initials:"كم", name:{en:"Karim Mansour",ar:"كريم منصور",fr:"Karim Mansour"}, verified:true, subjects:["French","History & Geography"], instrLangs:["French","Arabic"], rate:75, rating:4.6, reviews:23, bg:"#E6FAF8", color:"#0ABFA3", country:"KSA", cycles:["Primary","Middle School"] },
  { initials:"ند", name:{en:"Nadia Deschamps",ar:"ناديا دوشان",fr:"Nadia Deschamps"}, verified:true, subjects:["Mathematics","Biology (SVT)"], instrLangs:["French","English"], rate:110, rating:5.0, reviews:11, bg:"#FEF6E4", color:"#B45309", country:"QAT", cycles:["High School"] },
  { initials:"را", name:{en:"Rania Aziz",ar:"رانيا عزيز",fr:"Rania Aziz"}, verified:false, subjects:["English","Spanish"], instrLangs:["English","Arabic","French"], rate:65, rating:4.4, reviews:8, bg:"#FEE2E2", color:"#B91C1C", country:"KWT", cycles:["Primary","Middle School"] },
];
const BIDS = [
  { initials:"سا", name:{en:"Sarah Al-Mansouri",ar:"سارة المنصوري",fr:"Sarah Al-Mansouri"}, rating:4.9, reviews:47, price:90, msg:{en:"Certified teacher, 8 yrs exp. Algebra specialist. Available tomorrow 5pm.",ar:"مدرّسة معتمدة، 8 سنوات خبرة. متخصصة في الجبر. متاحة غداً الساعة 5 مساءً.",fr:"Prof certifiée, 8 ans d'exp. Spécialiste en algèbre. Dispo demain 17h."}, bg:"#EEF0FF", color:"#5B4FE8" },
  { initials:"كم", name:{en:"Karim M.",ar:"كريم م.",fr:"Karim M."}, rating:4.6, reviews:23, price:75, msg:{en:"Engineer, visual & playful approach. Fast results guaranteed.",ar:"مهندس، أسلوب مرئي وممتع. نتائج سريعة مضمونة.",fr:"Ingénieur, méthode visuelle et ludique. Résultats rapides garantis."}, bg:"#E6FAF8", color:"#0ABFA3" },
  { initials:"ند", name:{en:"Nadia D.",ar:"ناديا د.",fr:"Nadia D."}, rating:5.0, reviews:11, price:110, msg:{en:"Agrégée in maths, former prep school. I adapt to every student.",ar:"أستاذة معتمدة في الرياضيات. أتكيف مع كل طالب.",fr:"Agrégée de maths, ancienne prépa. Je m'adapte à chaque élève."}, bg:"#FEF6E4", color:"#B45309" },
];
const REQUESTS = [
  { icon:"➕", subject:{en:"Mathematics",ar:"الرياضيات",fr:"Mathématiques"}, instrLang:{en:"Arabic",ar:"بالعربية",fr:"Arabe"}, level:{en:"Grade 9",ar:"الصف التاسع",fr:"3ème"}, duration:"1h", budget:100, time:{en:"5 min ago",ar:"منذ 5 دقائق",fr:"Il y a 5 min"}, cycle:{en:"Middle",ar:"المتوسطة",fr:"Collège"}, country:"UAE" },
  { icon:"⚗️", subject:{en:"Physics & Chemistry",ar:"الفيزياء والكيمياء",fr:"Physique-Chimie"}, instrLang:{en:"English",ar:"بالإنجليزية",fr:"Anglais"}, level:{en:"A-Level",ar:"A-Level",fr:"Terminale"}, duration:"2h", budget:150, time:{en:"23 min ago",ar:"منذ 23 دقيقة",fr:"Il y a 23 min"}, cycle:{en:"High School",ar:"الثانوية",fr:"Lycée"}, country:"KSA" },
  { icon:"🌙", subject:{en:"Arabic",ar:"اللغة العربية",fr:"Arabe"}, instrLang:{en:"Arabic",ar:"بالعربية",fr:"Arabe"}, level:{en:"Year 6",ar:"السنة 6",fr:"Année 6"}, duration:"1h30", budget:80, time:{en:"1h ago",ar:"منذ ساعة",fr:"Il y a 1h"}, cycle:{en:"Primary",ar:"الابتدائية",fr:"Élémentaire"}, country:"QAT" },
];
const SUGGESTIONS = [
  { icon:"➕", subject:{en:"Advanced Algebra",ar:"الجبر المتقدم",fr:"Algèbre avancée"}, level:{en:"Grade 11",ar:"الصف الحادي عشر",fr:"1ère"}, students:6, lang:{en:"in Arabic",ar:"بالعربية",fr:"en arabe"} },
  { icon:"🌙", subject:{en:"Arabic Language",ar:"اللغة العربية",fr:"Langue arabe"}, level:{en:"Grade 7",ar:"الصف السابع",fr:"5ème"}, students:9, lang:{en:"in Arabic",ar:"بالعربية",fr:"en arabe"} },
  { icon:"⚗️", subject:{en:"Chemistry",ar:"الكيمياء",fr:"Chimie"}, level:{en:"A-Level",ar:"A-Level",fr:"Terminale"}, students:4, lang:{en:"in English",ar:"بالإنجليزية",fr:"en anglais"} },
];

const css = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,900;1,9..144,700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#FAFBFF;color:#1A1A2E}
.app-root{font-family:'Nunito',sans-serif}
.app-root.rtl{font-family:'Cairo',sans-serif;direction:rtl}
.nav{position:sticky;top:0;z-index:100;background:rgba(250,251,255,.95);backdrop-filter:blur(14px);border-bottom:1px solid #E8EAF6;padding:0 1.5rem;display:flex;align-items:center;justify-content:space-between;height:64px;gap:12px}
.nav-logo{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#5B4FE8;cursor:pointer;letter-spacing:-.5px;white-space:nowrap}
.rtl .nav-logo{font-family:'Cairo',sans-serif}
.nav-links{display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap}
.nav-link{font-size:13px;color:#6B7280;cursor:pointer;font-weight:700;transition:color .2s;white-space:nowrap}
.nav-link:hover{color:#5B4FE8}
.lang-switch{display:flex;border:1.5px solid #E8EAF6;border-radius:8px;overflow:hidden}
.lang-btn{padding:5px 10px;cursor:pointer;transition:all .15s;color:#6B7280;background:transparent;border:none;font-size:12px;font-weight:800}
.lang-btn.active{background:#5B4FE8;color:#fff}
.country-select{border:1.5px solid #E8EAF6;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;color:#374151;background:#fff;cursor:pointer;outline:none}
.nav-cta{background:#5B4FE8;color:#fff;border:none;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:800;cursor:pointer;transition:background .2s;white-space:nowrap}
.nav-cta:hover{background:#3D34C4}
.hero{min-height:90vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4rem 2rem;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 55% at 50% 0%,#EEEEFF 0%,transparent 70%);z-index:0}
.hero-badge{display:inline-flex;align-items:center;gap:7px;background:#EEF0FF;color:#5B4FE8;border:1px solid #C7C2F8;border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700;margin-bottom:1.5rem;position:relative;z-index:1}
.hero-dot{width:7px;height:7px;border-radius:50%;background:#5B4FE8;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.hero h1{font-family:'Fraunces',serif;font-size:clamp(2.2rem,5.5vw,4rem);font-weight:900;line-height:1.1;letter-spacing:-1px;color:#1A1A2E;max-width:820px;margin-bottom:1.25rem;position:relative;z-index:1}
.rtl .hero h1{font-family:'Cairo',sans-serif;letter-spacing:0}
.hero h1 span{color:#5B4FE8;font-style:italic}
.rtl .hero h1 span{font-style:normal}
.hero p{font-size:1.05rem;color:#6B7280;max-width:540px;line-height:1.75;margin-bottom:2.5rem;position:relative;z-index:1;font-weight:500}
.hero-btns{display:flex;gap:12px;position:relative;z-index:1;flex-wrap:wrap;justify-content:center}
.btn-big{padding:14px 28px;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;border:none;transition:all .2s}
.btn-big-primary{background:#5B4FE8;color:#fff}.btn-big-primary:hover{background:#3D34C4;transform:translateY(-2px)}
.btn-big-outline{background:transparent;color:#5B4FE8;border:2px solid #5B4FE8}.btn-big-outline:hover{background:#EEF0FF}
.hero-stats{display:flex;gap:2.5rem;margin-top:3.5rem;position:relative;z-index:1;flex-wrap:wrap;justify-content:center}
.hero-stat-val{font-family:'Fraunces',serif;font-size:1.8rem;font-weight:900;color:#1A1A2E}
.rtl .hero-stat-val{font-family:'Cairo',sans-serif}
.hero-stat-lbl{font-size:12px;color:#6B7280;margin-top:2px;font-weight:600}
.float-card{position:absolute;background:#fff;border:1px solid #E8EAF6;border-radius:16px;padding:12px 16px;font-size:12px;animation:float 6s ease-in-out infinite;box-shadow:0 4px 20px rgba(91,79,232,.08);font-weight:500}
.float-card:nth-child(1){top:18%;left:4%;animation-delay:0s}
.float-card:nth-child(2){top:24%;right:4%;animation-delay:-2s}
.float-card:nth-child(3){bottom:20%;left:7%;animation-delay:-4s}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.section{padding:5rem 2rem;max-width:1100px;margin:0 auto}
.section-label{font-size:11px;font-weight:800;letter-spacing:.12em;color:#5B4FE8;text-transform:uppercase;margin-bottom:.6rem}
.rtl .section-label{letter-spacing:0}
.section-title{font-family:'Fraunces',serif;font-size:clamp(1.7rem,3.5vw,2.5rem);font-weight:900;letter-spacing:-.3px;color:#1A1A2E;margin-bottom:2.5rem}
.rtl .section-title{font-family:'Cairo',sans-serif;letter-spacing:0}
.section-title span{color:#5B4FE8;font-style:italic}
.rtl .section-title span{font-style:normal}
.steps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1.25rem}
.step-card{background:#fff;border:1.5px solid #E8EAF6;border-radius:18px;padding:1.75rem;position:relative;overflow:hidden;transition:border-color .2s,transform .2s}
.step-card:hover{border-color:#5B4FE8;transform:translateY(-4px)}
.step-num-bg{position:absolute;top:-14px;right:-6px;font-family:'Fraunces',serif;font-size:86px;font-weight:900;color:#F4F5FF;line-height:1;user-select:none}
.rtl .step-num-bg{right:auto;left:-6px}
.step-icon{font-size:28px;margin-bottom:1rem}
.step-card h3{font-family:'Fraunces',serif;font-size:16px;font-weight:700;margin-bottom:.4rem}
.rtl .step-card h3{font-family:'Cairo',sans-serif}
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
.pill-gray{background:#F4F5F7;color:#6B7280}
.pill-amber{background:#FEF6E4;color:#B45309}
.country-flag{font-size:16px}
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
.rtl .page-title{font-family:'Cairo',sans-serif}
.page-sub{font-size:13px;color:#6B7280;margin-bottom:1.5rem;font-weight:500}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.form-group{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.form-label{font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.06em}
.rtl .form-label{letter-spacing:0;font-size:12px}
.form-select,.form-input,.form-textarea{border:1.5px solid #E8EAF6;border-radius:12px;padding:10px 14px;font-size:14px;background:#FAFBFF;color:#1A1A2E;outline:none;transition:border-color .2s;width:100%;font-weight:500}
.app-root.rtl .form-select,.app-root.rtl .form-input,.app-root.rtl .form-textarea{font-family:'Cairo',sans-serif}
.form-select:focus,.form-input:focus,.form-textarea:focus{border-color:#5B4FE8;background:#fff}
.form-textarea{min-height:75px;resize:vertical}
.chips-row{display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:7px 16px;border-radius:20px;font-size:13px;font-weight:700;border:1.5px solid #E8EAF6;background:#fff;cursor:pointer;transition:all .2s}
.chip.selected{background:#5B4FE8;color:#fff;border-color:#5B4FE8}
.chip:hover:not(.selected){border-color:#5B4FE8;color:#5B4FE8}
.chip-teal.selected{background:#0ABFA3;border-color:#0ABFA3}
.submit-btn{width:100%;padding:14px;background:#5B4FE8;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;margin-top:1.25rem;transition:background .2s,transform .1s}
.submit-btn:hover{background:#3D34C4}
.online-banner{display:flex;align-items:center;gap:10px;background:#EEF0FF;border:1.5px solid #C7C2F8;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:700;color:#3D34C4;margin-bottom:1.5rem}
.pay-banner{display:flex;align-items:center;gap:8px;background:#E6FAF8;border:1.5px solid #0ABFA3;border-radius:12px;padding:11px 16px;font-size:13px;font-weight:700;color:#0F6E56;margin-bottom:1.25rem}
.badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge-purple{background:#EEF0FF;color:#5B4FE8}.badge-amber{background:#FEF6E4;color:#B45309}.badge-green{background:#E6FAF8;color:#0ABFA3}.badge-blue{background:#EFF6FF;color:#1D4ED8}.badge-gray{background:#F4F5F7;color:#374151}
.bid-card{border:1.5px solid #E8EAF6;border-radius:18px;padding:1.25rem;margin-bottom:12px;display:flex;align-items:flex-start;gap:16px;transition:border-color .2s,transform .15s;cursor:pointer}
.bid-card:hover{border-color:#5B4FE8;transform:translateX(3px)}
.rtl .bid-card:hover{transform:translateX(-3px)}
.bid-avatar{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;flex-shrink:0}
.bid-name{font-weight:800;font-size:15px;color:#1A1A2E;margin-bottom:3px}
.bid-price{font-family:'Fraunces',serif;font-size:20px;font-weight:900;color:#5B4FE8;white-space:nowrap}
.rtl .bid-price{font-family:'Cairo',sans-serif}
.bid-msg{font-size:12px;color:#6B7280;margin-top:6px;line-height:1.55;font-weight:500}
.choose-btn{padding:8px 16px;background:#5B4FE8;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;transition:background .2s;margin-top:6px}
.choose-btn:hover{background:#3D34C4}
.teacher-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:1.5rem}
.stat-card{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:16px;padding:1rem;text-align:center}
.stat-val{font-family:'Fraunces',serif;font-size:24px;font-weight:900;color:#5B4FE8}
.rtl .stat-val{font-family:'Cairo',sans-serif}
.stat-lbl{font-size:11px;color:#6B7280;margin-top:4px;font-weight:600}
.withdrawal-card{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:16px;padding:1.25rem;margin-bottom:1.5rem}
.suggestions-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:1.5rem}
.suggestion-card{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:14px;padding:1rem;cursor:pointer;transition:all .2s}
.suggestion-card:hover{border-color:#5B4FE8;background:#EEF0FF}
.req-card{border:1.5px solid #E8EAF6;border-radius:16px;padding:1.25rem;margin-bottom:12px;transition:border-color .2s}
.req-card:hover{border-color:#0ABFA3}
.req-title{font-family:'Fraunces',serif;font-size:16px;font-weight:700;color:#1A1A2E}
.rtl .req-title{font-family:'Cairo',sans-serif}
.upload-zone{border:2px dashed #C7C2F8;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;background:#FAFBFF}
.upload-zone:hover{border-color:#5B4FE8;background:#EEF0FF}
.btn-teal{flex:1;padding:9px;background:#0ABFA3;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;transition:background .2s}
.btn-teal:hover{background:#089e87}
.btn-ghost{padding:9px 14px;background:transparent;border:1.5px solid #E8EAF6;border-radius:10px;font-size:13px;color:#6B7280;font-weight:700;cursor:pointer;transition:border-color .2s}
.btn-ghost:hover{border-color:#6B7280;color:#1A1A2E}
.success-screen{text-align:center;padding:3rem 1rem}
.confirm-box{background:#FAFBFF;border:1.5px solid #E8EAF6;border-radius:16px;padding:1.25rem;max-width:320px;margin:0 auto 1.5rem;text-align:start}
.footer{background:#1A1A2E;color:#9CA3AF;padding:3rem 2rem;text-align:center;margin-top:4rem}
.footer-logo{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#fff;margin-bottom:.75rem}
.rtl .footer-logo{font-family:'Cairo',sans-serif}
.toast{position:fixed;bottom:2rem;right:2rem;background:#1A1A2E;color:#fff;padding:14px 20px;border-radius:14px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:10px;z-index:1000;animation:slideUp .3s ease;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.rtl .toast{right:auto;left:2rem}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@media(max-width:700px){.float-card{display:none}.hero-stats{gap:1.5rem}.form-row{grid-template-columns:1fr}.nav-links{display:none}}
`;

const fmtPrice = (price, country) => {
  const c = COUNTRIES.find(x => x.code === country) || COUNTRIES[0];
  if (c.currency === "KWD" || c.currency === "BHD") return `${(price * c.rate).toFixed(2)} ${c.currency}`;
  return `${Math.round(price * c.rate)} ${c.currency}`;
};

export default function TutorApp() {
  const [lang, setLang] = useState("en");
  const [country, setCountry] = useState("UAE");
  const [page, setPage] = useState("home");
  const [appTab, setAppTab] = useState("student-form");
  const [toast, setToast] = useState(null);
  const [selectedBid, setSelectedBid] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [withdrawal, setWithdrawal] = useState("wW");
  const [curriculum, setCurriculum] = useState("");
  const [form, setForm] = useState({ subject:"", instrLang:"", curriculum:"", level:"", cycle:[], duration:"1h", budget:100, message:"" });
  const [teacherForm, setTeacherForm] = useState({ name:"", email:"", cycles:[], subjects:[], curricula:[], instrLangs:[], rate:"", eidUploaded:false, diplomaUploaded:false });
  const [bidForm, setBidForm] = useState({ price:"", message:"" });

  const t = T[lang];
  const isRTL = lang === "ar";
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const toggleArr = (arr, val) => arr.includes(val) ? arr.filter(x=>x!==val) : [...arr,val];

  const currLevels = curriculum && CURRICULA[curriculum] ? CURRICULA[curriculum].levels[lang] || CURRICULA[curriculum].levels["en"] : [];

  const handlePublish = () => {
    if (!form.subject || !form.instrLang || !form.curriculum || !form.level) {
      showToast(lang==="ar"?"⚠️ يرجى ملء الحقول المطلوبة":lang==="fr"?"⚠️ Remplis les champs obligatoires":"⚠️ Please fill in required fields");
      return;
    }
    setAppTab("student-bids");
    showToast(lang==="ar"?"✅ تم نشر الطلب! ردّ 3 مدرسين.":lang==="fr"?"✅ Annonce publiée ! 3 réponses.":"✅ Request posted! 3 tutors responded.");
  };

  const handleBidSubmit = () => {
    if (!bidForm.price || !bidForm.message) {
      showToast(lang==="ar"?"⚠️ أدخل السعر والرسالة":lang==="fr"?"⚠️ Remplis le prix et le message":"⚠️ Fill in price and message");
      return;
    }
    showToast(lang==="ar"?"✅ تم إرسال العرض!":lang==="fr"?"✅ Offre envoyée !":"✅ Offer sent!");
    setBidForm({price:"",message:""}); setSelectedRequest(null); setAppTab("teacher-dashboard");
  };

  const handleTeacherSubmit = () => {
    if (!teacherForm.name || !teacherForm.email || !teacherForm.cycles.length || !teacherForm.subjects.length || !teacherForm.eidUploaded || !teacherForm.diplomaUploaded) {
      showToast(lang==="ar"?"⚠️ أكمل جميع الحقول وارفع وثائقك":lang==="fr"?"⚠️ Complète tous les champs et uploade tes docs":"⚠️ Complete all fields and upload documents");
      return;
    }
    setShowOnboard(false); setAppTab("teacher-dashboard");
    showToast(lang==="ar"?"🎉 تم إنشاء الملف! قيد المراجعة.":lang==="fr"?"🎉 Profil créé ! En vérification.":"🎉 Profile created! Under review.");
  };

  const currentCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];

  return (
    <div className={`app-root${isRTL?" rtl":""}`}>
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-logo" onClick={() => setPage("home")}>TutorApp</div>
        <div className="nav-links">
          <span className="nav-link" onClick={() => { setPage("app"); setAppTab("student-form"); setShowOnboard(false); }}>{t.nav.search}</span>
          <span className="nav-link" onClick={() => { setPage("app"); setAppTab("teacher-dashboard"); setShowOnboard(false); }}>{t.nav.teach}</span>
          <span className="nav-link" onClick={() => setPage("teachers")}>{t.nav.teachers}</span>
          <select className="country-select" value={country} onChange={e => setCountry(e.target.value)}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name[lang]}</option>)}
          </select>
          <div className="lang-switch">
            {["en","ar","fr"].map(l => <button key={l} className={`lang-btn${lang===l?" active":""}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          </div>
        </div>
        <button className="nav-cta" onClick={() => { setPage("app"); setAppTab("student-form"); setShowOnboard(false); }}>{t.nav.start}</button>
      </nav>

      {/* ── HOME ── */}
      {page === "home" && <>
        <section className="hero">
          <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
            <div className="float-card" style={{fontFamily:isRTL?"Cairo,sans-serif":"inherit"}}>
              <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>📋 {lang==="ar"?"طلب جديد":lang==="fr"?"Nouvelle annonce":"New request"}</div>
              <div style={{color:"#6B7280",fontSize:12}}>{lang==="ar"?"رياضيات · الصف التاسع · ساعة · 100 AED":lang==="fr"?"Maths · 3ème · 1h · 100 AED":"Maths · Grade 9 · 1h · 100 AED"}</div>
              <div style={{color:"#0ABFA3",fontSize:12,marginTop:4,fontWeight:700}}>3 {lang==="ar"?"عروض":lang==="fr"?"offres":"offers"} ✓</div>
            </div>
            <div className="float-card" style={{fontFamily:isRTL?"Cairo,sans-serif":"inherit"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,direction:isRTL?"rtl":"ltr"}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:"#EEF0FF",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#5B4FE8"}}>سا</div>
                <div><div style={{fontWeight:800,fontSize:13}}>{lang==="ar"?"سارة م.":"Sarah A."}</div><div style={{color:"#F5A623",fontSize:11}}>★★★★★ 4.9</div></div>
                <div style={{marginInlineStart:"auto",fontWeight:900,color:"#5B4FE8",fontSize:15}}>90 AED</div>
              </div>
            </div>
            <div className="float-card" style={{fontFamily:isRTL?"Cairo,sans-serif":"inherit"}}>
              <div style={{fontWeight:800,fontSize:13,marginBottom:4,color:"#0ABFA3"}}>🎓 {lang==="ar"?"تم تأكيد الحصة ✓":lang==="fr"?"Cours confirmé ✓":"Lesson confirmed ✓"}</div>
              <div style={{color:"#6B7280",fontSize:12}}>📹 {lang==="ar"?"تم إرسال رابط الفيديو":lang==="fr"?"Lien visio envoyé":"Video link sent"}</div>
              <div style={{color:"#6B7280",fontSize:12}}>💳 {lang==="ar"?"الدفع بعد الحصة":lang==="fr"?"Paiement après le cours":"Pay after lesson"}</div>
            </div>
          </div>
          <div className="hero-badge"><div className="hero-dot"></div>{t.hero.badge}</div>
          <h1>{t.hero.h1}<span>{t.hero.h1span}</span>{t.hero.h1b}</h1>
          <p>{t.hero.sub}</p>
          <div className="hero-btns">
            <button className="btn-big btn-big-primary" onClick={() => { setPage("app"); setAppTab("student-form"); setShowOnboard(false); }}>{t.hero.cta1}</button>
            <button className="btn-big btn-big-outline" onClick={() => { setPage("app"); setAppTab("teacher-dashboard"); setShowOnboard(true); }}>{t.hero.cta2}</button>
          </div>
          <div className="hero-stats">
            {[{v:t.hero.s1v,l:t.hero.s1l},{v:t.hero.s2v,l:t.hero.s2l},{v:t.hero.s3v,l:t.hero.s3l},{v:t.hero.s4v,l:t.hero.s4l}].map((s,i) =>
              <div key={i} style={{textAlign:"center"}}><div className="hero-stat-val">{s.v}</div><div className="hero-stat-lbl">{s.l}</div></div>
            )}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",borderBottom:"1.5px solid #E8EAF6",padding:"4rem 0"}}>
          <div className="section" style={{padding:"0 2rem"}}>
            <div className="section-label">{t.how.label}</div>
            <div className="section-title">{t.how.title}<span>{t.how.titleSpan}</span></div>
            <div className="steps-grid">{t.how.steps.map((s,i) => <div className="step-card" key={i}><div className="step-num-bg">{i+1}</div><div className="step-icon">{s.icon}</div><h3>{s.t}</h3><p>{s.d}</p></div>)}</div>
          </div>
        </div>

        {/* SUBJECTS */}
        <div className="section">
          <div className="section-label">{t.subjects.label}</div>
          <div className="section-title">{t.subjects.title}<span>{t.subjects.titleSpan}</span></div>
          <div className="subj-grid">
            {SUBJECTS.map(s => <div className="subj-card" key={s.en} onClick={() => { setPage("app"); setAppTab("student-form"); }}><span style={{fontSize:20}}>{s.icon}</span><span>{s[lang]}</span></div>)}
          </div>
        </div>

        {/* TEACHERS PREVIEW */}
        <div style={{background:"#fff",borderTop:"1.5px solid #E8EAF6",padding:"4rem 0"}}>
          <div className="section" style={{padding:"0 2rem"}}>
            <div className="section-label">{t.teachersPage?.label||t.nav.teachers}</div>
            <div className="section-title" style={{marginBottom:"2rem"}}>{lang==="ar"?"جميعهم موثّقون، جميعهم متحمسون":lang==="fr"?"Tous vérifiés, tous passionnés":"All verified, all passionate"}</div>
            <div className="teachers-grid">{TEACHERS.map(tc => (
              <div className="teacher-card" key={tc.name.en} onClick={() => setPage("teachers")}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}>
                  <div className="tc-avatar" style={{background:tc.bg,color:tc.color,fontFamily:isRTL?"Cairo,sans-serif":"Fraunces,serif"}}>{tc.initials}</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:"#1A1A2E"}}>{tc.name[lang]}</div>
                    {tc.verified && <div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ {lang==="ar"?"موثّق":lang==="fr"?"Vérifié":"Verified"}</div>}
                    <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{COUNTRIES.find(c=>c.code===tc.country)?.flag} {COUNTRIES.find(c=>c.code===tc.country)?.name[lang]}</div>
                  </div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>
                  {tc.subjects.slice(0,2).map(s => { const subj=SUBJECTS.find(x=>x.en===s); return <span className="pill" key={s}>{subj?subj[lang]:s}</span>; })}
                  {tc.instrLangs.map(l => <span className="pill pill-teal" key={l}>{l}</span>)}
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{fmtPrice(tc.rate,country)}<span style={{fontSize:12,fontWeight:500,color:"#6B7280"}}>/h</span></div>
                  <div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>★ {tc.rating} ({tc.reviews})</div>
                </div>
              </div>
            ))}</div>
          </div>
        </div>
      </>}

      {/* ── TEACHERS PAGE ── */}
      {page === "teachers" && <div className="section">
        <div className="section-label">{t.nav.teachers}</div>
        <div className="section-title" style={{marginBottom:"2rem"}}>{lang==="ar"?"جميعهم موثّقون":lang==="fr"?"Tous vérifiés":"All verified"}</div>
        <div className="teachers-grid">{TEACHERS.map(tc => (
          <div className="teacher-card" key={tc.name.en}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem"}}>
              <div className="tc-avatar" style={{background:tc.bg,color:tc.color,fontFamily:isRTL?"Cairo,sans-serif":"Fraunces,serif"}}>{tc.initials}</div>
              <div>
                <div style={{fontWeight:800,fontSize:15}}>{tc.name[lang]}</div>
                {tc.verified && <div style={{fontSize:11,color:"#0ABFA3",fontWeight:700}}>✓ {lang==="ar"?"موثّق بالهوية":lang==="fr"?"Vérifié Emirates ID":"Verified Emirates ID"}</div>}
                <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{COUNTRIES.find(c=>c.code===tc.country)?.flag} {COUNTRIES.find(c=>c.code===tc.country)?.name[lang]}</div>
              </div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:"0.75rem"}}>
              {tc.subjects.map(s => { const subj=SUBJECTS.find(x=>x.en===s); return <span className="pill" key={s}>{subj?subj[lang]:s}</span>; })}
              {tc.instrLangs.map(l => <span className="pill pill-teal" key={l}>{l}</span>)}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <div style={{fontFamily:"Fraunces,serif",fontSize:17,fontWeight:900}}>{fmtPrice(tc.rate,country)}<span style={{fontSize:12,fontWeight:500,color:"#6B7280"}}>/h</span></div>
              <div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>★ {tc.rating} ({tc.reviews})</div>
            </div>
            <button className="submit-btn" style={{marginTop:0,padding:"10px"}} onClick={() => { setPage("app"); setAppTab("student-form"); setShowOnboard(false); }}>{lang==="ar"?"احجز ←":lang==="fr"?"Réserver →":"Book →"}</button>
          </div>
        ))}</div>
      </div>}

      {/* ── APP ── */}
      {page === "app" && <div className="section">
        <div className="app-container">
          <div className="app-topbar">
            <div className="app-dot-row"><div className="app-dot" style={{background:"#E24B4A"}}></div><div className="app-dot" style={{background:"#F5A623"}}></div><div className="app-dot" style={{background:"#0ABFA3"}}></div></div>
            <div className="app-url">tutorapp.ae · 🔒 {currentCountry.flag} {currentCountry.name[lang]}</div>
          </div>
          <div className="app-tabs">
            <div className={`app-tab${["student-form","student-bids","student-confirm"].includes(appTab)?" active":""}`} onClick={() => { setAppTab("student-form"); setShowOnboard(false); }}>🎓 {t.nav.search}</div>
            <div className={`app-tab${["teacher-dashboard","teacher-bid"].includes(appTab)?" active":""}`} onClick={() => { setAppTab("teacher-dashboard"); setShowOnboard(false); }}>📚 {t.nav.teach}</div>
          </div>
          <div className="app-body">

            {/* STUDENT FORM */}
            {appTab==="student-form" && <>
              <div className="page-title">{t.form.title}</div>
              <div className="page-sub">{t.form.sub}</div>
              <div className="online-banner">📹 {t.form.onlineBanner}</div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.form.subject}</label>
                  <select className="form-select" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}>
                    <option value="">{lang==="ar"?"اختر...":lang==="fr"?"Choisir...":"Choose..."}</option>
                    {SUBJECTS.map(s=><option key={s.en} value={s.en}>{s[lang]}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.form.lang}</label>
                  <select className="form-select" value={form.instrLang} onChange={e=>setForm({...form,instrLang:e.target.value})}>
                    <option value="">{lang==="ar"?"اختر...":lang==="fr"?"Choisir...":"Choose..."}</option>
                    {t.instrLangs.map(l=><option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.form.curriculum}</label>
                  <select className="form-select" value={form.curriculum} onChange={e=>{setForm({...form,curriculum:e.target.value,level:""});setCurriculum(e.target.value);}}>
                    <option value="">{lang==="ar"?"اختر...":lang==="fr"?"Choisir...":"Choose..."}</option>
                    {Object.entries(CURRICULA).map(([k,v])=><option key={k} value={k}>{v.label[lang]}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.form.level}</label>
                  <select className="form-select" value={form.level} onChange={e=>setForm({...form,level:e.target.value})} disabled={!currLevels.length}>
                    <option value="">{currLevels.length?lang==="ar"?"اختر...":lang==="fr"?"Choisir...":"Choose...":lang==="ar"?"اختر المنهج أولاً":lang==="fr"?"Choisir un cursus d'abord":"Select curriculum first"}</option>
                    {currLevels.map(l=><option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t.form.cycle}</label>
                <div className="chips-row">{t.cycles.map(c=><div key={c} className={`chip${form.cycle.includes(c)?" selected":""}`} onClick={()=>setForm({...form,cycle:toggleArr(form.cycle,c)})}>{c}</div>)}</div>
              </div>
              <div className="form-group">
                <label className="form-label">{t.form.duration}</label>
                <div className="chips-row">{t.durations.map(d=><div key={d} className={`chip${form.duration===d?" selected":""}`} onClick={()=>setForm({...form,duration:d})}>{d}</div>)}</div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.form.budget} ({currentCountry.currency}/h)</label>
                  <input className="form-input" type="number" min="30" value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} />
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.form.age}</label>
                  <input className="form-input" type="number" min="6" max="18" placeholder="ex: 14" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t.form.msg}</label>
                <textarea className="form-textarea" placeholder={t.form.msgPh} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} />
              </div>
              <button className="submit-btn" onClick={handlePublish}>{t.form.publish}</button>
            </>}

            {/* STUDENT BIDS */}
            {appTab==="student-bids" && <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
                <div><div className="page-title">{t.bids.title}</div><div className="page-sub" style={{marginBottom:0}}>{form.subject||"Maths"} · {form.instrLang} · {form.level} · {form.duration}</div></div>
                <span className="badge badge-amber">3 {t.bids.new}</span>
              </div>
              <div className="pay-banner">{t.bids.payAfter}</div>
              {BIDS.map((b,i)=><div key={i} className="bid-card">
                <div className="bid-avatar" style={{background:b.bg,color:b.color,fontFamily:isRTL?"Cairo,sans-serif":"Fraunces,serif"}}>{b.initials}</div>
                <div style={{flex:1}}>
                  <div className="bid-name">{b.name[lang]}</div>
                  <div style={{fontSize:12,color:"#6B7280",display:"flex",gap:8,flexWrap:"wrap",marginTop:2,fontWeight:600}}>
                    <span style={{color:"#F5A623"}}>{"★".repeat(Math.floor(b.rating))}</span><span>{b.rating} ({b.reviews})</span><span className="badge badge-green">📹 {lang==="ar"?"عبر الإنترنت":lang==="fr"?"En ligne":"Online"}</span>
                  </div>
                  <div className="bid-msg">{b.msg[lang]}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                  <div className="bid-price">{fmtPrice(b.price,country)}</div>
                  <button className="choose-btn" onClick={()=>{setSelectedBid(b);setAppTab("student-confirm");}}>{t.bids.choose}</button>
                </div>
              </div>)}
              <div style={{textAlign:"center",marginTop:"1rem"}}><button className="btn-ghost" onClick={()=>setAppTab("student-form")}>{t.bids.back}</button></div>
            </>}

            {/* STUDENT CONFIRM */}
            {appTab==="student-confirm" && <div className="success-screen">
              <div style={{fontSize:60,marginBottom:"1rem"}}>🎉</div>
              <div style={{fontFamily:"Fraunces,serif",fontSize:24,fontWeight:900,color:"#1A1A2E",marginBottom:"0.75rem"}}>{t.confirm.title}</div>
              <div style={{fontSize:14,color:"#6B7280",lineHeight:1.65,maxWidth:360,margin:"0 auto 1.5rem",fontWeight:500}}>{t.confirm.sub1}<strong>{selectedBid?.name[lang]}</strong>{t.confirm.sub2}</div>
              <div className="confirm-box">
                {[{l:t.confirm.subject,v:form.subject||"Mathematics"},{l:t.confirm.teacher,v:selectedBid?.name[lang]},{l:t.confirm.price,v:fmtPrice(selectedBid?.price||90,country),bold:true,purple:true}].map((row,i)=>
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:8}}><span style={{color:"#6B7280"}}>{row.l}</span><span style={{fontWeight:row.bold?900:700,color:row.purple?"#5B4FE8":"#1A1A2E"}}>{row.v}</span></div>
                )}
                <div style={{borderTop:"1.5px solid #E8EAF6",paddingTop:10,display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6B7280"}}>{t.confirm.pay}</span><span style={{color:"#0ABFA3",fontWeight:700}}>{t.confirm.secured}</span></div>
              </div>
              <button className="submit-btn" style={{maxWidth:300,margin:"0 auto"}} onClick={()=>{setAppTab("student-form");setSelectedBid(null);}}>{t.confirm.newReq}</button>
            </div>}

            {/* TEACHER ONBOARD */}
            {appTab==="teacher-dashboard" && showOnboard && <>
              <div className="page-title">{t.onboard.title}</div>
              <div className="page-sub">{t.onboard.sub}</div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.name}</label><input className="form-input" placeholder={lang==="ar"?"سارة المنصوري":"Sarah Al-Mansouri"} value={teacherForm.name} onChange={e=>setTeacherForm({...teacherForm,name:e.target.value})} /></div>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.email}</label><input className="form-input" type="email" placeholder="sarah@email.com" value={teacherForm.email} onChange={e=>setTeacherForm({...teacherForm,email:e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">{t.onboard.cycle}</label><div className="chips-row">{t.cycles.map(c=><div key={c} className={`chip${teacherForm.cycles.includes(c)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,cycles:toggleArr(teacherForm.cycles,c)})}>{c}</div>)}</div></div>
              <div className="form-group"><label className="form-label">{t.onboard.curriculum}</label><div className="chips-row">{Object.entries(CURRICULA).map(([k,v])=><div key={k} className={`chip chip-teal${teacherForm.curricula.includes(k)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,curricula:toggleArr(teacherForm.curricula,k)})}>{v.label[lang]}</div>)}</div></div>
              <div className="form-group"><label className="form-label">{t.onboard.subjects}</label><div className="chips-row">{SUBJECTS.map(s=><div key={s.en} className={`chip${teacherForm.subjects.includes(s.en)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,subjects:toggleArr(teacherForm.subjects,s.en)})}>{s[lang]}</div>)}</div></div>
              <div className="form-group"><label className="form-label">{t.onboard.langTeach}</label><div className="chips-row">{t.instrLangs.map(l=><div key={l} className={`chip${teacherForm.instrLangs.includes(l)?" selected":""}`} onClick={()=>setTeacherForm({...teacherForm,instrLangs:toggleArr(teacherForm.instrLangs,l)})}>{l}</div>)}</div></div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.rate} ({currentCountry.currency}/h)</label><input className="form-input" type="number" placeholder="ex: 90" value={teacherForm.rate} onChange={e=>setTeacherForm({...teacherForm,rate:e.target.value})} /></div>
                <div className="form-group" style={{marginBottom:0}}><label className="form-label">{t.onboard.bio}</label><input className="form-input" placeholder={t.onboard.bioPh} /></div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.onboard.eid} 🔒</label>
                  <div className="upload-zone" onClick={()=>setTeacherForm({...teacherForm,eidUploaded:true})}>
                    {teacherForm.eidUploaded?<><div style={{fontSize:28}}>✅</div><div style={{fontSize:13,fontWeight:700,color:"#0ABFA3"}}>{lang==="ar"?"تم الرفع!":lang==="fr"?"Uploadé !":"Uploaded!"}</div></>:<><div style={{fontSize:28}}>🪪</div><div style={{fontSize:12,fontWeight:700,color:"#5B4FE8"}}>{t.onboard.eidPh}</div><div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>PDF · JPG · PNG</div></>}
                  </div>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{t.onboard.diploma} 🎓</label>
                  <div className="upload-zone" onClick={()=>setTeacherForm({...teacherForm,diplomaUploaded:true})}>
                    {teacherForm.diplomaUploaded?<><div style={{fontSize:28}}>✅</div><div style={{fontSize:13,fontWeight:700,color:"#0ABFA3"}}>{lang==="ar"?"تم الرفع!":lang==="fr"?"Uploadé !":"Uploaded!"}</div></>:<><div style={{fontSize:28}}>📜</div><div style={{fontSize:12,fontWeight:700,color:"#5B4FE8"}}>{t.onboard.diplomaPh}</div><div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>PDF · JPG</div></>}
                  </div>
                </div>
              </div>
              <button className="submit-btn" onClick={handleTeacherSubmit}>{t.onboard.submit}</button>
            </>}

            {/* TEACHER DASHBOARD */}
            {appTab==="teacher-dashboard" && !showOnboard && !selectedRequest && <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:8}}>
                <div><div className="page-title">{t.teacher.hello}</div><div className="page-sub" style={{marginBottom:0}}>{t.teacher.sub}</div></div>
                <button className="btn-ghost" onClick={()=>setShowOnboard(true)}>{t.teacher.profile}</button>
              </div>
              <div className="teacher-stats">
                <div className="stat-card"><div className="stat-val">{fmtPrice(3240,country)}</div><div className="stat-lbl">{t.teacher.revenue}</div></div>
                <div className="stat-card"><div className="stat-val">12</div><div className="stat-lbl">{t.teacher.courses}</div></div>
                <div className="stat-card"><div className="stat-val">4.9★</div><div className="stat-lbl">{t.teacher.rating}</div></div>
              </div>
              <div className="withdrawal-card">
                <div style={{fontWeight:800,fontSize:14,color:"#1A1A2E",marginBottom:10}}>💳 {t.teacher.withdrawal}</div>
                <div className="chips-row">{[["wI",t.teacher.wI],["wW",t.teacher.wW],["wM",t.teacher.wM]].map(([k,v])=><div key={k} className={`chip${withdrawal===k?" selected":""}`} onClick={()=>setWithdrawal(k)}>{v}</div>)}</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:8,fontWeight:500}}>ℹ️ {t.teacher.wInfo}</div>
              </div>
              <div style={{fontWeight:800,fontSize:16,marginBottom:"1rem",color:"#1A1A2E"}}>💡 {t.teacher.suggestions}</div>
              <div className="suggestions-grid">{SUGGESTIONS.map((s,i)=><div className="suggestion-card" key={i} onClick={()=>{setSelectedRequest(REQUESTS[i]);setAppTab("teacher-bid");}}>
                <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
                <div style={{fontWeight:800,fontSize:13,color:"#1A1A2E"}}>{s.subject[lang]}</div>
                <div style={{fontSize:12,color:"#6B7280",fontWeight:600}}>{s.level[lang]} · {s.lang[lang]}</div>
                <div style={{fontSize:11,color:"#0ABFA3",fontWeight:700,marginTop:4}}>🔥 {s.students} {lang==="ar"?"طلاب":lang==="fr"?"élèves":"students"}</div>
              </div>)}</div>
              <div style={{fontWeight:800,fontSize:16,marginBottom:"1rem",color:"#1A1A2E"}}>{t.teacher.newAds} ({REQUESTS.length})</div>
              {REQUESTS.map((r,i)=><div className="req-card" key={i}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>{r.icon}</span><div className="req-title">{r.subject[lang]}</div></div>
                  <span style={{fontSize:11,color:"#9CA3AF",fontWeight:600}}>{COUNTRIES.find(c=>c.code===r.country)?.flag} {r.time[lang]}</span>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  <span className="badge badge-purple">{r.level[lang]}</span>
                  <span className="badge badge-blue">🗣 {r.instrLang[lang]}</span>
                  <span className="badge badge-amber">{r.duration}</span>
                  <span className="badge badge-green">📹 {lang==="ar"?"عبر الإنترنت":lang==="fr"?"En ligne":"Online"}</span>
                  <span className="badge badge-gray">{r.cycle[lang]}</span>
                  <span className="badge" style={{background:"#F4F5FF",color:"#3D34C4",fontWeight:700}}>{fmtPrice(r.budget,country)}/h</span>
                </div>
                <div style={{display:"flex",gap:8}}><button className="btn-teal" onClick={()=>{setSelectedRequest(r);setAppTab("teacher-bid");}}>{t.teacher.bid}</button><button className="btn-ghost">{t.teacher.ignore}</button></div>
              </div>)}
            </>}

            {/* TEACHER BID */}
            {appTab==="teacher-bid" && selectedRequest && <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1.5rem",flexWrap:"wrap"}}>
                <button className="btn-ghost" onClick={()=>{setAppTab("teacher-dashboard");setSelectedRequest(null);}}>{t.bidForm.back}</button>
                <div><div className="page-title" style={{marginBottom:0}}>{selectedRequest.subject[lang]}</div><div className="page-sub" style={{marginBottom:0}}>{selectedRequest.level[lang]} · {selectedRequest.instrLang[lang]} · 📹</div></div>
              </div>
              <div style={{background:"#FAFBFF",border:"1.5px solid #E8EAF6",borderRadius:14,padding:"1rem",marginBottom:"1.5rem",fontSize:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#6B7280",fontWeight:600}}>{t.bidForm.maxB}</span><span style={{fontWeight:800}}>{fmtPrice(selectedRequest.budget,country)}/h</span></div>
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#6B7280",fontWeight:600}}>{t.bidForm.comm}</span><span style={{color:"#9CA3AF",fontWeight:600}}>{fmtPrice(Math.round(selectedRequest.budget*0.15),country)} {t.bidForm.ded}</span></div>
              </div>
              <div className="form-group">
                <label className="form-label">{t.bidForm.price} ({currentCountry.currency}/h)</label>
                <input className="form-input" type="number" min="30" placeholder={`Max: ${fmtPrice(selectedRequest.budget,country)}`} value={bidForm.price} onChange={e=>setBidForm({...bidForm,price:e.target.value})} />
                {bidForm.price && <div style={{fontSize:13,color:"#0ABFA3",marginTop:4,fontWeight:700}}>{t.bidForm.recv} {fmtPrice(Math.round(bidForm.price*0.85),country)} {t.bidForm.afterC}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">{t.bidForm.msg}</label>
                <textarea className="form-textarea" style={{minHeight:100}} placeholder={t.bidForm.msgPh} value={bidForm.message} onChange={e=>setBidForm({...bidForm,message:e.target.value})} />
              </div>
              <button className="submit-btn" onClick={handleBidSubmit}>{t.bidForm.send}</button>
            </>}

          </div>
        </div>
      </div>}

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-logo">TutorApp</div>
        <div style={{fontSize:13,lineHeight:1.65,maxWidth:500,margin:"0 auto"}}>{t.footer}</div>
        <div style={{marginTop:"1.5rem",fontSize:12,color:"#4B5563"}}>© 2025 TutorApp · {COUNTRIES.map(c=>`${c.flag} ${c.name[lang]}`).join(" · ")}</div>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
