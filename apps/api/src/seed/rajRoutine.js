const LIFE_AREAS = [
  { key: "health", name: "Health & sleep", v1: true },
  { key: "skin", name: "Skin", v1: true },
  { key: "hair", name: "Hair", v1: true },
  { key: "fitness", name: "Workout", v1: true },
  { key: "learning", name: "Study", v1: true },
  { key: "mind", name: "Mind & mood", v1: false },
  { key: "relationships", name: "Relationships", v1: false },
  { key: "career", name: "Career & money", v1: false },
  { key: "content", name: "Content", v1: false },
  { key: "dance", name: "Dance", v1: false, deferred: true },
  { key: "environment", name: "Environment", v1: false },
  { key: "purpose", name: "Purpose", v1: false },
  { key: "ops", name: "Life ops", v1: false },
  { key: "rest", name: "Fun & rest", v1: false },
];

const STUDY_BY_DAY = {
  0: { title: "DSA review", detail: "40 min: 2 easy + 1 medium, then 10 min notes." },
  1: { title: "DSA", detail: "25 min: 1 easy + 1 medium on LeetCode." },
  2: { title: "System design", detail: "25 min: one concept + one sketch (e.g. URL shortener, cache)." },
  3: { title: "Angular", detail: "25 min: one component/pattern, then a tiny code note." },
  4: { title: "DSA", detail: "25 min: 1 medium; if stuck, watch 5 min then retry." },
  5: { title: "System design", detail: "25 min: CAP / load balancing / DB choice flashcards." },
  6: { title: "Angular", detail: "25 min: routing or RxJS drill, commit one small change." },
};

// Each workout day is a list of discrete steps (not one run-on sentence) so
// every part of the session gets its own checkbox in the app.
const WORKOUT_BY_DAY = {
  0: {
    title: "Sunday recovery",
    steps: [
      { key: "walk", label: "Easy walk, 30–60 min, conversational pace." },
      { key: "mobility", label: "Mobility work, 15–20 min." },
      { key: "note", label: "No hard training today." },
    ],
  },
  1: {
    title: "Easy run + strength",
    steps: [
      { key: "run", label: "Run 20–25 min, easy pace." },
      { key: "pushups", label: "Push-ups: 3 sets x 8–15 reps." },
      { key: "squats", label: "Squats: 3 sets x 12–20 reps." },
      { key: "plank", label: "Plank: 3 sets x 30–60 sec." },
      { key: "mobility", label: "Mobility / stretch to finish." },
    ],
  },
  2: {
    title: "Intervals",
    steps: [
      { key: "warmup", label: "5 min easy warm-up jog." },
      { key: "rounds", label: "6–8 rounds: 30–60 sec faster run, then 60–90 sec easy jog." },
      { key: "cooldown", label: "5 min cool-down walk." },
    ],
  },
  3: {
    title: "Easy run + posterior chain",
    steps: [
      { key: "run", label: "Run 20–25 min, easy pace." },
      { key: "splitsquat", label: "Split squats: 3 sets x 8–12 reps per leg." },
      { key: "pushups", label: "Push-ups: 3 sets x 8–15 reps." },
      { key: "glutebridge", label: "Glute bridge: 3 sets x 12–20 reps." },
    ],
  },
  4: {
    title: "Jump rope + core",
    steps: [
      { key: "rope", label: "Jump rope intervals, 10–15 min total." },
      { key: "core", label: "Core circuit — plank, leg raises, bicycle crunch." },
      { key: "mobility", label: "Shoulder / scapular mobility work." },
      { key: "note", label: "Keep intensity moderate only." },
    ],
  },
  5: {
    title: "Easy run + full-body circuit",
    steps: [
      { key: "run", label: "Run 20–30 min, easy pace." },
      { key: "circuit", label: "3 rounds: push-ups, squats, lunges, glute bridge, plank." },
    ],
  },
  6: {
    title: "Long easy cardio",
    steps: [
      { key: "cardio", label: "30–45 min easy cardio or a sport session, conversational pace." },
      { key: "stretch", label: "Stretch to finish." },
    ],
  },
};

