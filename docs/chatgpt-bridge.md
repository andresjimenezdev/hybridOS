# ChatGPT bridge

HybridOS uses one existing Google Spreadsheet as a free interoperability layer. Supabase remains the only source of truth. The spreadsheet ID is `1XGrFyCW-fS5-rRiBMsjtWR8f4peHz_gu05Z4Qx3URH8`.

```text
ChatGPT → AI_PLAN → HybridOS → Supabase
Supabase → AI_DATA / AI_HEALTH / AI_WEEKLY → ChatGPT
```

There is no OpenAI API, chatbot or LLM call inside HybridOS.

## Ownership

- `AI_PLAN` is owned by ChatGPT/the planning workflow. It contains prescriptions only.
- Completed sessions, performed sets, health and measurements are owned by HybridOS/Supabase.
- `AI_DATA`, `AI_HEALTH` and `AI_WEEKLY` are replaceable read projections generated from Supabase.
- A planned row is never evidence that an activity was performed.
- Changes to planning never rewrite completed history.

## Canonical formats

| Concept | Format |
| --- | --- |
| Date / week | `YYYY-MM-DD` |
| Weight | decimal kilograms |
| Distance | decimal kilometres |
| Duration | integer seconds |
| Pace | integer seconds per kilometre |
| Heart rate | integer bpm |
| RIR / RPE | number or empty |
| External IDs | stable lowercase keys, independent of Supabase UUIDs |

Ranges use `min-max`, for example `6-8` reps or `2-3` RIR. A single number is interpreted as a closed range. Duration targets use an explicit suffix, for example `30-45 s`; they are stored as seconds and never converted into repetitions. UI labels such as `6:50/km` must be converted to `410` seconds/km before writing.

## AI_PLAN

ChatGPT may write the following exact columns, in this order:

| Column | Type | Rule |
| --- | --- | --- |
| `plan_id` | string | Stable external plan identifier |
| `week_start` | date | Monday in `YYYY-MM-DD` |
| `date` | date | Required session date |
| `session_key` | string | Required, stable and unique per prescribed session |
| `session_type` | enum | `strength`, `running`, `cycling`, `cardio`, `mobility`, `rest` |
| `session_name` | string | Required display name |
| `exercise_order` | integer | Strength only |
| `exercise_name` | string | Human-readable fallback |
| `exercise_key` | string | Preferred stable exercise identifier |
| `sets_target` | integer | Strength only |
| `reps_target` | range | Example `6-8` |
| `rir_target` | range | Example `2-3` |
| `rest_seconds` | integer | Strength rest prescription |
| `duration_target_seconds` | integer | Cardio or session duration |
| `distance_target_km` | decimal | Optional cardio distance |
| `pace_min_sec_km` | integer | Faster/lower boundary in seconds/km |
| `pace_max_sec_km` | integer | Slower/upper boundary in seconds/km |
| `rpe_target` | range | Example `3-4` |
| `talk_test_target` | string | Example `conversational` |
| `notes` | string | Prescription notes only |
| `status` | enum | `planned`, `cancelled`, `skipped`; result completion is owned by HybridOS |
| `updated_at` | ISO timestamp | Used for idempotency and conflict detection |

Rows sharing `session_key` form one session. Strength exercises occupy separate rows. Running, cardio, mobility and rest normally use one row.

### Exercise resolution

1. Exact `exercise_key` match.
2. Unique normalized `exercise_name` match (case, accents and punctuation ignored).
3. If no reliable unique match exists, the session is stored as `needs_review`.

AI_PLAN import never silently creates an unknown exercise. The user must resolve it in the exercise library.

### Updates and conflicts

- `planned`: a newer `updated_at` updates the plan and its `planned_session_exercises` snapshot normally.
- `in_progress`: the new payload is held as `update_available`; the user explicitly accepts or rejects it.
- `completed`: ignored by the importer; historical performance is immutable.
- Re-importing identical `session_key` and `updated_at` values is a no-op.
- Ten identical imports produce the same sessions and zero duplicates.

## AI_DATA

Read-only projection of performed training:

```text
result_id, date, completed_at, activity_type, session_key, session_name,
exercise_name, exercise_key, set_number, weight_kg, reps, rir, sensation,
pain, notes, distance_km, duration_seconds, pace_seconds_km, avg_hr,
max_hr, rpe, talk_test
```

Strength exports one row per completed set and uses `strength:<set-id>` as stable `result_id`. Cardio exports one row per performed session and uses `cardio:<session-id>`. A repeated full projection replaces the integration table, so stable results never duplicate. Blank cells mean the metric is not applicable or was not recorded; a missing value is never exported as zero.

## Internal relational snapshot

`workout_templates` remains the editable reusable definition. Each imported strength `planned_session` owns an immutable-at-start snapshot in `planned_session_exercises`. Starting a planned workout copies that snapshot into `strength_exercise_logs`; editing the template later cannot rewrite the plan instance or completed history. Repetitions and duration targets have separate numeric fields.

During the initial migration only, unlinked legacy results may be reconciled by unique `date + type + name` for strength and unique `date + type` for cardio. Once linked, `planned_session_id` and `session_key` are the only relationship identifiers. No historical session is created by the planning import.

## AI_HEALTH

Read-only projection of health and body measurements, merged by date:

```text
date, weight_kg, body_fat_estimate_pct, resting_hr, vo2max_estimate, steps,
bmi, lean_body_mass_kg, active_calories, resting_calories, total_calories, sleep_minutes, waist_cm, chest_cm, arm_cm,
thigh_cm, hips_cm
```

Body fat and VO₂max are estimates, not clinical measurements.

## AI_WEEKLY

Read-only weekly review projection:

```text
week_start, strength_planned, strength_completed, cardio_planned,
cardio_completed, running_sessions, running_km, running_minutes,
average_weight_kg, latest_waist_cm, resting_hr_average, vo2max_latest
```

Cancelled and skipped sessions are excluded from adherence denominators. Completion numerators come only from linked real `strength_sessions` and `cardio_sessions`, never from the incoming AI_PLAN status. Mobility is not cardio. No synthetic health, recovery or fitness scores are generated.

## Synchronization behaviour

- AI_PLAN is checked on Today at most once every five minutes per browser session, and manually on request.
- Results are exported after a completed training session, a saved health/measurement entry or an Apple Health import.
- Manual and Apple Health records from the same date are merged in `AI_HEALTH`; a missing value never erases a value provided by the other source.
- Exports use low-volume batch replacement of only the three `AI_*` projections.
- Google failure never rolls back Supabase. It creates a failed sync log and exposes a retry in Settings.
- Google credentials are used server-side only.

## Errors

- Invalid required plan fields: row reported in the inbound sync log.
- Unknown exercise: `needs_review`, without exercise creation.
- Active-session change: `update_available`, never silently applied.
- Google unavailable: Supabase remains operational; outbound sync stays pending/failed until retry.
- Supabase unavailable: the UI must not claim persistence; active strength drafts remain in local storage.

## Legacy migration

Run a dry run first:

```bash
npm run import:legacy
```

Apply only after reviewing counts:

```bash
npm run import:legacy -- --apply
```

The script reads only `Fuerza`, `Running`, `Salud` and `Medidas`. It never reads or deletes `Dashboard`, `AI_PLAN`, `AI_DATA`, `AI_HEALTH`, `AI_WEEKLY` or legacy backup tabs. Stable external IDs and database unique constraints make repeated runs idempotent.
