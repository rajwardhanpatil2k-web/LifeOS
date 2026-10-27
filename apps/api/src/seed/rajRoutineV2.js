const VERSION = "raj-v2";
const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const WAKE = { 0: "07:30", 1: "06:00", 2: "06:00", 3: "06:00", 4: "06:00", 5: "06:00", 6: "06:45" };
const BED = { 0: "22:00", 1: "22:00", 2: "22:00", 3: "22:00", 4: "22:00", 5: "22:45", 6: "23:30" };
const DAY_TYPE = { 0: "off", 1: "wfh", 2: "wfh", 3: "office", 4: "office", 5: "office", 6: "off" };
const GYM_MIN = { 0: 30, 1: 90, 2: 90, 3: 60, 4: 60, 5: 60, 6: 90 };
const GYM_AT = { 0: "09:00", 1: "07:00", 2: "07:00", 3: "07:00", 4: "07:00", 5: "07:00", 6: "07:30" };

const PAIN = "Sharp or joint pain means stop that exercise. Dull muscle effort is normal. If it persists, see a professional.";
const REST = "Rest about 2 minutes on the main lifts, and 60–90 seconds on the smaller exercises. Stop around RPE 6–8, with a couple of reps left.";

function blockId(hhmm) {
  const hour = Number(String(hhmm).slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "night";
}

function task(fields) {
  const scheduledAt = fields.scheduledAt;
  return {
    status: "pending",
    alertLevel: "normal",
    alarmMode: "none",
    anchor: "wake",
    movable: "soft",
    source: "routine",
    steps: [],
    deps: [],
    ...fields,
    plannedAt: fields.plannedAt || scheduledAt,
    blockId: fields.blockId || blockId(scheduledAt),
  };
}

function workoutSteps(day) {
  const warm = { key: "warmup", label: "Warm up 5–10 minutes, then 1–2 light ramp-up sets before the first main lift." };
  const cool = { key: "cooldown", label: "Cool down 5 minutes: easy walk and light stretches." };
  const pain = { key: "pain", label: PAIN };
  const rest = { key: "rest", label: REST };
  if (day === 1) {
    return [
      warm,
      { key: "bench", label: "Bench press, 3 sets of 10–12. Barbell or dumbbells." },
      { key: "incline", label: "Incline dumbbell press, 3 sets of 10–12." },
      { key: "press", label: "Seated overhead dumbbell press, 3 sets of 10–12." },
      { key: "raise", label: "Lateral raises, 3 sets of 12–15. No swinging." },
      { key: "pushdown", label: "Cable triceps pushdown, or overhead dumbbell extension, 3 sets of 12." },
      { key: "plank", label: "Forearm plank, 3 holds of about 45 seconds." },
      rest, cool, pain,
    ];
  }
  if (day === 2) {
    return [
      warm,
      { key: "pulldown", label: "Wide-grip lat pulldown, 3 sets of 10–12." },
      { key: "row", label: "Seated cable row, 3 sets of 10–12." },
      { key: "dbrow", label: "Single-arm dumbbell row, 3 sets of 10–12 each arm." },
      { key: "facepull", label: "Face pulls, 3 sets of 15." },
      { key: "curl", label: "Dumbbell curls, 3 sets of 10–12, lower for about 2 seconds." },
      { key: "hammer", label: "Hammer curls, 3 sets of 10–12." },
      { key: "cardio", label: "10 minutes easy or moderate treadmill." },
      rest, cool, pain,
    ];
  }
  if (day === 3) {
    return [
      warm,
      { key: "squat", label: "Squat, 3 sets of 10–12. Barbell or goblet." },
      { key: "rdl", label: "Dumbbell Romanian deadlift, 3 sets of 10–12. Feel the hamstring stretch, keep the back neutral." },
      { key: "press", label: "Leg press, 3 sets of 12." },
      { key: "calf", label: "Seated calf raise, 3 sets of 15." },
      rest, cool, pain,
    ];
  }
  if (day === 4) {
    return [
      warm,
      { key: "clean", label: "Dumbbell clean and press, 3 sets of 10. Light technique practice for the first 4 weeks." },
      { key: "pushup", label: "Push-ups, 3 sets of 12–15." },
      { key: "row", label: "Incline dumbbell row, 3 sets of 10–12." },
      { key: "raise", label: "Lateral raises, 3 sets of 12–15." },
      { key: "dips", label: "Bench dips, 3 sets of 12. Swap for a cable pushdown or close-grip push-up if your shoulder complains." },
      rest, cool, pain,
    ];
  }
  if (day === 5) {
    return [
      warm,
      { key: "circuit", label: "3 rounds: 20 air squats, 30 seconds mountain climbers, 20 bicycle crunches, 12 push-ups." },
      { key: "intervals", label: "15 minutes: alternate 1 minute brisk walk and 1 minute faster run." },
      rest, cool, pain,
    ];
  }
  if (day === 6) {
    return [
      warm,
      { key: "deadlift", label: "Deadlift, 3 sets of 8–10. Prefer the trap bar, start light, and ask a trainer to check your form once." },
      { key: "lunge", label: "Dumbbell walking lunges, 3 sets of 10 steps each leg." },
      { key: "press", label: "Standing overhead press, 3 sets of 10." },
      { key: "pullup", label: "Assisted pull-ups, 3 sets. Stop about 2 reps before failure." },
      rest, cool, pain,
    ];
  }
  return [
    { key: "walk", label: "Easy walk or mobility, 30 minutes. No heavy lifting." },
    pain,
  ];
}

function skinNight(day) {
  if (day === 1 || day === 3 || day === 5) {
    return [{ key: "cleanse", label: "Mild cleanser, then nothing else. Bare night." }];
  }
  if (day === 2 || day === 6) {
    return [
      { key: "cleanse", label: "Mild cleanser." },
      { key: "bha", label: "2% salicylic acid." },
      { key: "moisturize", label: "Pea-sized moisturizer." },
    ];
  }
  return [
    { key: "cleanse", label: "Mild cleanser." },
    { key: "mucin", label: "Snail mucin on damp skin." },
    { key: "moisturize", label: "Moisturizer." },
  ];
}

function hairNight(day) {
  if (day === 1) {
    return [
      { key: "red", label: "Red light on a dry scalp, 5–7 minutes." },
      { key: "oil", label: "Rosemary oil on the scalp. Leave it on overnight. You can wash earlier if you want." },
    ];
  }
  if (day === 2) return [{ key: "serum", label: "Mito-Active serum on the roots." }];
  if (day === 3) {
    return [
      { key: "shampoo", label: "Shampoo, then towel-dry." },
      { key: "stamp", label: "Derma stamp: 0.5 mm needle, one press per spot. No oils, serums, or sprays tonight." },
    ];
  }
  if (day === 4) {
    return [
      { key: "red", label: "Red light, 5–7 minutes." },
      { key: "paused", label: "Rosemary oil is paused until a dermatologist confirms the gap after stamping." },
    ];
  }
  if (day === 5 || day === 0) {
    return [
      { key: "wash", label: "Wash with SBL Arnica shampoo and towel-dry." },
      { key: "serum", label: "Mito-Active serum on clean roots." },
    ];
  }
  return [{ key: "spray", label: "Fenugreek spray, leave it in." }];
}

function breakfastAt(day) {
  if (day === 0) return "08:30";
  if (day === 6) return "09:20";
  if (day >= 3 && day <= 5) return "08:20";
  return "08:50";
}

function homeFromGym(day) {
  if (day === 0) return null;
  if (day === 6) return "09:15";
  if (day >= 3 && day <= 5) return "08:15";
  return "08:45";
}

function buildDay(day) {
  const office = DAY_TYPE[day] === "office";
  const items = [
    task({
      key: "wake",
      domain: "health",
      category: "sleep",
      title: "Wake",
      scheduledAt: WAKE[day],
      durationMin: 10,
      alertLevel: "non_negotiable",
      alarmMode: "scan_dismiss",
      anchor: "fixed",
      movable: "fixed",
      steps: [
        { key: "water", label: "Drink water." },
        { key: "phone", label: "No phone for 10 minutes." },
      ],
    }),
  ];

  if (day === 1 || day === 3 || day === 5) {
    items.push(task({
      key: "amla",
      domain: "health",
      category: "meal",
      title: "Amla",
      scheduledAt: "06:05",
      durationMin: 5,
      alertLevel: "info",
      steps: [{ key: "amla", label: "Amla, ginger, curry leaves, and water. Black pepper optional." }],
    }));
  }

  if (day !== 0) {
    items.push(task({
      key: "banana",
      domain: "health",
      category: "meal",
      title: "Banana, then leave",
      scheduledAt: day === 6 ? "07:15" : "06:45",
      durationMin: 10,
      deps: [{ type: "before", target: "workout", minGapMin: 15 }],
      steps: [{ key: "banana", label: "One medium banana, then leave for the gym." }],
    }));
  }

  items.push(task({
    key: "workout",
    domain: "fitness",
    category: "workout",
    title: ["Walk or mobility", "Push", "Pull", "Legs", "Upper circuit", "Core and intervals", "Full body"][day],
    scheduledAt: GYM_AT[day],
    durationMin: GYM_MIN[day],
    minDurationMin: Math.min(45, GYM_MIN[day]),
    alertLevel: day === 0 ? "normal" : "non_negotiable",
    movable: "soft",
    steps: workoutSteps(day),
  }));

  const back = homeFromGym(day);
  if (back) {
    items.push(task({
      key: "back-home",
      domain: "ops",
      category: "work",
      title: "Back home",
      scheduledAt: back,
      durationMin: 10,
      alertLevel: "info",
    }));
  }

  const breakfast = breakfastAt(day);
  items.push(task({
    key: "breakfast",
    domain: "health",
    category: "meal",
    title: "Breakfast",
    scheduledAt: breakfast,
    durationMin: 20,
    steps: [
      { key: "muesli", label: "Muesli with milk, chia, almonds, and walnuts. No banana in this bowl." },
      { key: "eggs", label: "Three eggs." },
    ],
  }));

  if (day !== 0) {
    items.push(task({
      key: "supplements",
      domain: "health",
      category: "supplement",
      title: "Creatine and omega-3",
      scheduledAt: breakfast,
      durationMin: 5,
      alertLevel: "info",
      deps: [{ type: "with", target: "breakfast" }],
      steps: [{ key: "dose", label: "With breakfast. Confirm the dose and timing with a professional." }],
    }));
  }

  if (day !== 0) {
    items.push(task({
      key: "skin-am",
      domain: "skin",
      category: "skincare",
      title: day === 6 ? "Sunscreen" : "Morning skin",
      scheduledAt: office ? "08:45" : day === 6 ? "09:50" : "09:20",
      durationMin: 10,
      steps: [{ key: "spf", label: "Wash, then SPF 50 sunscreen." }],
    }));
  }

  if (office) {
    items.push(task({
      key: "leave-office",
      domain: "career",
      category: "work",
      title: "Leave for the office",
      scheduledAt: "09:00",
      durationMin: 15,
      movable: "fixed",
      anchor: "fixed",
    }));
  }

  items.push(task({
    key: "water-11",
    domain: "health",
    category: "wellness",
    title: "Water",
    scheduledAt: "11:00",
    durationMin: 1,
    alertLevel: "info",
    movable: "free",
  }));
  items.push(task({
    key: "lunch",
    domain: "health",
    category: "meal",
    title: "Lunch",
    scheduledAt: "13:00",
    durationMin: 30,
    steps: [
      { key: "plate", label: "Home-cooked lunch: roti or rice, dal, sabzi, and curd." },
    ],
  }));
  items.push(task({
    key: "seed-blend",
    domain: "health",
    category: "meal",
    title: "Sunflower-sesame seed blend",
    scheduledAt: "13:00",
    durationMin: 2,
    deps: [{ type: "with", target: "lunch" }],
    steps: [
      { key: "mix", label: "Stir a spoon of the pre-ground sunflower and sesame blend into the curd or over the food." },
    ],
  }));
  if (office) {
    items.push(task({
      key: "spf-reapply",
      domain: "skin",
      category: "skincare",
      title: "Sunscreen reapply",
      scheduledAt: "13:30",
      durationMin: 2,
      alertLevel: "info",
      movable: "free",
    }));
  }
  items.push(task({
    key: "water-15",
    domain: "health",
    category: "wellness",
    title: "Water",
    scheduledAt: "15:00",
    durationMin: 1,
    alertLevel: "info",
    movable: "free",
  }));
  items.push(task({
    key: "fruit",
    domain: "health",
    category: "meal",
    title: "Fruit and pumpkin seeds",
    scheduledAt: "16:00",
    durationMin: 10,
    steps: [
      { key: "fruit", label: "One fruit: apple, papaya, or whatever is in season." },
      { key: "seeds", label: "A small handful of roasted pumpkin seeds with it." },
    ],
  }));

  if (day === 6) {
    items.push(task({
      key: "cultfit",
      domain: "fitness",
      category: "workout",
      title: "Cult.fit, optional",
      scheduledAt: "17:00",
      durationMin: 15,
      alertLevel: "info",
      movable: "free",
      steps: [{ key: "easy", label: "Time is not set. Keep it easy, or skip it. A snack reminder will sit 90 minutes before, once you set the time." }],
    }));
  }

  if (office) {
    items.push(task({
      key: "leave-work",
      domain: "career",
      category: "work",
      title: "Leave the office for dinner",
      scheduledAt: "18:00",
      durationMin: 15,
      anchor: "home",
      steps: [{ key: "out", label: "Dinner is out, not at home." }],
    }));
    items.push(task({
      key: "dinner",
      domain: "health",
      category: "meal",
      title: "Dinner out",
      scheduledAt: "18:30",
      durationMin: 45,
      alertLevel: "info",
      anchor: "home",
      movable: "free",
    }));
    items.push(task({
      key: "home",
      domain: "ops",
      category: "work",
      title: "Home",
      scheduledAt: "20:30",
      durationMin: 10,
      anchor: "fixed",
      movable: "fixed",
    }));
  } else {
    items.push(task({
      key: "dinner",
      domain: "health",
      category: "meal",
      title: "Dinner",
      scheduledAt: day === 0 || day === 6 ? "20:00" : "19:30",
      durationMin: 30,
    }));
  }

  const prepAt = office ? "20:40" : "19:15";
  items.push(task({
    key: "tomorrow-prep",
    domain: "ops",
    category: "work",
    title: "Set out tomorrow's breakfast and fruit",
    scheduledAt: prepAt,
    durationMin: 10,
    alertLevel: "important",
    locked: true,
    anchor: "fixed",
    movable: "fixed",
  }));

  const pm = day === 0 || day === 6 ? "20:30" : office ? "21:00" : "20:00";
  items.push(task({
    key: "pm-routine",
    domain: "skin",
    category: "skincare",
    title: day === 3 ? "Shampoo, then stamp" : "Evening skin and hair",
    scheduledAt: pm,
    durationMin: day === 3 ? 40 : 30,
    minDurationMin: 20,
    alertLevel: "important",
    anchor: "fixed",
    deps: day === 3 ? [{ type: "blocks", target: "rosemary-oil" }] : [],
    steps: [...skinNight(day), ...hairNight(day)],
  }));

  if (day === 1 || day === 2) {
    items.push(task({
      key: "study",
      domain: "learning",
      category: "study",
      title: ["DSA review", "DSA", "System design"][day],
      scheduledAt: "21:00",
      durationMin: 30,
      minDurationMin: 15,
      movable: "free",
      flexible: true,
    }));
  } else if (day === 4) {
    items.push(task({
      key: "study",
      domain: "learning",
      category: "study",
      title: "DSA",
      scheduledAt: "21:30",
      durationMin: 20,
      minDurationMin: 15,
      movable: "free",
      flexible: true,
    }));
  } else if (day === 5) {
    items.push(task({
      key: "study",
      domain: "learning",
      category: "study",
      title: "System design",
      scheduledAt: "21:30",
      durationMin: 45,
      minDurationMin: 15,
      movable: "free",
      flexible: true,
    }));
  } else if (day === 0) {
    items.push(task({
      key: "study",
      domain: "learning",
      category: "study",
      title: "DSA review",
      scheduledAt: "10:30",
      durationMin: 40,
      minDurationMin: 15,
      movable: "free",
      flexible: true,
    }));
  }

  const wind = { 0: "21:30", 1: "21:30", 2: "21:30", 3: "21:45", 4: "21:50", 5: "22:15", 6: "23:00" };
  items.push(task({
    key: "wind-down",
    domain: "health",
    category: "sleep",
    title: "Wind down, screens down",
    scheduledAt: wind[day],
    durationMin: 15,
    anchor: "fixed",
    movable: "fixed",
    alertLevel: "important",
    steps: day === 3 ? [{ key: "study", label: "Optional: 20 minutes of study only if skincare finished early." }] : [],
  }));
  items.push(task({
    key: "bed",
    domain: "health",
    category: "sleep",
    title: "Bed",
    scheduledAt: BED[day],
    durationMin: 10,
    anchor: "fixed",
    movable: "fixed",
    alertLevel: "non_negotiable",
    steps: [{ key: "pillow", label: "Silk or satin pillowcase." }],
  }));

  return {
    weekday: day,
    name: NAMES[day],
    dayType: DAY_TYPE[day],
    items,
  };
}

function draftSettings() {
  return {
    timezone: "Asia/Kolkata",
    sleepHours: 8,
    sleepMode: "auto",
    gymBlockMin: { wfh: 90, office: 60, off: 90 },
    dayTypes: { ...DAY_TYPE },
    wakeByWeekday: { ...WAKE },
    bedByWeekday: { ...BED },
    homeByWeekday: { 3: "20:30", 4: "20:30", 5: "20:30" },
    aiEnabled: true,
    deloadEveryWeeks: 5,
  };
}

function weeklyTemplatesV2() {
  return [0, 1, 2, 3, 4, 5, 6].map(buildDay);
}

function describeWeek(days = weeklyTemplatesV2()) {
  return days.map((day) => ({
    name: day.name,
    dayType: day.dayType,
    lines: [...day.items]
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.title.localeCompare(b.title))
      .map((item) => `${item.scheduledAt}  ${item.title}`),
  }));
}

module.exports = {
  VERSION,
  WAKE,
  BED,
  DAY_TYPE,
  GYM_MIN,
  draftSettings,
  weeklyTemplatesV2,
  describeWeek,
};