// India-general seasonal fruit calendar, keyed by month (1-12). Filled into
// the "seasonal-fruit" item at plan-generation time (not seed time) so it
// always reflects the actual date's month — see fillSeasonalFruit in
// routes.js.
const SEASONAL_FRUITS_BY_MONTH = {
  1: ["Orange", "Guava", "Papaya", "Banana"],
  2: ["Orange", "Guava", "Papaya", "Banana"],
  3: ["Mango (early)", "Papaya", "Watermelon", "Banana"],
  4: ["Mango", "Watermelon", "Muskmelon", "Litchi"],
  5: ["Mango", "Watermelon", "Muskmelon", "Litchi", "Jackfruit"],
  6: ["Mango", "Watermelon", "Jamun (black plum)", "Muskmelon"],
  7: ["Jamun (black plum)", "Plum", "Peach", "Pear"],
  8: ["Plum", "Peach", "Pear", "Pomegranate"],
  9: ["Pomegranate", "Apple", "Pear", "Guava"],
  10: ["Pomegranate", "Apple", "Guava", "Sitaphal (custard apple)"],
  11: ["Sitaphal (custard apple)", "Guava", "Orange", "Banana"],
  12: ["Orange", "Guava", "Papaya", "Banana"],
};

function seasonalFruitsForMonth(month) {
  return SEASONAL_FRUITS_BY_MONTH[month] || SEASONAL_FRUITS_BY_MONTH[1];
}

// Rotated daily so the full list gets covered across the week instead of
// eating a little of all 6/8 types every single day.
const SEEDS = ["Chia seeds", "Flax seeds (ground)", "Pumpkin seeds", "Sunflower seeds", "Sesame seeds", "Watermelon seeds"];
const DRY_FRUITS = ["Almonds", "Walnuts", "Cashews", "Pistachios", "Raisins", "Dates", "Dried figs", "Dried apricots"];

function pickRotating(list, day, offset, count) {
  const picks = [];
  for (let i = 0; i < count; i += 1) {
    picks.push(list[(day * count + offset + i) % list.length]);
  }
  return picks;
}

const SKIN_MORNING_STEPS = [
  { key: "water", label: "Rinse with lukewarm water, or Cetaphil if skin feels oily. Pat dry." },
  { key: "hydrate", label: "Moisturizer or hyaluronic acid on damp skin." },
  { key: "spf", label: "Broad-spectrum sunscreen last. No oil or T-bar in the morning." },
];

const SKIN_NIGHT_STEPS = [
  { key: "cleanse", label: "Cetaphil Gentle Cleanser on damp skin, 60 seconds, rinse, pat dry." },
  { key: "jojoba", label: "4–5 drops WishCare Jojoba on palms, press into face and neck." },
  { key: "tbar", label: "T-bar 5–8 min, slow upward/outward: jaw, cheeks, forehead, neck drain." },
  { key: "finish", label: "Let leftover jojoba absorb. Blot only if it feels too oily." },
];

function hairNightSerumSteps() {
  return [
    { key: "serum", label: "Arata MitoActive Serum on scalp target areas." },
    { key: "redlight", label: "Frizty massager, Red Light mode only (no kneading) 5 min." },
  ];
}

function hairProtocol(day) {
  if (day === 6) {
    return {
      key: "hair-stamp",
      title: "Saturday stamp protocol",
      scheduledAt: "21:30",
      durationMin: 40,
      alertLevel: "non_negotiable",
      steps: [
        { key: "shampoo", label: "Shampoo so scalp is free of oil and dirt." },
        { key: "sterilize", label: "Dip derma-stamp needles in 70% isopropyl alcohol for 10 minutes." },
        { key: "stamp", label: "0.5–0.75 mm. 4–5 gentle presses per spot on thinning areas. Do not drag." },
        { key: "redlight", label: "Frizty Red Light only (no kneading) for 5 minutes." },
        { key: "rest", label: "No topical products overnight. Skip Arata serum tonight." },
      ],
    };
  }

  if (day === 0) {
    return {
      key: "hair-wash-night",
      title: "Sunday hair: serum + red light",
      scheduledAt: "22:00",
      durationMin: 15,
      alertLevel: "important",
      extraMorning: {
        key: "hair-sunday-wash",
        title: "Sunday shampoo",
        scheduledAt: "08:30",
        durationMin: 15,
        alertLevel: "normal",
        steps: [{ key: "shampoo", label: "Regular shampoo wash this morning or afternoon." }],
      },
      steps: hairNightSerumSteps(),
    };
  }

  if (day === 3) {
    return {
      key: "hair-oil",
      title: "Wednesday oil + knead, then night serum",
      scheduledAt: "19:30",
      durationMin: 60,
      alertLevel: "important",
      steps: [
        { key: "oil", label: "Diluted rosemary oil on scalp (pre-wash)." },
        { key: "knead", label: "Frizty full kneading + Red Light 8–10 min." },
        { key: "wait", label: "Leave oil 45 min, then wash off." },
        { key: "serum", label: "After wash, night: Arata MitoActive Serum." },
        { key: "redlight", label: "Red Light only, 5 min. No kneading with serum." },
      ],
    };
  }

  return {
    key: "hair-serum",
    title: "Hair: Arata serum + red light",
    scheduledAt: "22:05",
    durationMin: 12,
    alertLevel: "important",
    steps: hairNightSerumSteps(),
  };
}

