const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Raj" },
    timezone: { type: String, default: "Asia/Kolkata" },
    officeDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    wakeTarget: { type: String, default: "06:00" },
    // When you're actually home after office + commute — the second
    // schedule anchor. Dinner/study/evening walk shift with this instead of
    // wake time, while the night routine + sleep below stay fixed either way.
    homeTarget: { type: String, default: "19:30" },
    sleepTarget: { type: String, default: "22:30" },
    // Evening call that lists tomorrow's breakfast/fruit so you can set it out tonight.
    prepTarget: { type: String, default: "20:00" },
    themeMode: { type: String, enum: ["dark", "light"], default: "dark" },
    voiceAlerts: { type: Boolean, default: true },
    aiEnabled: { type: Boolean, default: true },
    // The wake and home clocks the approved week was built around. A later
    // settings change is the difference from these, so Saturday and Sunday
    // keep their own times until that change.
    wakeBaseline: { type: String, default: "" },
    homeBaseline: { type: String, default: "" },
    sleepHours: { type: Number, default: 8 },
    sleepMode: { type: String, default: "auto" },
    gymBlockMin: { type: Object, default: undefined },
    dayTypes: { type: Object, default: undefined },
    deloadEveryWeeks: { type: Number, default: 5 },
    priorities: {
      type: [String],
      default: ["skin", "hair", "fitness", "learning"],
    },
    deferred: { type: [String], default: ["dance"] },
    focusBlock: {
      active: { type: Boolean, default: false },
      startedAt: Date,
      until: Date,
      reason: { type: String, default: "" },
      resumeMode: { type: String, default: "catch_up" },
      source: { type: String, default: "ai" },
    },
  },
  { timestamps: true }
);

const TemplateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    weekday: { type: Number, required: true },
    dayType: { type: String, enum: ["office", "weekend", "wfh", "off"], required: true },
    items: { type: Array, default: [] },
    version: { type: String, default: "raj-v1" },
    approved: { type: Boolean, default: true },
  },
  { timestamps: true }
);

TemplateSchema.index({ userId: 1, weekday: 1 }, { unique: true });

const DepSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["before", "with", "after", "blocks"], required: true },
    target: { type: String, required: true },
    minGapMin: Number,
  },
  { _id: false }
);

const StepSchema = new mongoose.Schema(
  {
    key: String,
    label: String,
    done: { type: Boolean, default: false },
    doneAt: Date,
  },
  { _id: false }
);

const PlanItemSchema = new mongoose.Schema(
  {
    key: String,
    domain: String,
    title: String,
    scheduledAt: String,
    durationMin: Number,
    alertLevel: {
      type: String,
      enum: ["info", "normal", "important", "non_negotiable"],
      default: "normal",
    },
    // "scan_dismiss" items ring through silent/DND via the native wake-alarm
    // module and can only be silenced by holding the wake QR code in the
    // camera for 15 straight seconds (see apps/mobile WakeAlarmScreen).
    alarmMode: {
      type: String,
      enum: ["none", "scan_dismiss"],
      default: "none",
    },
    // Which setting drives this item's scheduledAt when wake/home time
    // changes: "wake" (default, morning), "home" (evening, after office +
    // commute), or "fixed" (night routine / sleep — never auto-shifted).
    anchor: {
      type: String,
      enum: ["wake", "home", "fixed"],
      default: "wake",
    },
    // Lower-priority items (e.g. study) that can compress earlier so they
    // never push into the protected "fixed" night routine.
    flexible: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "done", "skipped"],
      default: "pending",
    },
    skippedReason: String,
    source: { type: String, enum: ["routine", "custom", "ai"], default: "routine" },
    carryForward: { type: Boolean, default: false },
    originKey: String,
    spokenRequest: String,
    // System items (tomorrow's food reminder) stay on the plan. Time can move; delete cannot.
    locked: { type: Boolean, default: false },
    // Incoming-call flow: ready at start, completion check at end,
    // plus snooze / "remind me later" timestamps used by the mobile alarm.
    startedAt: Date,
    snoozeUntil: Date,
    followUpUntil: Date,
    heldUntil: Date,
    holdReason: { type: String, default: undefined },
    steps: [StepSchema],
    category: {
      type: String,
      enum: ["workout", "meal", "supplement", "skincare", "haircare", "study", "sleep", "work", "wellness"],
    },
    plannedAt: String,
    movable: { type: String, enum: ["fixed", "soft", "free"] },
    minDurationMin: Number,
    deps: { type: [DepSchema], default: undefined },
    blockId: { type: String, enum: ["morning", "afternoon", "night"] },
  },
  { _id: true }
);

const DailyPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    weekday: Number,
    dayType: String,
    items: [PlanItemSchema],
    generatedFrom: { type: String, default: "raj-v1" },
    status: { type: String, default: "active" },
    // Minutes items were shifted from the template's base time at generation
    // time, per anchor. Kept so a later wake/home-time change only has to
    // re-shift by the delta instead of recomputing everything from scratch.
    wakeShiftMin: { type: Number, default: 0 },
    homeShiftMin: { type: Number, default: 0 },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DailyPlanSchema.index({ userId: 1, date: 1 }, { unique: true });
DailyPlanSchema.pre("save", function bumpRevision() {
  if (this.isNew || !this.isModified() || this.isModified("revision")) return;
  this.revision = (this.revision || 0) + 1;
});

const ShiftOpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    source: { type: String, enum: ["ai", "manual"], default: "manual" },
    intent: { type: String, required: true },
    status: { type: String, enum: ["previewed", "applied", "undone", "expired"], default: "previewed" },
    planRevision: { type: Number, required: true },
    tokenHash: { type: String, required: true },
    before: { type: Array, default: [] },
    after: { type: Array, default: [] },
    changes: { type: Array, default: [] },
    conflicts: { type: Array, default: [] },
    reason: { type: String, default: "" },
    appliedAt: Date,
    undoUntil: Date,
  },
  { timestamps: true }
);

const LifeEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: String,
    domain: String,
    type: String,
    itemKey: String,
    stepKey: String,
    status: String,
    notes: String,
    meta: { type: Object, default: {} },
    source: { type: String, default: "manual" },
  },
  { timestamps: true }
);

LifeEventSchema.index({ userId: 1, date: 1 });

const DailyScoreSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    overall: Number,
    byDomain: { type: Object, default: {} },
    completed: Number,
    total: Number,
  },
  { timestamps: true }
);

DailyScoreSchema.index({ userId: 1, date: 1 }, { unique: true });

// AI narration of a week/month, cached so reopening the Insights tab is free.
// statsHash is a fingerprint of the deterministic numbers the narration was
// written from: if you complete something and the numbers move, the hash stops
// matching and the report is regenerated. Otherwise it's served from Mongo.
const InsightReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    period: { type: String, enum: ["week", "month"], required: true },
    periodKey: { type: String, required: true },
    statsHash: { type: String, required: true },
    summary: String,
    wins: { type: [String], default: [] },
    leaks: { type: [String], default: [] },
    actions: { type: [String], default: [] },
    verdict: String,
    model: String,
    usage: { type: Object, default: {} },
  },
  { timestamps: true }
);

InsightReportSchema.index({ userId: 1, period: 1, periodKey: 1 }, { unique: true });

// Spoken/AI tasks that stay in the queue until marked done. Each open
// record is copied onto the next day's plan at the same planned time.
const CarryForwardTaskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    originKey: { type: String, required: true },
    title: { type: String, required: true },
    scheduledAt: { type: String, required: true },
    durationMin: { type: Number, default: 30 },
    domain: { type: String, default: "ops" },
    alertLevel: {
      type: String,
      enum: ["info", "normal", "important", "non_negotiable"],
      default: "normal",
    },
    steps: [StepSchema],
    spokenRequest: String,
    status: { type: String, enum: ["open", "done", "cancelled"], default: "open" },
  },
  { timestamps: true }
);

CarryForwardTaskSchema.index({ userId: 1, originKey: 1 }, { unique: true });
CarryForwardTaskSchema.index({ userId: 1, status: 1 });

const RoutineDraftSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: String, required: true },
    approved: { type: Boolean, default: false },
    settings: { type: Object, default: {} },
    days: { type: Array, default: [] },
  },
  { timestamps: true }
);

RoutineDraftSchema.index({ userId: 1, version: 1 }, { unique: true });

const AuthAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordSalt: { type: String, required: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const SessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    deviceLabel: { type: String, default: "" },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const MutationReceiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    clientId: { type: String, required: true },
    itemId: String,
    field: String,
    clientAt: Number,
    applied: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MutationReceiptSchema.index({ userId: 1, clientId: 1 }, { unique: true });

const ExerciseSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    weekday: Number,
    stepKey: String,
    name: String,
    equipment: String,
    stepKg: Number,
    repLow: Number,
    repHigh: Number,
    restSec: Number,
    why: String,
    cues: { type: [String], default: [] },
    mistakes: { type: [String], default: [] },
    substitutes: { type: [String], default: [] },
    safetyNote: String,
  },
  { timestamps: true }
);

const WorkoutSetSchema = new mongoose.Schema(
  {
    exerciseKey: String,
    setIndex: Number,
    reps: Number,
    weightKg: Number,
    rpe: Number,
    isWarmup: { type: Boolean, default: false },
    painFlag: { type: Boolean, default: false },
  },
  { _id: false }
);

const WorkoutSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    planItemId: String,
    clientId: { type: String, required: true },
    checkin: {
      painFlag: Boolean,
      soreness0to4: Number,
      sleepOk: Boolean,
    },
    sets: { type: [WorkoutSetSchema], default: [] },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

WorkoutSessionSchema.index({ userId: 1, clientId: 1 }, { unique: true });
WorkoutSessionSchema.index({ userId: 1, date: 1 });

const SuggestionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["progress", "hold", "reduce", "deload", "extra_rest", "start"],
      required: true,
    },
    exerciseKey: String,
    reason: { type: String, default: "" },
    reasonCodes: { type: [String], default: [] },
    weightKg: Number,
    status: { type: String, enum: ["shown", "accepted", "dismissed"], default: "shown" },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkoutSession" },
  },
  { timestamps: true }
);

SuggestionSchema.index({ userId: 1, status: 1 });

module.exports = {
  User: mongoose.models.User || mongoose.model("User", UserSchema),
  RoutineTemplate:
    mongoose.models.RoutineTemplate ||
    mongoose.model("RoutineTemplate", TemplateSchema),
  DailyPlan:
    mongoose.models.DailyPlan || mongoose.model("DailyPlan", DailyPlanSchema),
  LifeEvent:
    mongoose.models.LifeEvent || mongoose.model("LifeEvent", LifeEventSchema),
  DailyScore:
    mongoose.models.DailyScore || mongoose.model("DailyScore", DailyScoreSchema),
  InsightReport:
    mongoose.models.InsightReport ||
    mongoose.model("InsightReport", InsightReportSchema),
  CarryForwardTask:
    mongoose.models.CarryForwardTask ||
    mongoose.model("CarryForwardTask", CarryForwardTaskSchema),
  AuthAccount:
    mongoose.models.AuthAccount || mongoose.model("AuthAccount", AuthAccountSchema),
  Session: mongoose.models.Session || mongoose.model("Session", SessionSchema),
  RoutineDraft:
    mongoose.models.RoutineDraft || mongoose.model("RoutineDraft", RoutineDraftSchema),
  ShiftOp: mongoose.models.ShiftOp || mongoose.model("ShiftOp", ShiftOpSchema),
  Exercise: mongoose.models.Exercise || mongoose.model("Exercise", ExerciseSchema),
  WorkoutSession:
    mongoose.models.WorkoutSession || mongoose.model("WorkoutSession", WorkoutSessionSchema),
  Suggestion: mongoose.models.Suggestion || mongoose.model("Suggestion", SuggestionSchema),
  MutationReceipt:
    mongoose.models.MutationReceipt ||
    mongoose.model("MutationReceipt", MutationReceiptSchema),
};
