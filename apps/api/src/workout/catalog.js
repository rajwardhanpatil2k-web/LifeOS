const { PAIN_LINE } = require("./progression");

const SKIP_STEPS = new Set(["warmup", "cooldown", "pain", "rest"]);

function lift(fields) {
  return {
    cues: [],
    mistakes: [],
    substitutes: [],
    why: "",
    restSec: 120,
    stepKg: 2.5,
    equipment: "barbell",
    repLow: 10,
    repHigh: 12,
    safetyNote: PAIN_LINE,
    ...fields,
  };
}

const CATALOG = [
  lift({ key: "mon-bench", weekday: 1, stepKey: "bench", name: "Bench press", equipment: "barbell", why: "Main horizontal press for the day.", cues: ["Barbell or dumbbells.", "3 sets of 10–12."] }),
  lift({ key: "mon-incline", weekday: 1, stepKey: "incline", name: "Incline dumbbell press", equipment: "dumbbell", stepKg: 2, why: "Upper-chest press after the bench.", cues: ["3 sets of 10–12."] }),
  lift({ key: "mon-press", weekday: 1, stepKey: "press", name: "Seated overhead dumbbell press", equipment: "dumbbell", stepKg: 2, why: "Shoulder press for the push day.", cues: ["3 sets of 10–12."] }),
  lift({ key: "mon-raise", weekday: 1, stepKey: "raise", name: "Lateral raises", equipment: "dumbbell", stepKg: 2, repLow: 12, repHigh: 15, restSec: 75, why: "Smaller shoulder movement.", cues: ["3 sets of 12–15."], mistakes: ["No swinging."] }),
  lift({ key: "mon-pushdown", weekday: 1, stepKey: "pushdown", name: "Triceps pushdown", equipment: "machine", restSec: 75, repLow: 12, repHigh: 12, why: "Triceps work. Overhead dumbbell extension is the other option already on the card.", cues: ["Cable pushdown, or overhead dumbbell extension.", "3 sets of 12."] }),
  lift({ key: "mon-plank", weekday: 1, stepKey: "plank", name: "Forearm plank", equipment: "bodyweight", stepKg: 0, repLow: null, repHigh: null, restSec: 60, why: "A hold, not a loaded lift.", cues: ["3 holds of about 45 seconds."] }),
  lift({ key: "tue-pulldown", weekday: 2, stepKey: "pulldown", name: "Wide-grip lat pulldown", equipment: "machine", why: "Main vertical pull.", cues: ["3 sets of 10–12."] }),
  lift({ key: "tue-row", weekday: 2, stepKey: "row", name: "Seated cable row", equipment: "machine", why: "Main horizontal pull.", cues: ["3 sets of 10–12."] }),
  lift({ key: "tue-dbrow", weekday: 2, stepKey: "dbrow", name: "Single-arm dumbbell row", equipment: "dumbbell", stepKg: 2, why: "One-arm row after the cable row.", cues: ["3 sets of 10–12 each arm."] }),
  lift({ key: "tue-facepull", weekday: 2, stepKey: "facepull", name: "Face pulls", equipment: "machine", repLow: 15, repHigh: 15, restSec: 75, why: "Rear-shoulder and upper-back work.", cues: ["3 sets of 15."] }),
  lift({ key: "tue-curl", weekday: 2, stepKey: "curl", name: "Dumbbell curls", equipment: "dumbbell", stepKg: 2, restSec: 75, why: "Biceps curl.", cues: ["3 sets of 10–12.", "Lower for about 2 seconds."] }),
  lift({ key: "tue-hammer", weekday: 2, stepKey: "hammer", name: "Hammer curls", equipment: "dumbbell", stepKg: 2, restSec: 75, why: "Neutral-grip curl.", cues: ["3 sets of 10–12."] }),
  lift({ key: "tue-cardio", weekday: 2, stepKey: "cardio", name: "Easy treadmill", equipment: "bodyweight", stepKg: 0, repLow: null, repHigh: null, restSec: 0, why: "Easy or moderate, 10 minutes. Not a loaded lift.", cues: ["Keep it easy or moderate."] }),
  lift({ key: "wed-squat", weekday: 3, stepKey: "squat", name: "Squat", equipment: "barbell", why: "Main lower-body lift. Goblet squat is the other option already on the card.", cues: ["Barbell or goblet.", "3 sets of 10–12."] }),
  lift({ key: "wed-rdl", weekday: 3, stepKey: "rdl", name: "Dumbbell Romanian deadlift", equipment: "dumbbell", stepKg: 2, why: "Hamstring hinge.", cues: ["Feel the hamstring stretch.", "Keep the back neutral.", "3 sets of 10–12."] }),
  lift({ key: "wed-press", weekday: 3, stepKey: "press", name: "Leg press", equipment: "machine", why: "Machine squat pattern.", cues: ["3 sets of 12."] }),
  lift({ key: "wed-calf", weekday: 3, stepKey: "calf", name: "Seated calf raise", equipment: "machine", repLow: 15, repHigh: 15, restSec: 75, why: "Calf work after the main lifts.", cues: ["3 sets of 15."] }),
  lift({ key: "thu-clean", weekday: 4, stepKey: "clean", name: "Dumbbell clean and press", equipment: "dumbbell", stepKg: 2, repLow: 10, repHigh: 10, why: "Light technique practice for the first 4 weeks.", cues: ["3 sets of 10.", "Keep it light."] }),
  lift({ key: "thu-pushup", weekday: 4, stepKey: "pushup", name: "Push-ups", equipment: "bodyweight", stepKg: 0, repLow: 12, repHigh: 15, restSec: 75, why: "Bodyweight press.", cues: ["3 sets of 12–15."] }),
  lift({ key: "thu-row", weekday: 4, stepKey: "row", name: "Incline dumbbell row", equipment: "dumbbell", stepKg: 2, why: "Row for the full-body day.", cues: ["3 sets of 10–12."] }),
  lift({ key: "thu-raise", weekday: 4, stepKey: "raise", name: "Lateral raises", equipment: "dumbbell", stepKg: 2, repLow: 12, repHigh: 15, restSec: 75, why: "Shoulder raise.", cues: ["3 sets of 12–15."] }),
  lift({
    key: "thu-dips",
    weekday: 4,
    stepKey: "dips",
    name: "Bench dips",
    equipment: "bodyweight",
    stepKg: 0,
    repLow: 12,
    repHigh: 12,
    restSec: 75,
    why: "Dips stay as written. A swap is your choice, not an automatic change.",
    cues: ["3 sets of 12."],
    substitutes: ["Cable pushdown", "Close-grip push-up"],
  }),
  lift({ key: "fri-circuit", weekday: 5, stepKey: "circuit", name: "Circuit", equipment: "bodyweight", stepKg: 0, repLow: null, repHigh: null, restSec: 60, why: "Three rounds of the written circuit.", cues: ["20 air squats, 30 seconds mountain climbers, 20 bicycle crunches, 12 push-ups."] }),
  lift({ key: "fri-intervals", weekday: 5, stepKey: "intervals", name: "Walk and run intervals", equipment: "bodyweight", stepKg: 0, repLow: null, repHigh: null, restSec: 0, why: "15 minutes, alternating easy and faster.", cues: ["1 minute brisk walk, 1 minute faster run."] }),
  lift({ key: "sat-deadlift", weekday: 6, stepKey: "deadlift", name: "Deadlift", equipment: "barbell", stepKg: 2.5, repLow: 8, repHigh: 10, why: "Prefer the trap bar. Start light.", cues: ["3 sets of 8–10.", "Ask a trainer to check your form once."] }),
  lift({ key: "sat-lunge", weekday: 6, stepKey: "lunge", name: "Dumbbell walking lunges", equipment: "dumbbell", stepKg: 2, why: "Lunge after the deadlift.", cues: ["3 sets of 10 steps each leg."] }),
  lift({ key: "sat-press", weekday: 6, stepKey: "press", name: "Standing overhead press", equipment: "barbell", why: "Standing press.", cues: ["3 sets of 10."] }),
  lift({ key: "sat-pullup", weekday: 6, stepKey: "pullup", name: "Assisted pull-ups", equipment: "machine", stepKg: 2.5, repLow: null, repHigh: null, why: "Assisted version. Stop about 2 reps before failure.", cues: ["3 sets.", "Stop about 2 reps before failure."] }),
  lift({ key: "sun-walk", weekday: 0, stepKey: "walk", name: "Easy walk or mobility", equipment: "bodyweight", stepKg: 0, repLow: null, repHigh: null, restSec: 0, why: "Easy walk or mobility for 30 minutes. No heavy lifting.", cues: ["No heavy lifting."] }),
  lift({ key: "sat-cultfit", weekday: 6, stepKey: "easy", name: "Cult.fit, optional", equipment: "bodyweight", stepKg: 0, repLow: null, repHigh: null, restSec: 0, why: "Optional. Keep it easy, or skip it.", cues: ["Time is not set.", "Low intensity or skip."] }),
];

function exercisesFor(weekday, stepKeys) {
  const wanted = new Set(stepKeys || []);
  return CATALOG.filter((row) => row.weekday === Number(weekday) && wanted.has(row.stepKey) && !SKIP_STEPS.has(row.stepKey));
}

module.exports = { CATALOG, SKIP_STEPS, exercisesFor };