function buildDay(day) {
  const workout = WORKOUT_BY_DAY[day];
  const study = STUDY_BY_DAY[day];
  const hair = hairProtocol(day);
  const office = day >= 1 && day <= 6;

  const items = [
    {
      key: "wake",
      domain: "health",
      title: "Wake + water, no phone",
      scheduledAt: day === 0 ? "07:30" : "06:00",
      durationMin: 10,
      alertLevel: "non_negotiable",
      alarmMode: "scan_dismiss",
      steps: [
        { key: "water", label: "Drink water." },
        { key: "phone", label: "Do not open the phone for 10 minutes." },
      ],
    },
  ];

  if (day !== 0) {
    items.push({
      key: "amla",
      domain: "health",
      title: "Optional amla drink",
      scheduledAt: "06:10",
      durationMin: 10,
      alertLevel: "info",
      steps: [{ key: "amla", label: "Amla + little ginger + curry leaves + water. Black pepper optional." }],
    });
  }

  items.push({
    key: "workout",
    domain: "fitness",
    title: workout.title,
    scheduledAt: day === 0 ? "09:00" : "06:30",
    durationMin: day === 0 ? 50 : 45,
    alertLevel: "non_negotiable",
    steps: workout.steps,
  });

  items.push({
    key: "skin-morning",
    domain: "skin",
    title: "Morning skin: refresh & protect",
    scheduledAt: day === 0 ? "08:00" : "07:15",
    durationMin: 20,
    alertLevel: "non_negotiable",
    steps: SKIN_MORNING_STEPS,
  });

  items.push({
    key: "breakfast",
    domain: "health",
    title: "Protein breakfast + fruit",
    scheduledAt: day === 0 ? "08:30" : "07:40",
    durationMin: 30,
    alertLevel: "normal",
    steps: [{ key: "protein", label: "Eggs or other protein + oats/poha/roti + fruit + nuts/seeds." }],
  });

  items.push({
    key: "seasonal-fruit",
    domain: "health",
    title: "Seasonal fruit",
    // After lunch, not right after breakfast — too heavy back-to-back with
    // breakfast + seeds/dry fruits.
    scheduledAt: day === 0 ? "13:30" : "14:00",
    durationMin: 5,
    alertLevel: "normal",
    // Placeholder — replaced with the actual month's picks at plan-generation
    // time (fillSeasonalFruit in routes.js), since a weekday template can't
    // know which calendar month it'll be used in.
    steps: [{ key: "fruit", label: "__SEASONAL_FRUIT__" }],
  });

  items.push({
    key: "seeds-dryfruits",
    domain: "health",
    title: "Seeds & dry fruits",
    scheduledAt: day === 0 ? "08:40" : "07:50",
    durationMin: 5,
    alertLevel: "normal",
    steps: [
      { key: "seeds", label: `Seeds: ${pickRotating(SEEDS, day, 0, 2).join(" + ")}.` },
      { key: "dryfruits", label: `Dry fruits: ${pickRotating(DRY_FRUITS, day, 0, 3).join(" + ")}.` },
    ],
  });

  if (hair.extraMorning) {
    items.push({
      key: hair.extraMorning.key,
      domain: "hair",
      title: hair.extraMorning.title,
      scheduledAt: hair.extraMorning.scheduledAt,
      durationMin: hair.extraMorning.durationMin,
      alertLevel: hair.extraMorning.alertLevel,
      steps: hair.extraMorning.steps,
    });
  }

  if (office) {
    items.push({
      key: "commute",
      domain: "career",
      title: "Get ready / commute",
      scheduledAt: "08:10",
      durationMin: 50,
      alertLevel: "normal",
      steps: [{ key: "spf-check", label: "Sunscreen already on before going outdoors." }],
    });
    items.push({
      key: "office",
      domain: "career",
      title: "Office block",
      scheduledAt: "09:30",
      durationMin: 540,
      alertLevel: "info",
      steps: [
        { key: "hydrate", label: "Hydrate through the day." },
        { key: "lunch", label: "Lunch 1–2 PM: protein + veg + dal/beans + rice/roti." },
        { key: "snack", label: "4:30 snack: fruit, curd, roasted chana, or nuts." },
      ],
    });
    // Second anchor: everything from here on shifts with "home time" (office
    // end + commute), not wake time. Office ends ~18:30, so this baseline
    // (19:30) assumes a ~1hr commute — matches the real "6 / 6:30 out, 7:30
    // home" pattern instead of a fixed offset from wake-up.
    items.push({
      key: "home",
      domain: "career",
      title: "Home — commute done",
      scheduledAt: "19:30",
      durationMin: 5,
      alertLevel: "info",
      anchor: "home",
      steps: [{ key: "wind-down", label: "Commute done. Change out of work clothes, wind down a few minutes." }],
    });
    items.push({
      key: "walk-home",
      domain: "fitness",
      title: "Easy walk if practical",
      scheduledAt: "19:45",
      durationMin: 15,
      alertLevel: "info",
      anchor: "home",
      steps: [{ key: "walk", label: "10–15 min easy walk, only if there's time before dinner." }],
    });
    items.push({
      key: "dinner",
      domain: "health",
      title: "Dinner",
      scheduledAt: "20:30",
      durationMin: 30,
      alertLevel: "normal",
      anchor: "home",
      // Also allowed to compress earlier on a very late home day, so it can
      // never land after the protected night routine below.
      flexible: true,
      steps: [{ key: "dinner", label: "Protein + vegetables + moderate carbs." }],
    });
  } else {
    items.push({
      key: "dinner",
      domain: "health",
      title: "Dinner",
      scheduledAt: "20:00",
      durationMin: 30,
      alertLevel: "normal",
      steps: [{ key: "dinner", label: "Protein + vegetables + moderate carbs. Keep it lighter if you want." }],
    });
  }

  items.push({
    key: "study",
    domain: "learning",
    title: study.title,
    scheduledAt: day === 0 ? "10:30" : "21:00",
    durationMin: day === 0 ? 40 : 25,
    alertLevel: "important",
    // Lower priority: rides the home-time anchor on office days, but is
    // allowed to compress earlier (never later) so it never eats into the
    // protected night routine / sleep below.
    anchor: office ? "home" : "wake",
    flexible: true,
    steps: [{ key: "block", label: study.detail }],
  });

  if (hair.key === "hair-oil") {
    items.push({
      key: hair.key,
      domain: "hair",
      title: hair.title,
      scheduledAt: hair.scheduledAt,
      durationMin: hair.durationMin,
      alertLevel: hair.alertLevel,
      anchor: "fixed",
      steps: hair.steps,
    });
  }

  items.push({
    key: "skin-night",
    domain: "skin",
    title: "Night skin: cleanse + T-bar",
    scheduledAt: "22:00",
    durationMin: 20,
    alertLevel: "non_negotiable",
    anchor: "fixed",
    steps: SKIN_NIGHT_STEPS,
  });

  if (hair.key !== "hair-oil") {
    items.push({
      key: hair.key,
      domain: "hair",
      title: hair.title,
      scheduledAt: hair.scheduledAt,
      durationMin: hair.durationMin,
      alertLevel: hair.alertLevel,
      anchor: "fixed",
      steps: hair.steps,
    });
  }

  items.push({
    key: "sleep",
    domain: "health",
    title: "Screens down, sleep",
    scheduledAt: "22:30",
    durationMin: 30,
    alertLevel: "important",
    anchor: "fixed",
    steps: [
      { key: "screens", label: "Dim lights, reduce screens from 9:30, in bed by 10:30–11:00." },
      { key: "hours", label: "Target 7–9 hours." },
    ],
  });

  return items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

function weeklyTemplates() {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    weekday: day,
    dayType: day === 0 ? "weekend" : "office",
    items: buildDay(day),
  }));
}

module.exports = {
  LIFE_AREAS,
  weeklyTemplates,
  seasonalFruitsForMonth,
};
