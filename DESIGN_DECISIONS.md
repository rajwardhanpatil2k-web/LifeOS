# Design decisions

## Answers that set the scope

| Question | Answer | What it means |
|---|---|---|
| Browser page | Redesign with the phone | Same colors, type, and spacing. It stays a simple Today, Week, export, and delete. No new browser features. |
| Assistant on Today | Collapsed until tapped | One row opens the same sheet. Mute, shift, skip, add, confirm, and the health refusal all stay. |
| Undo a step | Visible control, double-tap kept | Double-tap still undoes the whole item. A visible Undo is there too, so the gesture is not the only way. |
| Insights wording | Soften | “Leaking” and “routines you keep dropping” change. The numbers do not. |

## Direction

One direction: a quiet daily page, dark first.

The app is opened half-awake and again late at night. The next thing and its time should be obvious before anything else. Gold marks only that next step and the one main button. Everything else stays quiet.

What this refuses: streaks as trophies, confetti, extra colors for their own sake, and a second accent fighting the gold.

## Color

Dark is the real design. Light is the same structure on warm paper, not an afterthought.

| Role | Dark | Light | Use |
|---|---|---|---|
| Page | `#0a0b0d` | `#f6f4ef` | Already in the app. Keep. |
| Card | `#15181e` | `#ffffff` | Keep. |
| Text | `#f2f4f7` | `#21232a` | Keep. |
| Secondary text | `#b7bec8` | `#3e4654` | Raised from today’s dim gray so small notes stay readable. |
| Gold | `#d4af6a` | `#8a6416` | Next task, the one primary button, the current time mark. Not every button. |
| Done | `#6bc9a0` | `#1f7a56` | Finished. Always with the word Done. |
| Waiting | no extra color | no extra color | The default card. |
| Needs attention | `#d98b73` | `#9a4030` | A missed time, a blocked permission, a destructive delete. Not a missed workout day. |
| Assistant | `#6d8cff` | `#3457a6` | Only inside the assistant sheet and the “Ask” row. |

Category marks are a short bar plus the word, never color alone:

| Kind | Mark |
|---|---|
| Workout | Teal, the current workout color |
| Meal | Warm wheat, distinct from skin |
| Supplement | Muted violet |
| Skincare | The current skin peach |
| Hair care | The current hair bronze |
| Sleep and wake | No extra color |
| Office and home | Quiet gray, with the word |

Meals, supplements, and sleep stop sharing one gray “Health” tag. The word on the tag still says what it is.

The undo bar, the blank moment before sign-in, and sign-in itself follow light and dark. The wake camera and the incoming call stay dark on purpose, like a lock screen.

## Type

The phone’s own font. No downloaded typeface. A custom font would be a large file for a gain the system font already gives, and this app has to stay quick on a mid-range Android phone.

| Role | Size / line height | Weight |
|---|---|---|
| Next task | 28 / 34 | Semibold |
| Screen title | 20 / 26 | Semibold |
| Card title | 17 / 22 | Semibold |
| Time | 15 / 20 | Medium, tabular numbers so digits do not jump |
| Body | 15 / 22 | Regular |
| Note | 13 / 18 | Regular. Nothing important smaller than this. |

The 9-point badges go away. A tag is a word at 13, or it is not there.

## Space, shape, depth, icons

- An 8-point grid. Page inset 20. Card padding 16. Space between cards 12.
- Cards radius 16. Buttons and inputs 12. Tags are pills.
- Dark cards are separated by a hairline, not a drop shadow. Light cards get one soft shadow. Dragging a card is the only stronger lift.
- One icon set, the one already used on the tabs. Outline by default. Filled only for the selected tab and the next task. The text drag handle becomes an icon.

## Motion

Short and physical. 180 to 220 milliseconds. No bounce used as decoration.

- Completing an item: the mark settles and the card stays readable. It does not fade into a ghost.
- The assistant sheet and the undo bar ease in. Reduced motion makes both instant.
- Nothing else animates.

## How the main screens will feel

Today: the next task is the top of the page, large, with its time. Under it, the day is a vertical timeline. The assistant is one row. Warnings are one line, not a stack of italics.

Shift: the sheet’s confirm step shows the old time and the new time for each moved item, then one confirm button. Undo stays a bar for 10 minutes.

Workout: the set you are filling is the focus. “Why this?” stays a disclosure under that exercise. The pain line stays plain and caring.

Insights: a few numbers, then a short sentence. Missed days are described as not done yet, not as a leak.

Settings: the same tokens. Delete is visually apart from Export. Wake time stays where it is.

Alarm screens: layout can breathe, but they stay full-screen and dark. No new steps.

## Not in this direction

- No new libraries.
- No change to when a shift is confirmed, when mute is immediate, or what the wake alarm requires.
- No gamification on the timeline.
