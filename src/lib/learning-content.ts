export type HelpLanguage = "en" | "hi";

/** Kept identical to the generated video transcript; parity is covered by tests. */
export const LEARNING_TRANSCRIPT = [
  {
    id: "welcome",
    title: { en: "A clearer first check", hi: "पहली जाँच, अधिक स्पष्टता से" },
    narration: {
      en: "Welcome to BhuVerify, a reading aid for property documents. These illustrations use fictional records. No official verification is performed.",
      hi: "BhuVerify में आपका स्वागत है। यह संपत्ति के दस्तावेज़ समझने में मदद करता है। इन चित्रों में काल्पनिक रिकॉर्ड हैं। कोई आधिकारिक सत्यापन नहीं किया जाता।",
    },
  },
  {
    id: "start",
    title: { en: "Start with a case", hi: "एक केस से शुरू करें" },
    narration: {
      en: "Choose Explore a sample case to learn safely. Or choose New property case to begin with your own document.",
      hi: "सुरक्षित अभ्यास के लिए Explore a sample case चुनें। या अपने दस्तावेज़ से शुरू करने के लिए New property case चुनें।",
    },
  },
  {
    id: "document",
    title: { en: "Add a document", hi: "दस्तावेज़ जोड़ें" },
    narration: {
      en: "Choose Add document. Supported formats are PDF, PNG, JPG, and TXT, up to ten megabytes. Upload only with permission. Redact sensitive details, and read the consent notice first.",
      hi: "Add document चुनें। PDF, PNG, JPG और TXT फ़ाइलें समर्थित हैं; अधिकतम आकार 10 MB है। अनुमति होने पर ही अपलोड करें। संवेदनशील जानकारी छिपाएँ और पहले सहमति सूचना पढ़ें।",
    },
  },
  {
    id: "review",
    title: { en: "Review the fields", hi: "निकाली गई जानकारी जाँचें" },
    narration: {
      en: "In Review fields, compare each extracted value with the source document. Fix mistakes, check the quoted evidence, and save your corrections.",
      hi: "Review fields में हर निकाले गए मान का मूल दस्तावेज़ से मिलान करें। गलतियाँ सुधारें, उद्धृत प्रमाण जाँचें और अपने सुधार सहेजें।",
    },
  },
  {
    id: "checks",
    title: { en: "Read each result", hi: "हर परिणाम समझें" },
    narration: {
      en: "Choose Run document checks, then read each explanation. Needs attention means review is needed. Not established means evidence is missing or official checks are unavailable. Neither proves fraud or verifies legal title.",
      hi: "Run document checks चुनें, फिर हर परिणाम की व्याख्या पढ़ें। Needs attention का अर्थ है समीक्षा ज़रूरी है। Not established का अर्थ है प्रमाण उपलब्ध नहीं है या आधिकारिक जाँच उपलब्ध नहीं है। इनमें से कोई भी धोखाधड़ी का प्रमाण या कानूनी स्वामित्व का सत्यापन नहीं है।",
    },
  },
  {
    id: "services",
    title: { en: "Take official next steps", hi: "आधिकारिक अगला कदम उठाएँ" },
    narration: {
      en: "Open Bihar services for official next steps outside BhuVerify. These links open external services. BhuVerify has not checked their live records.",
      hi: "BhuVerify के बाहर आधिकारिक अगले कदम के लिए Bihar services खोलें। ये लिंक बाहरी सेवाएँ खोलते हैं। BhuVerify ने उनके लाइव रिकॉर्ड नहीं जाँचे हैं।",
    },
  },
  {
    id: "reading",
    title: { en: "Make reading easier", hi: "पढ़ना आसान बनाएँ" },
    narration: {
      en: "Open Reading settings to adjust text size, high contrast, and reduced motion. English and Hindi captions, and a written transcript, help you follow this video.",
      hi: "अक्षरों का आकार, उच्च कंट्रास्ट और कम गति चुनने के लिए Reading settings खोलें। अंग्रेज़ी और हिंदी कैप्शन तथा लिखित प्रतिलिपि इस वीडियो को समझने में मदद करते हैं।",
    },
  },
  {
    id: "help",
    title: { en: "Keep the guide close", hi: "मार्गदर्शिका साथ रखें" },
    narration: {
      en: "Return to How it works whenever you need guidance. Keep original documents, verify through official sources, and seek qualified advice before a property decision.",
      hi: "जब भी मदद चाहिए, How it works पर वापस आएँ। मूल दस्तावेज़ सुरक्षित रखें, आधिकारिक स्रोतों से सत्यापन करें और संपत्ति का निर्णय लेने से पहले योग्य विशेषज्ञ की सलाह लें।",
    },
  },
] as const;

