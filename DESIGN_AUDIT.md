# Design audit

Status: Phase 1 only. No screens were changed.

The app already works. This note lists what a person sees, where the look is uneven, and where a morning or late-night use gets harder than it needs to be. A redesign should change presentation only. Scheduling, alarms, sign-in, and the assistant’s rules stay as they are.

There is no separate onboarding and no separate task-detail screen. Alarm time lives inside Settings. “Why this?” lives inside the workout log.

---

## 1. Screens and what each one is for

| Screen | What it is | States that exist today |
|---|---|---|
| Sign in | Username and password. Shown until a session exists. | Idle, sending, error. The moment before sign-in is known is a blank dark page. |
| Today | The home list. Next item at the top, then every item in order. | Loading spinner, full-screen error, saved-plan offline line, notification warning, exact-alarm warning, focus-mute chip, empty “everything is done” in the hero only. |
| Edit schedule | Change a time, add a one-off task, drag is not here. | Loading spinner, save spinner. |
| Ask AI sheet | Mute, shift, skip, add. Opens from Today. | Typing, listening, thinking, preview with confirm, declined (health questions), error, needs a network. |
| Undo bar | Appears after a confirmed shift. Dark bar, gold Undo. | Visible for 10 minutes, then gone. |
| Week | Last 7 days, percent done, four dots. Tap opens a day. | No loading, no error, no empty message. A blank scroll if the week has not arrived. |
| Day | One past or future day’s cards. Done, skip, undo. | Loading spinner, error. |
| Workout log | Pain, soreness, sleep, then one set per exercise. “Why this?” opens cues. | Loading spinner, error, saved, saved-on-this-phone. |
| Insights | Period picker, adherence, written review, category, shifts, workout, recovery. | Loading spinner, error, “nothing tracked”, review still loading. Sections hide when empty. |
| Settings | Theme, voice, cloud assistant, wake / home / prep times, permissions link, alarm test, server, export, delete, sign out. | Spinners on the three time wheels, save message, server error, delete error. |
| Permissions | Camera, mic, notifications, exact alarms, full-screen, battery. Green Allowed, red Fix. | Refreshes when opened. Weaker-path sentence when something is off. |
| Wake alarm | Full-screen camera. Hold the code to stop the alarm. Always dark. | Asking for camera, scanning, wrong code, success. |
| Incoming task call | Full-screen call. Answer, reject, speak. Always dark. | Ringing, in call, listening, error from the mic. |

The browser page at the server is a second, simpler Today and Week, plus export and delete. It does not share the phone’s theme file. This audit treats the phone as the product. The browser page should be named in or out before any visual work.

---

## 2. What the visual language is today

Dark is the default. Light exists and most screens follow it through one theme file.

Shared pieces that already agree:

- Page background, card, hairline, text, muted text, gold, green, and a soft red.
- Cards with a 16 radius and a 1-pixel border. Almost no shadow.
- Gold is the main action color. The assistant is a separate blue (`#6d8cff`), repeated by hand in several files.
- Section labels are 11-point, uppercase, wide letter-spacing.
- System font only. No chosen typeface. Times are not tabular, so digits can shift width.
- Icons: the four tabs and the call screen use one icon set. The drag handle is a text character. Most actions are words.

Category color is by area, not by the five routine kinds:

| Area on the card | Color role |
|---|---|
| Skin | Warm |
| Hair | Gold-brown |
| Workout | Teal |
| Study | Blue |
| Health, Office, Extra | Same gray |

Meals, supplements, water, and sleep all fall into Health, so they look the same. Skincare and hair care are distinct. Workout is distinct. That is the gap against “each kind should be recognizable at a glance.”

---

## 3. Inconsistencies

1. **Two accent colors with no rule.** Gold means save, sign in, and the week percent. Blue means the assistant, the mute chip, and “added by AI.” A person cannot tell which color means “do this.”
2. **Light mode is not finished.** The undo bar and the pre-login blank page are hard-coded dark. Sign-in button text is a dark brown that assumes the gold button. Wake and the task call are intentionally always dark, which is fine, but they do not use the theme tokens.
3. **The same button is drawn many times.** “Mark done”, “Save”, “Sign in”, and “Export” are the same gold rectangle, copied with slightly different padding and type size (12.5, 14, and 16).
4. **Loading is always a spinner.** Today, Week’s missing state, Insights, workout, and Settings wheels. Nothing keeps the page shape while data arrives.
5. **Errors are a red sentence.** No retry button on Today or Insights. Week fails silently.
6. **Done and skipped are a faded card plus a word.** Easy to miss when the list is long. The word “done” or “skipped” is the real signal, which is good. The fade makes the title harder to read.
7. **Optional, AI, and Always are three different little tags**, each styled on its own.
8. **Spacing is local.** Page padding is usually 16. Card padding is 15, 16, or 18. Gaps inside a card are whatever that screen chose.
9. **Small type is doing too much work.** Hints at 11 to 12.5, badges at 9.5. On a dark background the dimmer gray (`#5c6472` on `#0a0b0d`) is likely below a comfortable contrast for small text. This was not measured with a contrast tool in this pass. It should be measured before colors are locked.
10. **No screen-reader labels, no stated tap-target size, no reduced-motion path.** Text does use the system font size, which is a start. Several controls add only 8 points of extra touch area. “Mark done” sits in a short row with Skip and Log, so three targets share one line.
11. **Motion is almost absent.** The call and wake screens fade in. Dragging a card adds a shadow. Nothing else moves. That is calm. It also means completing an item does not confirm itself except by the card fading.

