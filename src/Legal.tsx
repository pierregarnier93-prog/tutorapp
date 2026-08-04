const LAST_UPDATED = "2026-08-05";
const COMPANY = "TutorApp";
const CONTACT = "hello@tutorapp.online";

type Section = { h: string; p: string[] };
type Doc = { title: string; intro: string; sections: Section[] };

const DOCS: Record<string, Record<"en" | "fr" | "ar", Doc>> = {
  terms: {
    en: {
      title: "Terms of Service",
      intro: `These terms govern your use of ${COMPANY}, an online marketplace connecting parents and legal guardians with independent private tutors across the Gulf region.`,
      sections: [
        { h: "1. Who may use the service", p: [
          `Accounts must be created by adults aged 18 or over. Where lessons are for a minor, the account must be held by the child's parent or legal guardian, who is responsible for all activity on it.`,
          `Tutors must be legally entitled to provide tutoring services in their country of residence, and must hold any licence that country requires. In the United Arab Emirates, this includes the official tutoring permit.`,
        ]},
        { h: "2. What TutorApp is and is not", p: [
          `${COMPANY} is an intermediary. We introduce parents to independent tutors and provide the tools to arrange, hold and pay for lessons. Tutors are not our employees, agents or representatives.`,
          `We verify the identity documents, qualifications and permits that tutors submit before their profile is published. Verification is a documentary check — it is not a guarantee of teaching quality or of any particular academic outcome.`,
        ]},
        { h: "3. Fees", p: [
          `Using ${COMPANY} to find a tutor is free for parents. We charge no commission and no booking fee — the price you see is the tutor's rate, and that is what you pay.`,
          `Tutors pay a subscription to access student requests. Subscription pricing is shown before purchase and includes a free trial period. Subscriptions renew automatically until cancelled, and may be cancelled at any time from the tutor's account.`,
        ]},
        { h: "4. Payment and cancellation", p: [
          `Card details are handled by Stripe. ${COMPANY} does not store card numbers.`,
          `For a single lesson, your card is authorised at booking and charged after the lesson has taken place. A lesson cancelled more than 24 hours in advance is not charged.`,
          `For a lesson pack, the pack is paid at purchase. You may cancel a pack at any time and unused lessons are refunded to the original payment method.`,
        ]},
        { h: "5. Conduct", p: [
          `Lessons take place over video within the platform. Do not use ${COMPANY} to harass, to share unlawful material, or to arrange payment outside the platform in order to avoid tutor subscription obligations.`,
          `We may suspend or close an account that breaches these terms or the Child Protection Charter.`,
        ]},
        { h: "6. Liability", p: [
          `${COMPANY} is not liable for the content, quality or outcome of any lesson, which is the responsibility of the individual tutor. Nothing in these terms limits liability that cannot lawfully be limited.`,
        ]},
        { h: "7. Governing law", p: [
          `These terms are governed by the laws of the United Arab Emirates. Disputes fall to the competent courts of the Emirate of Dubai.`,
        ]},
      ],
    },
    fr: {
      title: "Conditions Générales d'Utilisation",
      intro: `Ces conditions régissent votre utilisation de ${COMPANY}, une marketplace en ligne qui met en relation des parents et tuteurs légaux avec des enseignants particuliers indépendants dans la région du Golfe.`,
      sections: [
        { h: "1. Qui peut utiliser le service", p: [
          `Les comptes doivent être créés par des adultes de 18 ans ou plus. Lorsque les cours concernent un mineur, le compte doit être détenu par son parent ou tuteur légal, qui est responsable de toute activité sur ce compte.`,
          `Les enseignants doivent être légalement autorisés à donner des cours particuliers dans leur pays de résidence et détenir toute licence exigée par ce pays. Aux Émirats arabes unis, cela inclut le permis officiel d'enseignement.`,
        ]},
        { h: "2. Ce qu'est TutorApp, et ce qu'il n'est pas", p: [
          `${COMPANY} est un intermédiaire. Nous présentons des parents à des enseignants indépendants et fournissons les outils pour organiser, tenir et payer les cours. Les enseignants ne sont ni nos employés, ni nos agents, ni nos représentants.`,
          `Nous vérifions les pièces d'identité, diplômes et permis soumis par les enseignants avant la publication de leur profil. Cette vérification est un contrôle documentaire — elle ne garantit ni la qualité pédagogique ni un résultat scolaire particulier.`,
        ]},
        { h: "3. Tarifs", p: [
          `Utiliser ${COMPANY} pour trouver un enseignant est gratuit pour les parents. Nous ne prélevons aucune commission ni frais de réservation — le prix affiché est le tarif de l'enseignant, et c'est ce que vous payez.`,
          `Les enseignants paient un abonnement pour accéder aux annonces. Le prix de l'abonnement est indiqué avant l'achat et comprend une période d'essai gratuite. L'abonnement est reconduit automatiquement jusqu'à résiliation, possible à tout moment depuis le compte enseignant.`,
        ]},
        { h: "4. Paiement et annulation", p: [
          `Les coordonnées bancaires sont traitées par Stripe. ${COMPANY} ne conserve aucun numéro de carte.`,
          `Pour un cours à l'unité, votre carte est autorisée à la réservation et débitée après le cours. Un cours annulé plus de 24 heures à l'avance n'est pas facturé.`,
          `Pour un pack de cours, le pack est payé à l'achat. Vous pouvez annuler un pack à tout moment ; les cours non utilisés sont remboursés sur le moyen de paiement d'origine.`,
        ]},
        { h: "5. Comportement", p: [
          `Les cours se déroulent en visioconférence au sein de la plateforme. N'utilisez pas ${COMPANY} pour harceler, partager du contenu illicite, ou organiser un paiement hors plateforme afin de contourner l'abonnement enseignant.`,
          `Nous pouvons suspendre ou fermer un compte qui enfreint ces conditions ou la Charte de Protection des Mineurs.`,
        ]},
        { h: "6. Responsabilité", p: [
          `${COMPANY} n'est pas responsable du contenu, de la qualité ou du résultat d'un cours, qui relèvent de l'enseignant. Rien dans ces conditions ne limite une responsabilité qui ne peut légalement l'être.`,
        ]},
        { h: "7. Droit applicable", p: [
          `Ces conditions sont régies par le droit des Émirats arabes unis. Les litiges relèvent des tribunaux compétents de l'Émirat de Dubaï.`,
        ]},
      ],
    },
    ar: {
      title: "شروط الخدمة",
      intro: `تحكم هذه الشروط استخدامك لـ ${COMPANY}، وهي منصة إلكترونية تربط أولياء الأمور والأوصياء القانونيين بمدرسين خصوصيين مستقلين في منطقة الخليج.`,
      sections: [
        { h: "١. من يحق له استخدام الخدمة", p: [
          `يجب إنشاء الحسابات من قبل بالغين تبلغ أعمارهم ١٨ عاماً فأكثر. عندما تكون الدروس لقاصر، يجب أن يكون الحساب باسم ولي أمره أو وصيه القانوني، وهو المسؤول عن جميع الأنشطة عليه.`,
          `يجب أن يكون المدرسون مخوّلين قانونياً بتقديم الدروس الخصوصية في بلد إقامتهم، وأن يحملوا أي ترخيص يشترطه ذلك البلد. في دولة الإمارات، يشمل ذلك رخصة التدريس الرسمية.`,
        ]},
        { h: "٢. ما هي TutorApp وما ليست عليه", p: [
          `${COMPANY} وسيط. نحن نعرّف أولياء الأمور على مدرسين مستقلين ونوفر الأدوات لترتيب الدروس وعقدها ودفع ثمنها. المدرسون ليسوا موظفين لدينا ولا وكلاء ولا ممثلين عنا.`,
          `نتحقق من وثائق الهوية والمؤهلات والتراخيص التي يقدمها المدرسون قبل نشر ملفاتهم. هذا التحقق فحص وثائقي — وليس ضماناً لجودة التدريس أو لأي نتيجة أكاديمية معينة.`,
        ]},
        { h: "٣. الرسوم", p: [
          `استخدام ${COMPANY} للعثور على مدرس مجاني لأولياء الأمور. لا نتقاضى أي عمولة ولا رسوم حجز — السعر الذي تراه هو سعر المدرس، وهو ما تدفعه.`,
          `يدفع المدرسون اشتراكاً للوصول إلى طلبات الطلاب. يُعرض سعر الاشتراك قبل الشراء ويشمل فترة تجريبية مجانية. يتجدد الاشتراك تلقائياً حتى الإلغاء، ويمكن إلغاؤه في أي وقت من حساب المدرس.`,
        ]},
        { h: "٤. الدفع والإلغاء", p: [
          `تُعالج بيانات البطاقة عبر Stripe. لا تحتفظ ${COMPANY} بأرقام البطاقات.`,
          `للحصة المفردة، يتم حجز مبلغ على بطاقتك عند الحجز ويُخصم بعد انتهاء الحصة. الحصة الملغاة قبل أكثر من ٢٤ ساعة لا تُحتسب.`,
          `لباقة الحصص، تُدفع الباقة عند الشراء. يمكنك إلغاء الباقة في أي وقت وتُرد الحصص غير المستخدمة إلى وسيلة الدفع الأصلية.`,
        ]},
        { h: "٥. السلوك", p: [
          `تُعقد الدروس عبر الفيديو داخل المنصة. لا تستخدم ${COMPANY} للمضايقة أو مشاركة محتوى غير قانوني أو ترتيب الدفع خارج المنصة بهدف تفادي التزامات اشتراك المدرس.`,
          `يجوز لنا تعليق أو إغلاق أي حساب يخالف هذه الشروط أو ميثاق حماية الأطفال.`,
        ]},
        { h: "٦. المسؤولية", p: [
          `${COMPANY} غير مسؤولة عن محتوى أي حصة أو جودتها أو نتيجتها، فذلك من مسؤولية المدرس. لا شيء في هذه الشروط يحدّ من مسؤولية لا يجوز قانوناً الحد منها.`,
        ]},
        { h: "٧. القانون الواجب التطبيق", p: [
          `تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة. وتختص محاكم إمارة دبي بالنظر في المنازعات.`,
        ]},
      ],
    },
  },

  privacy: {
    en: {
      title: "Privacy Policy",
      intro: `How ${COMPANY} collects, uses and protects personal data, in line with UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data.`,
      sections: [
        { h: "1. What we collect", p: [
          `From parents: name, email, country and emirate, preferred language, and the details you give about your child's studies (first name, curriculum, level, language, subjects). We do not ask for your child's surname, address, school or date of birth.`,
          `From tutors: name, email, phone, biography, qualifications, identity document, tutoring permit where applicable, and bank details for payouts.`,
          `From everyone: lesson history, messages exchanged on the platform, and technical data such as IP address and device type.`,
        ]},
        { h: "2. Why we use it", p: [
          `To match students with suitable tutors, to arrange and hold lessons, to process payments, to verify tutor credentials, to prevent fraud and abuse, and to meet our legal obligations.`,
          `To perform matching we send the request details and tutor profile summaries to Anthropic's Claude API. This does not include your child's name, your contact details, or any payment information.`,
        ]},
        { h: "3. Children's data", p: [
          `We do not knowingly allow anyone under 18 to create an account. Data about a child is collected only from that child's parent or legal guardian, who consents on their behalf, and is limited to what is needed to arrange appropriate lessons.`,
          `A parent may ask us at any time to correct or delete their child's data by writing to ${CONTACT}.`,
        ]},
        { h: "4. Who we share it with", p: [
          `Stripe for payment processing; Supabase for hosting and storage; Resend for transactional email; Anthropic for tutor matching. Each processes data on our instructions.`,
          `A tutor sees the study details of a request they are matched to, and the first name of the student once a lesson is booked. Tutors never see your payment details.`,
          `We do not sell personal data, and we do not share it for advertising.`,
        ]},
        { h: "5. How long we keep it", p: [
          `Account data is kept while the account is open and for 12 months afterwards. Records required for tax and accounting are kept for the period the law requires. Verification documents are deleted once a tutor's account is closed.`,
        ]},
        { h: "6. Your rights", p: [
          `You may request access to your data, ask for it to be corrected or deleted, object to a particular use, or ask for a copy in portable form. Write to ${CONTACT} and we will respond within 30 days.`,
        ]},
        { h: "7. Security", p: [
          `Data is transmitted over TLS and stored encrypted at rest. Access is limited to staff who need it. If a breach affects your data, we will notify you and the relevant authority as the law requires.`,
        ]},
      ],
    },
    fr: {
      title: "Politique de Confidentialité",
      intro: `Comment ${COMPANY} collecte, utilise et protège les données personnelles, conformément au décret-loi fédéral émirien n° 45 de 2021 sur la protection des données personnelles.`,
      sections: [
        { h: "1. Ce que nous collectons", p: [
          `Auprès des parents : nom, email, pays et émirat, langue préférée, et les informations que vous donnez sur la scolarité de votre enfant (prénom, cursus, niveau, langue, matières). Nous ne demandons ni le nom de famille, ni l'adresse, ni l'école, ni la date de naissance de votre enfant.`,
          `Auprès des enseignants : nom, email, téléphone, biographie, diplômes, pièce d'identité, permis d'enseignement le cas échéant, et coordonnées bancaires pour les virements.`,
          `Auprès de tous : historique des cours, messages échangés sur la plateforme, et données techniques telles que l'adresse IP et le type d'appareil.`,
        ]},
        { h: "2. Pourquoi nous l'utilisons", p: [
          `Pour associer les élèves à des enseignants adaptés, organiser et tenir les cours, traiter les paiements, vérifier les qualifications des enseignants, prévenir la fraude et les abus, et respecter nos obligations légales.`,
          `Pour réaliser le matching, nous transmettons les détails de la demande et un résumé des profils enseignants à l'API Claude d'Anthropic. Cela n'inclut ni le nom de votre enfant, ni vos coordonnées, ni aucune information de paiement.`,
        ]},
        { h: "3. Données des mineurs", p: [
          `Nous n'autorisons pas sciemment la création d'un compte par une personne de moins de 18 ans. Les données concernant un enfant sont collectées uniquement auprès de son parent ou tuteur légal, qui consent en son nom, et se limitent à ce qui est nécessaire pour organiser des cours adaptés.`,
          `Un parent peut à tout moment demander la rectification ou la suppression des données de son enfant en écrivant à ${CONTACT}.`,
        ]},
        { h: "4. Avec qui nous les partageons", p: [
          `Stripe pour le traitement des paiements ; Supabase pour l'hébergement et le stockage ; Resend pour les emails transactionnels ; Anthropic pour le matching. Chacun traite les données sur nos instructions.`,
          `Un enseignant voit les détails scolaires d'une demande à laquelle il est associé, et le prénom de l'élève une fois le cours réservé. Les enseignants ne voient jamais vos informations de paiement.`,
          `Nous ne vendons pas de données personnelles et ne les partageons pas à des fins publicitaires.`,
        ]},
        { h: "5. Durée de conservation", p: [
          `Les données de compte sont conservées tant que le compte est ouvert, puis 12 mois. Les documents requis à des fins fiscales et comptables sont conservés pour la durée exigée par la loi. Les documents de vérification sont supprimés à la fermeture du compte enseignant.`,
        ]},
        { h: "6. Vos droits", p: [
          `Vous pouvez demander l'accès à vos données, leur rectification ou leur suppression, vous opposer à un usage particulier, ou en demander une copie portable. Écrivez à ${CONTACT} ; nous répondons sous 30 jours.`,
        ]},
        { h: "7. Sécurité", p: [
          `Les données transitent en TLS et sont stockées chiffrées au repos. L'accès est limité au personnel qui en a besoin. En cas de violation affectant vos données, nous vous informerons ainsi que l'autorité compétente, comme la loi l'exige.`,
        ]},
      ],
    },
    ar: {
      title: "سياسة الخصوصية",
      intro: `كيف تجمع ${COMPANY} البيانات الشخصية وتستخدمها وتحميها، وفقاً للمرسوم بقانون اتحادي رقم ٤٥ لسنة ٢٠٢١ بشأن حماية البيانات الشخصية.`,
      sections: [
        { h: "١. ما الذي نجمعه", p: [
          `من أولياء الأمور: الاسم والبريد الإلكتروني والدولة والإمارة واللغة المفضلة، والتفاصيل التي تقدمها عن دراسة طفلك (الاسم الأول، المنهج، المستوى، اللغة، المواد). لا نطلب اسم عائلة طفلك أو عنوانه أو مدرسته أو تاريخ ميلاده.`,
          `من المدرسين: الاسم والبريد والهاتف والسيرة الذاتية والمؤهلات ووثيقة الهوية ورخصة التدريس عند الاقتضاء والبيانات البنكية للتحويلات.`,
          `من الجميع: سجل الحصص والرسائل المتبادلة على المنصة وبيانات تقنية مثل عنوان IP ونوع الجهاز.`,
        ]},
        { h: "٢. لماذا نستخدمها", p: [
          `لمطابقة الطلاب بمدرسين مناسبين، ولترتيب الحصص وعقدها، ومعالجة المدفوعات، والتحقق من مؤهلات المدرسين، ومنع الاحتيال وإساءة الاستخدام، والوفاء بالتزاماتنا القانونية.`,
          `لإجراء المطابقة نرسل تفاصيل الطلب وملخصات ملفات المدرسين إلى واجهة Claude من Anthropic. لا يشمل ذلك اسم طفلك ولا بيانات الاتصال بك ولا أي معلومات دفع.`,
        ]},
        { h: "٣. بيانات الأطفال", p: [
          `لا نسمح عن علم لأي شخص دون ١٨ عاماً بإنشاء حساب. تُجمع بيانات الطفل فقط من ولي أمره أو وصيه القانوني الذي يوافق نيابة عنه، وتقتصر على ما يلزم لترتيب حصص مناسبة.`,
          `يمكن لولي الأمر أن يطلب منا في أي وقت تصحيح بيانات طفله أو حذفها بمراسلتنا على ${CONTACT}.`,
        ]},
        { h: "٤. مع من نشاركها", p: [
          `Stripe لمعالجة المدفوعات؛ Supabase للاستضافة والتخزين؛ Resend للبريد؛ Anthropic للمطابقة. يعالج كل منها البيانات وفق تعليماتنا.`,
          `يرى المدرس التفاصيل الدراسية للطلب المطابق له، والاسم الأول للطالب بعد حجز الحصة. لا يرى المدرسون أبداً بيانات الدفع الخاصة بك.`,
          `لا نبيع البيانات الشخصية ولا نشاركها لأغراض إعلانية.`,
        ]},
        { h: "٥. مدة الاحتفاظ", p: [
          `تُحفظ بيانات الحساب طوال فترة فتحه ولمدة ١٢ شهراً بعده. وتُحفظ السجلات المطلوبة للأغراض الضريبية والمحاسبية للمدة التي يفرضها القانون. وتُحذف وثائق التحقق عند إغلاق حساب المدرس.`,
        ]},
        { h: "٦. حقوقك", p: [
          `يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها أو الاعتراض على استخدام معين أو طلب نسخة قابلة للنقل. راسلنا على ${CONTACT} وسنرد خلال ٣٠ يوماً.`,
        ]},
        { h: "٧. الأمان", p: [
          `تُنقل البيانات عبر TLS وتُخزَّن مشفرة. الوصول مقصور على الموظفين الذين يحتاجونه. وفي حال وقوع خرق يمس بياناتك سنُخطرك وتُخطر الجهة المختصة كما يوجب القانون.`,
        ]},
      ],
    },
  },

  child: {
    en: {
      title: "Child Protection Charter",
      intro: `Every tutor accepts this charter before their profile goes live. It is not optional and it is not a formality.`,
      sections: [
        { h: "1. Lessons stay on the platform", p: [
          `All lessons take place over the ${COMPANY} video link. Tutors must not move a student to a personal video account, phone number, or messaging app.`,
          `Contact between a tutor and a student outside the platform is not permitted. Any question about scheduling, payment or content belongs in the platform's own messaging.`,
        ]},
        { h: "2. The parent has access", p: [
          `A parent or guardian may be present at any lesson, at any time, without giving notice. A tutor may not ask for a lesson to be private from the parent.`,
        ]},
        { h: "3. Conduct during lessons", p: [
          `Tutors keep the session academic. No discussion of a personal, romantic or sexual nature. No requests for photographs. No gifts, no money, no personal favours in either direction.`,
          `Tutors present themselves appropriately on camera and teach from a suitable environment.`,
        ]},
        { h: "4. Reporting", p: [
          `Anyone who believes a child is at risk must contact us at ${CONTACT} immediately. Where a child appears to be in danger, we report to the competent UAE authorities.`,
          `We suspend an account under investigation without waiting for the outcome.`,
        ]},
        { h: "5. Consequences", p: [
          `Breaching this charter ends a tutor's access to ${COMPANY} permanently, and may be referred to the authorities. There is no warning step for conduct that endangers a child.`,
        ]},
      ],
    },
    fr: {
      title: "Charte de Protection des Mineurs",
      intro: `Chaque enseignant accepte cette charte avant la publication de son profil. Elle n'est ni optionnelle, ni une formalité.`,
      sections: [
        { h: "1. Les cours restent sur la plateforme", p: [
          `Tous les cours se déroulent via le lien visio ${COMPANY}. Un enseignant ne doit pas déplacer un élève vers un compte visio personnel, un numéro de téléphone ou une application de messagerie.`,
          `Tout contact entre un enseignant et un élève en dehors de la plateforme est interdit. Toute question d'horaire, de paiement ou de contenu passe par la messagerie de la plateforme.`,
        ]},
        { h: "2. Le parent a accès", p: [
          `Un parent ou tuteur peut assister à n'importe quel cours, à tout moment, sans préavis. Un enseignant ne peut pas demander qu'un cours reste privé vis-à-vis du parent.`,
        ]},
        { h: "3. Comportement pendant les cours", p: [
          `Les enseignants maintiennent un cadre scolaire. Aucune discussion de nature personnelle, romantique ou sexuelle. Aucune demande de photographie. Aucun cadeau, aucun argent, aucune faveur personnelle dans un sens comme dans l'autre.`,
          `Les enseignants se présentent de façon appropriée à la caméra et enseignent depuis un environnement adapté.`,
        ]},
        { h: "4. Signalement", p: [
          `Toute personne estimant qu'un enfant est en danger doit nous contacter immédiatement à ${CONTACT}. Lorsqu'un enfant paraît en danger, nous signalons aux autorités émiriennes compétentes.`,
          `Nous suspendons un compte faisant l'objet d'une enquête sans attendre son issue.`,
        ]},
        { h: "5. Conséquences", p: [
          `Enfreindre cette charte met définitivement fin à l'accès de l'enseignant à ${COMPANY}, et peut être signalé aux autorités. Aucun avertissement préalable pour un comportement mettant un enfant en danger.`,
        ]},
      ],
    },
    ar: {
      title: "ميثاق حماية الأطفال",
      intro: `يوافق كل مدرس على هذا الميثاق قبل نشر ملفه. وهو ليس اختيارياً وليس إجراءً شكلياً.`,
      sections: [
        { h: "١. الحصص تبقى داخل المنصة", p: [
          `تُعقد جميع الحصص عبر رابط الفيديو الخاص بـ ${COMPANY}. ولا يجوز للمدرس نقل الطالب إلى حساب فيديو شخصي أو رقم هاتف أو تطبيق مراسلة.`,
          `التواصل بين المدرس والطالب خارج المنصة غير مسموح. وأي سؤال عن المواعيد أو الدفع أو المحتوى يكون عبر مراسلات المنصة.`,
        ]},
        { h: "٢. لولي الأمر حق الحضور", p: [
          `يجوز لولي الأمر أو الوصي حضور أي حصة في أي وقت دون إشعار مسبق. ولا يجوز للمدرس أن يطلب أن تكون الحصة سرية عن ولي الأمر.`,
        ]},
        { h: "٣. السلوك أثناء الحصص", p: [
          `يلتزم المدرسون بالإطار الأكاديمي. لا نقاش ذا طابع شخصي أو عاطفي أو جنسي. ولا طلب للصور. ولا هدايا ولا أموال ولا خدمات شخصية في أي من الاتجاهين.`,
          `يظهر المدرسون بمظهر لائق أمام الكاميرا ويدرّسون من بيئة مناسبة.`,
        ]},
        { h: "٤. الإبلاغ", p: [
          `على كل من يعتقد أن طفلاً في خطر أن يتواصل معنا فوراً على ${CONTACT}. وعندما يبدو الطفل في خطر، نبلغ الجهات الإماراتية المختصة.`,
          `نعلّق أي حساب قيد التحقيق دون انتظار النتيجة.`,
        ]},
        { h: "٥. العواقب", p: [
          `مخالفة هذا الميثاق تُنهي وصول المدرس إلى ${COMPANY} نهائياً، وقد تُحال إلى الجهات المختصة. ولا توجد مرحلة إنذار للسلوك الذي يعرّض طفلاً للخطر.`,
        ]},
      ],
    },
  },

  refund: {
    en: {
      title: "Refund Policy",
      intro: `When money comes back, and how quickly.`,
      sections: [
        { h: "Single lessons", p: [
          `Cancel more than 24 hours before the lesson: your card authorisation is released and nothing is charged.`,
          `Cancel within 24 hours: the lesson is charged in full, because the tutor has reserved that time.`,
          `Tutor does not attend: you are not charged, and the authorisation is released the same day.`,
          `Lesson quality dispute: contact ${CONTACT} within 48 hours of the lesson. We review the case and may refund in full.`,
        ]},
        { h: "Lesson packs", p: [
          `You may cancel a pack at any time. Lessons already taken are kept; every unused lesson is refunded to the original payment method.`,
          `Refunds are issued through Stripe and typically reach your account within 5 to 10 working days, depending on your bank.`,
        ]},
        { h: "Tutor subscriptions", p: [
          `The free trial can be cancelled at any point before it ends, with no charge.`,
          `After the trial, a subscription may be cancelled at any time and remains active until the end of the paid period. Part-months are not refunded.`,
        ]},
      ],
    },
    fr: {
      title: "Politique de Remboursement",
      intro: `Quand l'argent revient, et sous quel délai.`,
      sections: [
        { h: "Cours à l'unité", p: [
          `Annulation plus de 24 heures avant le cours : l'autorisation sur votre carte est levée et rien n'est débité.`,
          `Annulation dans les 24 heures : le cours est facturé intégralement, l'enseignant ayant réservé ce créneau.`,
          `Enseignant absent : vous n'êtes pas débité et l'autorisation est levée le jour même.`,
          `Litige sur la qualité du cours : contactez ${CONTACT} dans les 48 heures suivant le cours. Nous examinons le dossier et pouvons rembourser intégralement.`,
        ]},
        { h: "Packs de cours", p: [
          `Vous pouvez annuler un pack à tout moment. Les cours déjà suivis sont conservés ; chaque cours non utilisé est remboursé sur le moyen de paiement d'origine.`,
          `Les remboursements sont émis via Stripe et parviennent généralement sur votre compte sous 5 à 10 jours ouvrés, selon votre banque.`,
        ]},
        { h: "Abonnements enseignants", p: [
          `L'essai gratuit peut être annulé à tout moment avant son terme, sans frais.`,
          `Après l'essai, l'abonnement peut être résilié à tout moment et reste actif jusqu'à la fin de la période payée. Les mois entamés ne sont pas remboursés.`,
        ]},
      ],
    },
    ar: {
      title: "سياسة الاسترداد",
      intro: `متى تُعاد الأموال، وبأي سرعة.`,
      sections: [
        { h: "الحصص المفردة", p: [
          `الإلغاء قبل أكثر من ٢٤ ساعة من الحصة: يُرفع الحجز عن بطاقتك ولا يُخصم شيء.`,
          `الإلغاء خلال ٢٤ ساعة: تُحتسب الحصة كاملة، لأن المدرس حجز ذلك الوقت.`,
          `عدم حضور المدرس: لا يُخصم منك شيء ويُرفع الحجز في اليوم نفسه.`,
          `نزاع حول جودة الحصة: تواصل مع ${CONTACT} خلال ٤٨ ساعة من الحصة. ندرس الحالة وقد نرد المبلغ كاملاً.`,
        ]},
        { h: "باقات الحصص", p: [
          `يمكنك إلغاء الباقة في أي وقت. تُحتسب الحصص التي أخذتها، ويُرد ثمن كل حصة غير مستخدمة إلى وسيلة الدفع الأصلية.`,
          `تُصرف المبالغ المستردة عبر Stripe وتصل عادةً خلال ٥ إلى ١٠ أيام عمل حسب بنكك.`,
        ]},
        { h: "اشتراكات المدرسين", p: [
          `يمكن إلغاء التجربة المجانية في أي وقت قبل انتهائها دون رسوم.`,
          `بعد التجربة، يمكن إلغاء الاشتراك في أي وقت ويبقى فعّالاً حتى نهاية الفترة المدفوعة. ولا تُسترد الأشهر الجزئية.`,
        ]},
      ],
    },
  },
};