export type LearningCopy = {
  eyebrow: string;
  heading: string;
  introduction: string;
  languageLabel: string;
  languageNote: string;
  videoHeading: string;
  videoNote: string;
  videoDescription: string;
  videoFallback: string;
  downloadVideo: string;
  transcriptLink: string;
  sampleEyebrow: string;
  sampleHeading: string;
  sampleDescription: string;
  sampleButton: string;
  sampleBusy: string;
  sampleNote: string;
  cautionHeading: string;
  caution: string;
  stepsHeading: string;
  stepsIntroduction: string;
  steps: { id: string; title: string; text: string; tip: string }[];
  officialLink: string;
  newTab: string;
  glossaryHeading: string;
  glossaryIntroduction: string;
  glossary: { term: string; definition: string }[];
  faqHeading: string;
  faqIntroduction: string;
  faqs: { question: string; answer: string }[];
  transcriptHeading: string;
  transcriptIntroduction: string;
};

/** Static help only. No case data or personal records are used in the guide. */
export const LEARNING_CONTENT: Record<HelpLanguage, LearningCopy> = {
  en: {
    eyebrow: "A LITTLE GUIDANCE, A CLEARER NEXT STEP",
    heading: "How to use BhuVerify",
    introduction:
      "New to land papers? Start here. Learn to organise a case, read your documents and understand what to check next—at your own pace.",
    languageLabel: "Help language",
    languageNote: "Changes this guide only. Workspace buttons remain in English.",
    videoHeading: "Watch the walkthrough",
    videoNote: "English narration · English & Hindi captions",
    videoDescription:
      "This walkthrough illustrates fictional records. In this no-login prototype, cases are saved in your browser. When the server has Gemini configured, consented uploads and current-case questions use Google Gemini. Review all extracted evidence; no government records are fetched. Export workspace backups regularly.",
    videoFallback:
      "Can’t play the video? The full text transcript below covers the same walkthrough.",
    downloadVideo: "Open video file",
    transcriptLink: "Read the transcript",
    sampleEyebrow: "THE EASIEST WAY TO BEGIN",
    sampleHeading: "Try it with sample papers",
    sampleDescription:
      "Explore a fictional property case, inspect its records and see how a document review works.",
    sampleButton: "Try a sample case",
    sampleBusy: "Opening sample…",
    sampleNote: "No personal documents needed. Sample records are not real land records.",
    cautionHeading: "A guide to the evidence. Not a title certificate.",
    caution:
      "BhuVerify compares supplied information. It does not prove ownership, authenticate documents, detect every fraud or check live government records. Resolve important questions with official records and a qualified local professional.",
    stepsHeading: "Your first case, step by step",
    stepsIntroduction: "Use fictional records only. Keep your original file nearby, review AI output, and export a workspace backup regularly.",
    steps: [
      {
        id: "create",
        title: "Create a property case",
        text: "Choose “New property case”. Give the case a name and add the district, anchal, mauza, khata and khesra from fictional papers.",
        tip: "Don’t guess a missing identifier. A plot number needs its village and local context.",
      },
      {
        id: "upload",
        title: "Add a fictional document",
        text: "Open the case, choose “Add document” and select the document type. Use a PDF, PNG, JPG or TXT file, up to 10 MB. Read the processing notice before consenting. “Upload and extract” sends the file through the server to Gemini when configured; manual mode saves metadata without AI extraction.",
        tip: "Google Gemini processing is governed by Google’s applicable terms. This app saves fields, quotes, and metadata in your browser, not the original file. Keep your own copy and use fictional records only.",
      },
      {
        id: "review",
        title: "Review and correct every field",
        text: "Choose “Review fields” on a document. Compare Gemini-extracted or manually entered names, identifiers, dates, area, and units against your fictional source. Check supporting quotes and page numbers, and correct mistakes.",
        tip: "AI extraction may be wrong or unavailable. You can enter evidence manually. Choose “Save reviewed fields” only after checking the source; leave unsupported values blank.",
      },
      {
        id: "compare",
        title: "Run checks and read the evidence",
        text: "Choose “Run document checks”. Read each finding and its source, including missing information. “Fields align” means the supplied fields match—not that the title is clear.",
        tip: "A mismatch needs investigation; it is not proof of fraud. Run checks again after changing records or values.",
      },
      {
        id: "official",
        title: "Take the next step through official channels",
        text: "Use “Next steps” or “Bihar services” to find the relevant official portal. Bihar Bhumi links to Jamabandi records, mutation services and Parimarjan Plus corrections.",
        tip: "Check current requirements on the official site, submit there if appropriate and keep the acknowledgement. BhuVerify does not submit applications for you.",
      },
      {
        id: "reading",
        title: "Make the page comfortable to read",
        text: "Open “Reading settings”. Choose Standard, Large or Extra large text, turn on High contrast, or use Reduce motion.",
        tip: "This guide also has Hindi text and video captions. These options do not translate the rest of the workspace.",
      },
    ],
    officialLink: "Open Bihar Bhumi",
    newTab: "opens in a new tab",
    glossaryHeading: "A few words you’ll see",
    glossaryIntroduction: "A plain-language starting point, not a legal definition.",
    glossary: [
      { term: "Mauza", definition: "The revenue village. Read it together with the district and anchal to identify the location." },
      { term: "Khata", definition: "An account or holding identifier in the local revenue record." },
      { term: "Khesra / plot", definition: "A plot identifier. The same number may occur in another village or survey." },
      { term: "Jamabandi / Register II", definition: "A revenue-record entry containing holding details. Read it with the relevant original records; it is not a title guarantee." },
      { term: "Mutation / Dakhil-Kharij", definition: "Updating revenue entries after a relevant change, such as a sale or inheritance. Mutation alone does not establish ownership." },
      { term: "Evidence / source", definition: "The document and passage behind a finding. Always compare the value with the original." },
    ],
    faqHeading: "Common questions",
    faqIntroduction: "A little reassurance before you begin.",
    faqs: [
      {
        question: "Do I need to upload my own papers to try it?",
        answer: "No. Start with a sample case. Its fictional records let you explore checks without personal information. For a new case, use fictional documents only.",
      },
      {
        question: "Does this demo use AI?",
        answer: "When the deployment has a server-side Gemini key configured, document extraction and current-case answers use Google Gemini with your consent. Visitors need no account or personal key. Fixed-rule document checks are separate from AI. If Gemini fails, the app shows an error rather than a scripted AI answer.",
      },
      {
        question: "What does “Not established” mean?",
        answer: "The supplied evidence does not settle that question. A missing field, missing record or unavailable official check can leave a finding unresolved. It does not mean a claim is true or false.",
      },
      {
        question: "Does “Fields align” mean it is safe to buy?",
        answer: "No. Consistent documents can still be incomplete, outdated or forged. Before a transaction, obtain current official records and professional advice about ownership, claims, boundaries and possession.",
      },
      {
        question: "Where does my demo data go?",
        answer: "Cases, fields, and quotes are saved in IndexedDB in this browser profile at this app’s address. They survive normal refreshes but have no cloud backup or automatic cross-device sync. Anyone using this profile can access them. Clear saved cases or clearing browser data removes them. Export and import workspace backups to keep copies. Consented AI requests send documents or current-case evidence to Google; this app does not retain originals.",
      },
      {
        question: "Will BhuVerify file my government application?",
        answer: "No. Service links open separate official websites. You complete their login, CAPTCHA and applicable process yourself. Confirm current requirements and keep the official acknowledgement or case number.",
      },
    ],
    transcriptHeading: "Full video transcript",
    transcriptIntroduction: "Prefer reading? Here is the complete walkthrough. Switch the help language above for Hindi.",
  },
  hi: {
    eyebrow: "थोड़ी मदद, अगला कदम आसान",
    heading: "BhuVerify कैसे इस्तेमाल करें",
    introduction:
      "ज़मीन के कागज़ समझने में मदद चाहिए? यहाँ से शुरू करें। अपनी सुविधा से सीखें: केस बनाना, दस्तावेज़ पढ़ना और अगली ज़रूरी जाँच समझना।",
    languageLabel: "मदद की भाषा",
    languageNote: "यह विकल्प केवल इस गाइड की भाषा बदलता है। बाकी ऐप के बटन अंग्रेज़ी में रहेंगे।",
    videoHeading: "वीडियो से सीखें",
    videoNote: "आवाज़ अंग्रेज़ी में · कैप्शन अंग्रेज़ी और हिन्दी में",
    videoDescription:
      "इस वीडियो में काल्पनिक रिकॉर्ड हैं। इस बिना लॉगिन वाले प्रोटोटाइप में केस ब्राउज़र में सहेजे जाते हैं। सर्वर पर Gemini कॉन्फ़िगर होने पर आपकी सहमति से दस्तावेज़ पढ़ने और मौजूदा केस के सवालों के लिए Google Gemini इस्तेमाल होता है। निकाले गए प्रमाण की जाँच करें और नियमित बैकअप लें। सरकारी लाइव रिकॉर्ड नहीं लाए जाते।",
    videoFallback:
      "वीडियो नहीं चल रहा? नीचे उसका पूरा लिखित पाठ पढ़ सकते हैं। उसमें वही जानकारी है।",
    downloadVideo: "वीडियो फ़ाइल खोलें",
    transcriptLink: "वीडियो का लिखित पाठ पढ़ें",
    sampleEyebrow: "शुरू करने का सबसे आसान तरीका",
    sampleHeading: "नमूना कागज़ों के साथ आज़माएँ",
    sampleDescription:
      "एक काल्पनिक ज़मीन का केस खोलें, उसके कागज़ देखें और समझें कि दस्तावेज़ों की समीक्षा कैसे होती है।",
    sampleButton: "नमूना केस आज़माएँ",
    sampleBusy: "नमूना खुल रहा है…",
    sampleNote: "अपने दस्तावेज़ देने की ज़रूरत नहीं। नमूने असली ज़मीन के रिकॉर्ड नहीं हैं।",
    cautionHeading: "सबूत समझने में मदद। मालिकाना हक़ का प्रमाणपत्र नहीं।",
    caution:
      "BhuVerify केवल दी गई जानकारी की तुलना करता है। यह मालिकाना हक़ साबित नहीं करता, कागज़ों की असलियत प्रमाणित नहीं करता, हर धोखाधड़ी नहीं पकड़ता और सरकारी रिकॉर्ड सीधे नहीं जाँचता। ज़रूरी सवालों के लिए सरकारी रिकॉर्ड और योग्य स्थानीय विशेषज्ञ की मदद लें।",
    stepsHeading: "आपका पहला केस, एक-एक कदम",
    stepsIntroduction: "केवल काल्पनिक रिकॉर्ड इस्तेमाल करें। मूल फ़ाइल पास रखें, AI के उत्तर जाँचें और नियमित वर्कस्पेस बैकअप लें।",
    steps: [
      {
        id: "create",
        title: "ज़मीन का केस बनाएँ",
        text: "“New property case” चुनें। केस का नाम दें और काल्पनिक कागज़ों से ज़िला, अंचल, मौजा, खाता और खेसरा भरें।",
        tip: "जो जानकारी नहीं मालूम, उसका अंदाज़ा न लगाएँ। प्लॉट नंबर के साथ सही गाँव और क्षेत्र ज़रूरी है।",
      },
      {
        id: "upload",
        title: "काल्पनिक दस्तावेज़ जोड़ें",
        text: "केस में “Add document” चुनें और दस्तावेज़ का प्रकार बताएँ। PDF, PNG, JPG या TXT फ़ाइल अधिकतम 10 MB की हो सकती है। सहमति पढ़ें। Gemini कॉन्फ़िगर होने पर “Upload and extract” फ़ाइल को सर्वर से Gemini भेजता है; manual mode में केवल मेटाडेटा सहेजा जाता है।",
        tip: "Google Gemini के लिए Google की लागू शर्तें लागू होती हैं। ऐप ब्राउज़र में विवरण, उद्धरण और मेटाडेटा रखता है, मूल फ़ाइल नहीं। अपनी कॉपी रखें और केवल काल्पनिक रिकॉर्ड इस्तेमाल करें।",
      },
      {
        id: "review",
        title: "निकाली गई हर जानकारी जाँचें",
        text: "दस्तावेज़ पर “Review fields” चुनें। Gemini से निकले या हाथ से भरे नाम, प्लॉट नंबर, तारीख, रकबा और इकाई मूल काल्पनिक कागज़ से मिलाएँ। उद्धरण और पेज नंबर जाँचें और गलतियाँ सुधारें।",
        tip: "AI गलत या अनुपलब्ध हो सकता है; जानकारी हाथ से भर सकते हैं। मूल कागज़ से मिलाने के बाद ही “Save reviewed fields” चुनें। बिना प्रमाण वाले मान खाली छोड़ें।",
      },
      {
        id: "compare",
        title: "जाँच चलाएँ और सबूत पढ़ें",
        text: "“Run document checks” चुनें। हर निष्कर्ष का आधार और छूटी हुई जानकारी देखें। “Fields align” का मतलब केवल दी गई जानकारी का मेल है—मालिकाना हक़ की पुष्टि नहीं।",
        tip: "अंतर मिलने पर आगे जाँच करें; यह अपने-आप धोखाधड़ी का प्रमाण नहीं है। दस्तावेज़ या जानकारी बदलने पर जाँच दोबारा चलाएँ।",
      },
      {
        id: "official",
        title: "अगला कदम सरकारी माध्यम से लें",
        text: "सही सरकारी पोर्टल खोजने के लिए “Next steps” या “Bihar services” खोलें। बिहार भूमि पर जमाबंदी, दाखिल-खारिज और परिमार्जन प्लस सुधार सेवाओं के लिंक हैं।",
        tip: "सरकारी वेबसाइट पर मौजूदा ज़रूरतें देखें, लागू होने पर वहीं आवेदन करें और पावती रखें। BhuVerify आपकी ओर से आवेदन जमा नहीं करता।",
      },
      {
        id: "reading",
        title: "पढ़ने की सुविधा अपने अनुसार रखें",
        text: "“Reading settings” खोलें। अक्षरों के लिए Standard, Large या Extra large चुनें। High contrast से रंगों का अंतर बढ़ाएँ और Reduce motion से गति कम करें।",
        tip: "इस गाइड में हिन्दी पाठ और वीडियो कैप्शन भी हैं। इन विकल्पों से बाकी ऐप की भाषा नहीं बदलती।",
      },
    ],
    officialLink: "बिहार भूमि खोलें",
    newTab: "नए टैब में खुलेगा",
    glossaryHeading: "कुछ काम के शब्द",
    glossaryIntroduction: "सरल परिचय के लिए—यह कानूनी परिभाषा नहीं है।",
    glossary: [
      { term: "मौजा", definition: "राजस्व गाँव। सही जगह पहचानने के लिए इसे ज़िले और अंचल के साथ पढ़ें।" },
      { term: "खाता", definition: "स्थानीय राजस्व रिकॉर्ड में खाते या जोत की पहचान संख्या।" },
      { term: "खेसरा / प्लॉट", definition: "एक भूखंड की पहचान संख्या। वही नंबर किसी दूसरे गाँव या सर्वे में भी हो सकता है।" },
      { term: "जमाबंदी / रजिस्टर II", definition: "जोत के विवरण वाली राजस्व प्रविष्टि। इसे संबंधित मूल रिकॉर्ड के साथ पढ़ें; यह मालिकाना हक़ की गारंटी नहीं है।" },
      { term: "म्यूटेशन / दाखिल-खारिज", definition: "बिक्री या विरासत जैसे बदलाव के बाद राजस्व प्रविष्टियों को अद्यतन करने की प्रक्रिया। इससे अकेले मालिकाना हक़ स्थापित नहीं होता।" },
      { term: "सबूत / स्रोत", definition: "वह दस्तावेज़ और अंश जिस पर निष्कर्ष आधारित है। जानकारी हमेशा मूल कागज़ से मिलाएँ।" },
    ],
    faqHeading: "आम सवाल",
    faqIntroduction: "शुरू करने से पहले कुछ ज़रूरी बातें।",
    faqs: [
      {
        question: "क्या आज़माने के लिए अपने कागज़ अपलोड करने होंगे?",
        answer: "नहीं। नमूना केस से शुरू करें। उसमें काल्पनिक रिकॉर्ड हैं, इसलिए व्यक्तिगत जानकारी दिए बिना जाँच देख सकते हैं। नए केस में भी केवल काल्पनिक दस्तावेज़ इस्तेमाल करें।",
      },
      {
        question: "क्या इस डेमो में AI है?",
        answer: "सर्वर पर Gemini key कॉन्फ़िगर होने पर आपकी सहमति से दस्तावेज़ की जानकारी निकालने और मौजूदा केस के उत्तरों के लिए Google Gemini इस्तेमाल होता है। उपयोगकर्ता को अकाउंट या अपनी key नहीं चाहिए। दस्तावेज़ तुलना तय नियमों से होती है। AI विफल होने पर त्रुटि दिखाई जाती है, नकली AI उत्तर नहीं।",
      },
      {
        question: "“Not established” का क्या मतलब है?",
        answer: "दी गई जानकारी से उस सवाल का जवाब तय नहीं हुआ। कोई विवरण, रिकॉर्ड या सरकारी जाँच उपलब्ध न होने पर बात अनिर्णीत रह सकती है। इसका मतलब दावा सही या गलत होना नहीं है।",
      },
      {
        question: "“Fields align” आए तो क्या ज़मीन खरीदना सुरक्षित है?",
        answer: "नहीं। मिलते-जुलते कागज़ भी अधूरे, पुराने या जाली हो सकते हैं। लेन-देन से पहले मौजूदा सरकारी रिकॉर्ड लें और मालिकाना हक़, दावों, सीमाओं तथा कब्ज़े पर योग्य विशेषज्ञ की सलाह लें।",
      },
      {
        question: "डेमो की जानकारी कहाँ जाती है?",
        answer: "केस, विवरण और उद्धरण इस ऐप के पते पर इसी ब्राउज़र प्रोफ़ाइल के IndexedDB में रहते हैं और सामान्य रीफ़्रेश पर नहीं मिटते। क्लाउड बैकअप या उपकरणों के बीच अपने-आप सिंक नहीं होता। यह प्रोफ़ाइल इस्तेमाल करने वाला व्यक्ति केस देख सकता है। Clear saved cases या ब्राउज़र डेटा साफ़ करने पर केस मिटते हैं। बैकअप export/import करें। सहमति वाले AI अनुरोध Google को दस्तावेज़ या मौजूदा केस भेजते हैं; ऐप मूल फ़ाइल नहीं रखता।",
      },
      {
        question: "क्या BhuVerify मेरा सरकारी आवेदन जमा करेगा?",
        answer: "नहीं। सेवा के लिंक अलग सरकारी वेबसाइट खोलते हैं। उनका लॉगिन, CAPTCHA और लागू प्रक्रिया आपको वहीं पूरी करनी होगी। मौजूदा ज़रूरतें जाँचें और सरकारी पावती या केस नंबर संभालकर रखें।",
      },
    ],
    transcriptHeading: "वीडियो का पूरा लिखित पाठ",
    transcriptIntroduction: "पढ़ना पसंद है? वीडियो की पूरी जानकारी यहाँ है। ऊपर मदद की भाषा बदलकर अंग्रेज़ी पाठ देख सकते हैं।",
  },
};
