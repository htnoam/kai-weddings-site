/* =====================================================================
   עמית & אור · קובץ התוכן של האתר
   ---------------------------------------------------------------------
   כל הטקסטים, השעות, הקישורים והתמונות נמצאים כאן.
   משנים -> שומרים -> מרעננים את הדף. אין צורך לגעת ב-index.html.

   טיפים:
   - כל טקסט בין גרשיים '...' אפשר לשנות חופשי.
   - להוספת אירוע ללו"ז: מעתיקים שורה { time: ..., title: ... } ומדביקים.
   - highlight: true  -> מדגיש את האירוע (חופה, מסיבה וכו').
   - sub: שורת הסבר קטנה מתחת לאירוע (לא חובה).
   - icon: אחד מהשמות:
       plane, bus, key, bed, coffee, pool, drop, sparkles, camera,
       glass, rings, dinner, music, moon, suitcase, heart, taverna, sun
   - שדה ריק '' פשוט לא יוצג.
   ===================================================================== */

window.SITE = {

  /* ---------- הזוג ---------- */
  couple: {
    name1: 'עמית',
    name2: 'אור',
    monogram: ['A', 'O']
  },

  // הראשון מוצג בצד ימין, השני בצד שמאל
  parents: [
    { label: 'הורי הכלה', names: 'שרלי ורן שוורץ' },
    { label: 'הורי החתן', names: 'צמרת ומשה סולומון' }
  ],

  /* ---------- תאריכים ---------- */
  dates: {
    display: '27–29.05.2027',
    timezone: '+03:00',                 // שעון קפריסין במאי
    countdownTo: '2027-05-27T10:00',    // הספירה לאחור מסתיימת בתחילת הסופ"ש
    calendar: {
      title: 'החתונה של עמית ואור · קפריסין',
      start: '2027-05-27T10:00',
      end:   '2027-05-29T13:00',
      details: 'סופ"ש של חגיגה במלון Atlantis Gardens, ליד לרנקה. הלו"ז המלא באתר.'
    }
  },

  /* ---------- מסך הפתיחה: המעטפה וכרטיס הטיסה ---------- */
  gate: {
    hint: 'לחצו על החותם לפתיחה',
    passTitle: 'BOARDING PASS',
    passenger: ['האורחים של', 'עמית & אור'],   // כל פריט בשורה משלו
    flight: 'AO 2705',
    gateName: '27',
    seat: 'VIP',
    enter: 'עלייה למטוס'
  },

  /* ---------- ראש הדף ---------- */
  hero: {
    kicker: 'The wedding of',
    line: 'מתחתנים ב',
    country: 'CYPRUS',                  // בשורה נפרדת ובגדול
    place: 'Atlantis Gardens · Larnaca',
    photo: ''
  },

  /* ---------- ההזמנה ---------- */
  invitation: {
    title: 'מתחתנים בקפריסין',
    lines: [
      'מתרגשים ונרגשים להזמינכם לחתונה שלנו',
      'שתיערך ב־27–29 במאי במלון Atlantis\u00A0Gardens, ליד לרנקה.'
    ],
    signoff: ['נשמח לחגוג איתכם,', 'עמית ואור'],
    photo: ''
  },

  /* ---------- ספירה לאחור ויומן ---------- */
  countdown: {
    kicker: 'Save the date',
    label: 'סופ״ש אחד בקפריסין',
    countdownLabel: 'עד שמתחילים לחגוג',
    calendarButton: 'הוספה ליומן',
    photo: ''
  },

  /* ---------- הלו"ז ---------- */
  schedule: {
    kicker: 'Three days in Cyprus',
    title: 'שלושה ימים של חגיגה',
    note: 'ייתכנו שינויים קטנים בשעות. נעדכן כאן.',
    days: [
      {
        date: '2027-05-27',
        weekday: 'חמישי',
        short: '27.05',
        title: 'Arrival & Taverna',
        subtitle: 'נוחתים, מתמקמים ויוצאים לערב טברנה',
        // until: שעת סיום (לא חובה) -> מוצג כטווח, למשל 15:00–18:00
        events: [
          // שעות ההסעות מכוונות לנחיתות של הטיסות המומלצות (ראו flights למטה)
          { time: '14:30', icon: 'bus',      title: 'אוטובוס · נגלה ראשונה', sub: 'מהשדה למלון, אחרי נחיתת Wizz Air (~13:55)' },
          { time: '15:00', icon: 'key',      title: 'קבלת חדרים' },
          { time: '15:00', until: '18:00', icon: 'pool', title: 'זמן חופשי' },
          { time: '15:30', icon: 'bus',      title: 'אוטובוס · נגלה שנייה', sub: 'מהשדה למלון, אחרי נחיתת ישראייר (~15:00)' },
          { time: '18:30', icon: 'bus',      title: 'נסיעה לטברנה' },
          { time: '19:00', icon: 'taverna',  title: 'ערב טברנה', sub: 'קוד לבוש: לבן (גם שמנת ובז׳ עובד)', highlight: true },
          { time: '22:30', icon: 'moon',     title: 'חזרה למלון' }
        ]
      },
      {
        date: '2027-05-28',
        weekday: 'שישי',
        short: '28.05',
        title: 'The Wedding',
        subtitle: 'היום הגדול',
        events: [
          { time: '08:00', until: '10:00', icon: 'coffee', title: 'ארוחת בוקר' },
          { time: '10:00', until: '17:30', icon: 'pool',   title: 'זמן חופשי' },
          { time: '17:30', icon: 'glass',    title: 'קבלת פנים' },
          { time: '18:00', icon: 'dinner',   title: 'ארוחה חגיגית' },
          { time: '19:30', icon: 'rings',    title: 'טקס חופה', highlight: true },
          { time: '20:00', icon: 'music',    title: 'מסיבה', highlight: true }
        ]
      },
      {
        date: '2027-05-29',
        weekday: 'שבת',
        short: '29.05',
        title: 'Farewell',
        subtitle: 'עוד בוקר אחד ביחד לפני הבית',
        events: [
          { time: '08:00', until: '10:00', icon: 'coffee', title: 'ארוחת בוקר' },
          { time: '12:00', icon: 'suitcase', title: 'צ׳ק-אאוט' }
        ]
      }
    ]
  },

  /* ---------- פרטים נוספים: מה כלול ---------- */
  details: {
    kicker: 'Good to know',
    title: 'פרטים נוספים',
    sub: 'מה מחכה לכם בסופ״ש, ומה עליכם.',
    included: [
      { icon: 'bed',     title: 'לינה במלון', text: 'שני לילות ב־Atlantis\u00A0Gardens, מחמישי 27.05 ועד הצ׳ק-אאוט בשבת 29.05.' },
      { icon: 'dinner',  title: 'ארוחות', lines: [
          'חמישי · ערב טברנה',
          'שישי · ארוחת בוקר',
          'שישי · ארוחה חגיגית',
          'שבת · ארוחת בוקר'
        ] },
      { icon: 'bus',     title: 'הסעות', text: 'מהשדה למלון אחרי הנחיתה של כל אחת מהטיסות המומלצות, ולערב הטברנה וחזרה.' }
    ],
    notIncluded: [
      { icon: 'plane',   title: 'טיסות', text: 'הטיסה לקפריסין וחזרה עליכם. כל הפרטים בהמשך.' }
    ],
    includedLabel: 'כלול',
    notIncludedLabel: 'לא כלול'
  },

  /* ---------- טיסות ---------- */
  flights: {
    title: 'טסים לקפריסין',
    sub: 'שעה אחת של טיסה, ואתם בחופשה.',
    from: { code: 'TLV', he: 'תל אביב' },
    to:   { code: 'LCA', he: 'לרנקה' },
    duration: 'כשעה טיסה',
    recommendLabel: 'ההמלצה שלנו',
    // url: הקישור שנפתח בלחיצה על הטיסה (אפשר להחליף בקישור ישיר להזמנה)
    passes: [
      { label: 'הלוך', from: 'TLV', to: 'LCA', day: '27', month: 'MAY', weekday: 'THU',
        strong: 'חמישי 27.05',
        flights: [
          { airline: 'Wizz Air', time: '12:55', url: 'https://www.google.com/travel/flights?q=Wizz%20Air%20one%20way%20flight%20TLV%20to%20LCA%20on%202027-05-27' },
          { airline: 'ישראייר',  time: '14:00', url: 'https://www.google.com/travel/flights?q=Israir%20one%20way%20flight%20TLV%20to%20LCA%20on%202027-05-27' }
        ] },
      { label: 'חזור', from: 'LCA', to: 'TLV', day: '29', month: 'MAY', weekday: 'SAT',
        strong: 'שבת 29.05',
        flights: [
          { airline: 'Wizz Air',       time: '17:25', url: 'https://www.google.com/travel/flights?q=Wizz%20Air%20one%20way%20flight%20LCA%20to%20TLV%20on%202027-05-29' },
          { airline: 'Cyprus Airways', time: '13:30', url: 'https://www.google.com/travel/flights?q=Cyprus%20Airways%20one%20way%20flight%20LCA%20to%20TLV%20on%202027-05-29' }
        ] }
    ],
    tips: [
      { title: 'נחיתה בלרנקה (LCA)', text: 'השדה הקרוב ביותר. המלון במזוטוס, כ־30 דקות נסיעה.' },
      { title: 'הסעות מהשדה', text: 'טסים באחת הטיסות המומלצות? האוטובוס מחכה לכם בשדה: ב־14:30 אחרי נחיתת Wizz Air, וב־15:30 אחרי נחיתת ישראייר.' }
    ],
    airlines: ['אל על', 'ישראייר', 'ארקיע', 'Cyprus Airways', 'Wizz Air', 'Blue Bird'],
    searchLabel: 'חיפוש טיסות לתאריכים',
    searchUrl: 'https://www.google.com/travel/flights?q=Flights%20from%20TLV%20to%20LCA%20on%202027-05-27%20through%202027-05-29'
  },

  /* ---------- מה לארוז ---------- */
  packing: {
    title: 'מה לארוז',
    sub: 'סמנו מה כבר במזוודה. הרשימה נשמרת אצלכם בטלפון.',
    doneText: 'המזוודה מוכנה. נתראה בקפריסין!',
    items: [
      ['דרכון בתוקף', 'בדקו תוקף עכשיו, לא בשדה'],
      ['ביטוח נסיעות', ''],
      ['מתאם לשקע בריטי', 'Type G, השקעים בקפריסין כמו באנגליה'],
      ['לוק לערב הטברנה', ''],
      ['לוק ערב לחתונה', ''],
      ['נעליים נוחות לריקודים', 'הרגליים יודו לכם'],
      ['בגדי ים וכפכפים', ''],
      ['קרם הגנה וכובע', 'השמש של מאי לא סולחת'],
      ['משקפי שמש', ''],
      ['ז׳קט קל לערב', 'בערב ליד הים קצת קריר'],
      ['תרופות אישיות', ''],
      ['מטען נייד', 'הרבה סטוריז בדרך'],
      ['מצב רוח לחגוג', 'הכי חשוב']
    ]
  },

  /* ---------- מיקום ---------- */
  location: {
    title: 'איפה חוגגים',
    area: 'Mazotos · Larnaca · Cyprus',
    name: 'Atlantis Gardens',
    desc: 'מלון על חוף הים, ליד לרנקה',
    mapQuery: 'Atlantis Gardens Mazotos Cyprus',   // מה שמחפשים במפה וב-Waze
    rows: [
      ['מהשדה', 'כ־30 דקות מנמל התעופה לרנקה'],
      ['לינה', 'המלון עלינו, כל שלושת הימים'],
      ['מזג אוויר', 'סוף מאי: 26°–29° ושמש']
    ],
    photo: ''
  },

  /* ---------- אישור הגעה ---------- */
  rsvp: {
    title: 'נשמח לחגוג איתכם',
    photo: '',
    text: 'אשרו הגעה כדי שנשמור לכם מקום, ונדע מה אתם אוכלים ומתי אתם נוחתים.',
    button: 'אישור הגעה',
    editButton: 'צפייה ועריכה של האישור',
    maxGuests: 7,
    ages: ['מבוגר', 'ילד', 'תינוק'],
    diets: ['רגיל', 'צמחוני', 'טבעוני'],
    kosher: ['לא משנה', 'כשר', 'כשר למהדרין'],
    allergies: ['גלוטן', 'חלב / לקטוז', 'ביצים', 'בוטנים', 'אגוזים', 'שומשום', 'דגים'],
    thanksYes: 'איזה כיף! נתראה בקפריסין.',
    thanksNo: 'תודה שעדכנתם. נחגוג איתכם בפעם אחרת.',
    thanksCancel: 'האישור בוטל. אפשר לאשר מחדש בכל רגע.',
    editNote: 'אפשר לחזור לאתר בכל רגע ולשנות או לבטל את מה שמילאתם.'
  },

  /* ---------- תפריט עליון ---------- */
  nav: [
    ['#schedule', 'לו״ז'],
    ['#details', 'מה כלול'],
    ['#flights', 'טיסות'],
    ['#pack', 'אריזה'],
    ['#location', 'מיקום']
  ]
};