const TABS = [
  { key: "terms", label: { en: "Terms", fr: "CGU", ar: "الشروط" } },
  { key: "privacy", label: { en: "Privacy", fr: "Confidentialité", ar: "الخصوصية" } },
  { key: "child", label: { en: "Child Protection", fr: "Protection Mineurs", ar: "حماية الأطفال" } },
  { key: "refund", label: { en: "Refunds", fr: "Remboursements", ar: "الاسترداد" } },
];

export default function LegalPage({ lang, activeDoc, onSelectDoc, onBack }: {
  lang: "en" | "fr" | "ar";
  activeDoc: string;
  onSelectDoc: (k: string) => void;
  onBack: () => void;
}) {
  const doc = DOCS[activeDoc]?.[lang] || DOCS.terms[lang];
  const isRtl = lang === "ar";

  return (
    <div className="section" dir={isRtl ? "rtl" : "ltr"}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 1rem" }}>
        <button className="btn-ghost" onClick={onBack} style={{ marginBottom: "1.5rem" }}>
          {isRtl ? "→ رجوع" : lang === "fr" ? "← Retour" : "← Back"}
        </button>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "2rem" }}>
          {TABS.map(t => (
            <div key={t.key} onClick={() => onSelectDoc(t.key)}
              style={{
                padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer",
                background: activeDoc === t.key ? "#5B4FE8" : "#F1F5F9",
                color: activeDoc === t.key ? "#fff" : "#475569",
                transition: "all .2s",
              }}>
              {t.label[lang]}
            </div>
          ))}
        </div>

        <h1 style={{ fontFamily: "Fraunces,serif", fontSize: 30, fontWeight: 900, color: "#1A1A2E", marginBottom: 10 }}>
          {doc.title}
        </h1>
        <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600, marginBottom: "1.5rem" }}>
          {lang === "fr" ? "Dernière mise à jour" : lang === "ar" ? "آخر تحديث" : "Last updated"}: {LAST_UPDATED}
        </div>
        <div style={{ fontSize: 15, color: "#475569", lineHeight: 1.7, marginBottom: "2.5rem", paddingInlineStart: 14, borderInlineStart: "3px solid #5B4FE8" }}>
          {doc.intro}
        </div>

        {doc.sections.map((s, i) => (
          <div key={i} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#1A1A2E", marginBottom: 10 }}>{s.h}</h2>
            {s.p.map((para, j) => (
              <p key={j} style={{ fontSize: 14.5, color: "#475569", lineHeight: 1.75, marginBottom: 12 }}>{para}</p>
            ))}
          </div>
        ))}

        <div style={{ borderTop: "1.5px solid #E2E8F0", paddingTop: "1.5rem", marginTop: "1rem", fontSize: 13, color: "#64748B", lineHeight: 1.7 }}>
          {lang === "fr" ? "Une question sur ce document ? Écris-nous à " : lang === "ar" ? "سؤال حول هذا المستند؟ راسلنا على " : "Question about this document? Write to us at "}
          <a href={`mailto:${CONTACT}`} style={{ color: "#5B4FE8", fontWeight: 700 }}>{CONTACT}</a>
        </div>
      </div>
    </div>
  );
}
