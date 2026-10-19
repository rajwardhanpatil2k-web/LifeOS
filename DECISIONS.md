# Life OS: decisions

Short records of the key choices in [SPEC.md](SPEC.md), written so you can learn from them. Each has the choice, the reason, and what I rejected. Status is **proposed** until you approve the spec.

---

## Decisions

### D1. Extend the existing app, don't rebuild it
- **Choice:** keep Express, MongoDB, React Native, Redux Toolkit and the native alarm modules. Add modules beside them.
- **Why:** the app already separates a wake alarm from task reminders and already keeps the LLM out of schedule changes. A rewrite would risk those hard-won parts for no gain.
- **Rejected:** a new codebase. A full TypeScript migration (see D3).

### D2. The LLM only produces an intent. Pure code does everything else
- **Choice:** transcript, then a deterministic safety gate, then rules (or the LLM if rules can't decide), then validation, then a pure engine, then preview, then confirm.
- **Why:** a model can be wrong, slow or manipulated by the text it reads. If the only thing it can produce is a validated JSON intent, the worst case is "unknown, try again", never a corrupted schedule.
- **Learning:** put safety in code, not in prompts. Prompts are suggestions, code is a guarantee.

### D3. Stay in JavaScript, add types where they pay off
- **Choice:** JSDoc typedefs plus `checkJs` with `tsc --noEmit`, and `zod` for runtime validation. (You chose JavaScript.)
- **Why:** types catch mistakes in the engine and data shapes without a build step or rewrite. `zod` matters more than types here because LLM output and request bodies are only checked at runtime.
- **Rejected:** gradual TypeScript migration (more churn than value for a one-person app).

### D4. The scheduling engine is pure
- **Choice:** no database, no `Date.now()`, no randomness inside the engine. Everything comes in as arguments.
- **Why:** time bugs (midnight, DST, overlaps) only show up in odd situations. Pure functions let me test those situations on demand. The current shift code wraps 22:30 + 2 h to 00:30 on the same day, which is exactly the bug class this prevents.

### D5. Instants plus an IANA timezone, not "HH:MM" strings
- **Choice:** convert `HH:MM` to absolute instants at the edges, using the user's timezone.
- **Why:** strings can't express "this hour doesn't exist today" (DST). India has no DST, so nothing breaks now, but the cost of being correct is small and the tests prove it.

### D6. Preview, confirm and undo for shift, skip and reschedule. Not for mute
- **Choice:** schedule changes show a preview bound to the plan revision, then apply on confirm, with a 10-minute undo from a ledger. "Mute alarms" stays instant.
- **Why:** moving the day is hard to reverse mentally, so it needs a look first. Muting is the opposite: you say it because you need quiet *now*, and "I'm back" already undoes it.

### D7. Original time is never overwritten
- **Choice:** `plannedAt` is immutable, `scheduledAt` is current, and a ledger stores before and after.
- **Why:** insights need "planned vs shifted vs actual". Overwriting the plan destroys the most useful signal.

### D8. Wake stays at 06:00, bedtime is computed as next wake minus 8 h
- **Choice:** plan.md's 06:45 wake can't coexist with its own 06:45 banana and 07:00 gym start once a 15-minute trip is real. I kept your existing 06:00 wake. Bedtime is derived per day (22:00, 22:45 before Saturday, 23:30 Saturday).
- **Why:** you gave "8 hours" as the rule, not a clock time, so the rule should drive the clock.
- **Resolved (Q-A):** Wed-Fri gym blocks are 60 min so you can leave at 09:00. Mon, Tue and Sat keep the full 90 min.

### D16. Day types and office exit
- **Choice:** Mon and Tue are WFH, Wed-Fri office, Sat and Sun off (a per-weekday `dayTypes` map). On office days you leave work around 18:00 and eat dinner out, so the dinner reminder fires near 18:30 and the evening routine is anchored to your home time, not to dinner.
- **Why:** this is your stated week. Keeping day type as data means a changed week is a setting, not a code change.
- **Open:** dinner time and home time on office days (SPEC Q-C2). Placeholders 18:30 and 19:30 are marked in the table.

### D17. Stamping card content (your values)
- **Choice:** Wednesday night: shampoo and towel-dry first, then stamp with a 0.5 mm needle, one press per spot. No oils, serums or sprays that night.
- **Why:** these are the values you gave. I did not add numbers of my own. The hygiene and confirm-with-a-professional wording is still safety item R18/R19 and needs your explicit yes.

### D9. Study stays, and is flexible
- **Choice:** keep the study blocks and make them the first thing compressed or skipped when the evening is tight.
- **Why:** plan.md doesn't mention study but you do it. Sleep and skincare are protected, study is the right thing to give way.

### D10. Static login: one account in the DB, opaque tokens
- **Choice:** scrypt-hashed credential in MongoDB, created once at first boot, no sign-up route. Login returns a random token, stored hashed with a sliding 90-day expiry. Tokens live in `expo-secure-store`.
- **Why:** it meets "static login kept in the DB" while fixing the real problem: the API is currently open to anyone with the URL. Opaque tokens beat JWT here because delete-all and password change must revoke instantly.
- **Rejected:** JWT (can't be revoked without extra state), storing the token in plain AsyncStorage (not encrypted), full sign-in system (overkill for one user).
- **Trade-off:** `expo-secure-store` is a native module, so the next APK must be rebuilt anyway.

### D11. Learn mode content is curated, not generated
- **Choice:** "Why this?", form cues and mistakes are static text in the DB, written once and reviewed.
- **Why:** a confidently wrong model answer about lifting or skin care is a risk with no upside. A card you can read and verify is the safer, cheaper tool.

### D12. Progression is a suggestion and a pure function
- **Choice:** double progression with the smallest step, "hold" when effort is high or sessions were missed, and never more than one step per session.
- **Why:** conservative increases match the goal of avoiding injury. A pure function can be unit-tested with fake history.

### D13. Pain, injuries and supplements are never answered by the app
- **Choice:** a code-level gate before the LLM declines these, makes no schedule change, and logs only the category.
- **Why:** this is a hard product rule, and a gate that doesn't depend on the model is the only version that always holds.

### D14. Offline = cached plan + outbox + rolling horizon
- **Choice:** cache the plan, queue mutations with client ids, and arm the next 3 days of reminders natively.
- **Why:** today reminders exist only for days the app has been opened, so "app killed overnight" means no morning task calls. Idempotent client ids make replays safe.

### D15. Nothing ships to the live server before the demo
- **Choice:** all Phase 2 work lives on a branch. The tagged current build is the demo build.
- **Why:** auth (M1) will lock out the already installed APK, and the seed currently overwrites templates when `SEED_ON_START=true`. Both are fine after the demo and dangerous before it.

---

### D18. Safety triage: adopt guards, skip anything that adds risk
- **Choice:** you said to skip what I judge risky and decide the rest. I adopted every item that only adds a guard (R1-R11, R18, R27), as options or suggestions, never as silent swaps. I did not adopt R14 (Sunday supplements) or R19 (dilution numbers). The Thursday rosemary oil is paused until a dermatologist confirms the gap after stamping. Full table in SPEC 9.5.
- **Why:** the guard items reduce the chance of injury and cost nothing. The two I skipped would need numbers or timing I would be guessing, and "do not guess on safety" overrides convenience.
- **Rejected:** adopting everything (it would invent doses), and adopting nothing (it would leave a beginner with no stop-if-pain prompt, no effort target and no deload).

### D19. Office-day evening is built around 20:30 home time
- **Choice:** PM skin and hair at 21:00 on Wed-Fri. Study shrinks to 20 optional minutes on Wed and Thu and 45 on Fri. Sleep is never cut.
- **Why:** you get home at 20:30, and sleep and skincare are protected while study is the flexible item (D9).

## Approval tracker

**Your answers (taken as approved)**

| Item | Status |
|---|---|
| Q1 merge both | Approved |
| Q2 gym 15 min each way, 90 min workout | Approved |
| Q3 8 h sleep | Approved |
| Q15 stamping confirmed | Approved: shampoo first, 0.5 mm, one press per spot |
| Q-A Wed-Fri gym | Approved: 60 min (option A) |
| Q5 / WFH | Approved: Sat off, Mon-Tue WFH |
| Q-C office exit | Approved: leave office about 18:00, dinner out. Home time pending (Q-C2) |
| Q18 JavaScript | Approved |
| Q19 UI per my judgment | Approved |
| Q21 static login in DB | Approved |
| R22 merge, don't replace | Approved by Q1 |
| R28 authentication | Approved by Q21. Export, delete-all and encryption check still part of M9. |

**Delegated to me on 2026-10-19:** "take best decision for remaining". All items below are now decided (D18, D19). Revisit any by telling me.

**Non-safety recommendations: ADOPTED**

R12 split amla and banana, R13 dinner reminder, R15 hydration nudges, R16 Saturday pre-class snack, R17 weekend sunscreen and reapply, R20 remove face jojoba and T-bar, R21 nightly satin pillowcase, R23 meal and supplement categories, R24 dependencies, R25 shift engine fixes, R26 shift ledger for insights, R29 no calorie or macro fields, R30 demo freeze.

**Safety recommendations (S), decided under your "skip what is risky" rule**

- **Adopted (guards, options or suggestions only):** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R18, R27.
- **Not adopted:** R14 Sunday supplements, R19 dilution values (only your 0.5 mm, one press per spot is shown).
- **Held back pending a dermatologist:** Thursday rosemary oil after stamping.
- **Defaults for the open questions:** no iOS (Q20); Cult.fit optional, no time until you give it (Q4); dinner text generic (Q6); no starting weights, the logger starts empty (Q11-Q12); banana and amla split per plan.md (Q8-Q10); the app asks about coaching and joint pain in-app (Q13-Q14).