---

## 4. Journeys, as they work now

### Morning start

Open the app. If the session is still good, Today appears. The hero says the next item and its time. Under that, warnings, an “edit schedule” button, the assistant box, and then the full list with a paragraph of instructions. The next item is named twice: once in the hero, again as a card further down. For someone half awake, the instruction paragraph and the edit button compete with the one thing they came to do.

The wake alarm is a separate full-screen camera, not part of Today. That split is correct. It should stay dark and simple.

### Mark a task done

On the card: tap a step to tick it, double-tap a step to undo the whole item, or press Mark done. Double-tap is explained only in the hint under the section title. Skip is beside Done. Workout adds a third button, Log. After done, the card fades and an Undo button appears on that card. This works. The gesture is the fragile part.

### “I’m busy, move the day”

Ask AI is always on Today. Speaking or typing “move everything by 2 hours” opens a preview. Confirm applies it. Undo sits in a bar at the bottom for 10 minutes. Mute and “remind me later” apply immediately, which is intended. The preview is the trustworthy moment. Visually it is the same sheet as errors and declined health questions, so the confirm step does not feel like a different, more careful action.

### Log a workout

Today, on a workout card, Log. The next screen asks pain, soreness, and sleep before any set. Each exercise is reps, weight, and effort, with “Why this?” opening the cues. Saving does not change the day’s list. A suggestion, if any, is shown after save. The screen is a form. The next set is not visually “the one thing to fill.”

### View insights

Insights is a long scroll: a big percent, streak, skipped count, a written review with “Working” and “Leaking,” then charts. Empty periods say nothing is tracked yet, and the empty copy mentions “routines you keep dropping.” “Leaking” and that empty line are the two places the tone can feel like a scolding. The numbers themselves are calm.

### Set an alarm

There is no alarm screen. Wake time is a wheel in Settings, saved with home time and prep time. A card below says the alarm follows that time and can be tested with a long-press. Permissions are another screen. Exact-alarm and notification problems also appear as gray italic lines on Today. Three places, one job.

---

## 5. Friction

1. Today asks the person to read before they can act. The next task should be obvious in under a second. The hero tries. The controls under it bury it.
2. The list is a stack of similar cards, not a day you can scan by time. Time is a second line under the title. Category is a small tag. Optional items look like required ones except for a dashed border and a tag.
3. Meals, supplements, and sleep share the Health gray, so the eye cannot group the day.
4. Three ways to change the day live on one screen: drag to swap times, select-then-ask to skip, and the assistant sheet. All are real features. They do not need to be introduced in one paragraph.
5. Undo of a step is a hidden double-tap. Undo of a shift is a different bar. Undo of a finished card is a text button. Same word, three patterns.
6. The assistant sheet is always present, even when the person only wants to tick breakfast.
7. Settings is one long page: appearance, alerts, the assistant switch, three clocks, permissions, a test alarm, the server address, export, and delete. Delete sits near Export. The dangerous action is not visually set apart beyond the words.
8. Week gives a percent and four dots with no sentence. A missed day and a rest day look alike.
9. Workout logging is the slowest daytime screen: check-in, then every exercise, then one save. Fine for the gym. Easy to feel lost about which field is required.
10. Late-night use is the dark theme, which is the stronger of the two themes. Light mode has the same layout with a warm paper background. The undo bar does not follow it.

---

## 6. What a redesign must not change

These are behavior, not decoration. Any visual work leaves them alone unless you approve a change first.

- Sign-in, session, and sign-out.
- The Wednesday-style day itself: times, fixed items (wake, leave, home, bed, tomorrow’s prep), and the stamp card.
- Confirm before a shift or a skip from the assistant. Mute, resume, extend, and “remind me later” stay immediate.
- The 10-minute undo after a confirmed change.
- Health questions are refused. Pain and dose lines stay on the cards.
- Logging a workout does not change the day’s plan. Suggestions stay suggestions.
- Offline: the saved day shows, and ticks wait to send.
- Wake stays a camera hold. Task calls stay Answer / Reject.
- A long mute does not cancel the morning alarm.
- Export and delete, including the typed phrase.

---

## 7. Questions before a direction is chosen

These would change behavior or scope. They are not decided here.

1. Should the browser page be redesigned with the phone, or left as the plain dashboard?
2. May the assistant box be collapsed on Today until tapped, if every current action still exists?
3. May double-tap undo stay as a shortcut but also get a visible control, so the gesture is no longer the only way?
4. Is the tone change on Insights (“Leaking”, “routines you keep dropping”) in scope? That is copy, not logic.

Phase 2 should be one direction, after you answer these. No tokens, no screen edits, until then.
