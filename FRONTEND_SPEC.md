# Hamroh Admin Panel — Frontend Specification

Everything below describes the **existing, working backend**. Build the frontend against it exactly as written; nothing here is aspirational.

- Base URL: `{API_URL}/api`
- Swagger (live contract): `{API_URL}/api/docs`
- Auth: `Authorization: Bearer <accessToken>` on every request except `POST /api/auth/login`
- All list endpoints return `{ data: T[], meta: { total, page, limit, totalPages } }`
- All dates in payloads are `YYYY-MM-DD` (date-only) or full ISO strings (timestamps)

---

## 1. Core concept: everything is scoped by branch

This is the single most important rule in the product. Get it wrong and the whole app is wrong.

- A **Branch** is a physical office tied to one of the 14 **regions of Uzbekistan**.
- **SUPER_ADMIN** belongs to no branch and sees *everything*. Only they can create branches and admins.
- **ADMIN** belongs to exactly one branch and sees *only that branch* — its people, activities, trainers, attendance, reports.
- **TRAINER** belongs to one branch, runs activities and records attendance there.

The backend enforces this on every endpoint. The frontend must **mirror** it in the UI:

| | SUPER_ADMIN | ADMIN | TRAINER |
|---|---|---|---|
| Branch selector visible | ✅ (incl. "All branches") | ❌ (own branch shown as a static chip) | ❌ |
| Branch field on create forms | ✅ required dropdown | ❌ hidden, filled automatically | ❌ |
| Branches section | full CRUD | read-only, own branch | hidden |
| Staff section | create admins + trainers | create trainers only | hidden |
| Users (participants) | all branches | own branch | read-only, own branch |
| Activities | all branches | own branch | read-only, own branch |
| Attendance | ✅ | ✅ | ✅ |
| Announcements | create + assign todos | own branch + global; may only change status of todos assigned to them | read-only |
| Reports | all branches | own branch | hidden |

**Never send `branchId` from an ADMIN or TRAINER client.** The server derives it from the token and rejects mismatches with `403`.

---

## 2. Tech stack (already chosen in the README)

React + TypeScript, Material UI (MUI), TanStack Query, Axios, React Router, React Hook Form.

Suggested structure:

```
src/
  api/            axios instance + one file per resource
  auth/           AuthProvider, useAuth, ProtectedRoute, RoleGate
  components/     shared table, page header, empty state, confirm dialog
  features/
    dashboard/    summary cards + calendar
    branches/
    staff/
    users/        (participants)
    activities/
    attendance/
    announcements/
    reports/
  layouts/        AppShell with sidebar
```

Axios interceptor: attach the token, and on `401` clear the session and redirect to `/login`.

---

## 3. Authentication

There is **no email anywhere in this product** and **no registration screen**. Staff sign in with a username.

### `POST /api/auth/login`
```json
{ "username": "admin_samarqand", "password": "Admin123!" }
```
Response:
```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "uuid",
    "username": "admin_samarqand",
    "fullName": "Aliyev Sardor Baxtiyorovich",
    "role": "ADMIN",
    "branch": { "id": "uuid", "name": "Samarqand filiali", "region": "SAMARKAND" }
  }
}
```
`branch` is `null` for `SUPER_ADMIN`.

### `GET /api/auth/me`
Returns the same profile shape (plus `phone`, `isActive`, `lastLogin`, `createdAt`). Call it on app boot to rehydrate the session from a stored token.

Store `accessToken` and expose `user.role` and `user.branch` through an `AuthProvider`. Every sidebar item and action button reads from that context.

---

## 4. Sidebar

```
📊  Dashboard          /                     all roles
👥  Users              /users                all roles (write: SUPER_ADMIN, ADMIN)
🏃  Activities         /activities           all roles (write: SUPER_ADMIN, ADMIN)
✅  Attendance         /attendance           all roles
🏢  Branches           /branches             SUPER_ADMIN (ADMIN sees own, read-only)
🧑‍💼  Staff & Trainers   /staff                SUPER_ADMIN, ADMIN
📣  Announcements      /announcements        all roles
📈  Reports            /reports              SUPER_ADMIN, ADMIN
```

Header, on every page: current user's full name, role badge, and — for ADMIN/TRAINER — a **static chip showing their branch** ("Samarqand filiali · SAMARKAND"). For SUPER_ADMIN, that chip is instead a **branch selector** (`All branches` + one entry per branch) whose value is passed as `?branchId=` to every list request.

---

## 5. Dashboard  (`/`)

Two blocks: **stat cards** on top, a **calendar** filling the rest of the page.

### 5.1 Stat cards — `GET /api/dashboard/summary?branchId=`

```json
{
  "scope": "BRANCH",
  "branch": { "id": "uuid", "name": "Samarqand filiali", "region": "SAMARKAND", "address": "...", "isActive": true },
  "date": "2026-08-09",
  "participants": { "total": 230, "active": 228 },
  "activities": { "active": 2, "scheduledToday": 1 },
  "staff": { "admins": 1, "trainers": 2 },
  "attendanceToday": 12,
  "openTodos": 3
}
```

`scope` is `"ALL_BRANCHES"` for a super admin with no branch selected (then `branch` is `null` — show "Barcha filiallar" instead of a branch name).

Cards: **Ishtirokchilar** (`participants.total`, subtitle `active` faol) · **Faol faoliyatlar** (`activities.active`, subtitle `scheduledToday` bugun) · **Trenerlar** (`staff.trainers`) · **Bugungi davomat** (`attendanceToday`) · **Ochiq vazifalar** (`openTodos`, links to `/announcements?tab=todos`).

### 5.2 Calendar — the Apple Calendar experience

This is the centrepiece of the dashboard. An ADMIN opening the dashboard sees **their own branch's activity calendar**; a SUPER_ADMIN sees the whole network, or one branch via the header selector.

**Month grid — `GET /api/dashboard/calendar?from=2026-09-01&to=2026-09-30&branchId=&trainerId=`**

Omit `from`/`to` and the backend defaults to the current calendar month. Window is capped at one year.

```json
{
  "from": "2026-09-01",
  "to": "2026-09-30",
  "totalSessions": 26,
  "days": [
    {
      "date": "2026-09-02",
      "weekday": 3,
      "sessionCount": 2,
      "sessions": [
        {
          "activityId": "uuid",
          "title": "Ertalabki mashgʻulot",
          "startTime": "12:00",
          "endTime": "13:30",
          "durationMinutes": 90,
          "capacity": 30,
          "branch": { "id": "uuid", "name": "Samarqand filiali", "region": "SAMARKAND" },
          "trainer": { "id": "uuid", "fullName": "Qodirov Jasur Anvarovich" },
          "attendedCount": 12
        }
      ]
    }
  ]
}
```

Notes that matter for rendering:
- `weekday` is **ISO**: `1 = Monday … 7 = Sunday`. The grid must start on Monday.
- `days` contains **only dates that have sessions**. Days with nothing scheduled are absent from the array — render them as empty cells, do not treat a missing key as an error.
- `sessions` inside a day are already **sorted by start time**.
- `endTime` is precomputed — do not recompute it on the client.

**Behaviour (mirror Apple Calendar):**
1. Month grid, Monday-first, current day ring-highlighted, days outside the month dimmed.
2. Each day cell shows up to 3 session "pills" (`12:00 Ertalabki mashgʻulot`), then `+N ko'proq`. Colour-code the pill by activity id (stable hash → palette) so the same activity keeps one colour all month.
3. `←` / `→` arrows and a `Bugun` button move the window; refetch with the new `from`/`to`. Keep the previous month's data on screen while loading (TanStack Query `placeholderData`) so the grid does not flash.
4. **Clicking a day opens a side panel / sheet** listing that day's sessions in a timeline: start–end time, title, trainer, branch (super admin only), and `attendedCount / capacity` as a small progress bar.
5. Each session row in the panel has two actions: **"Davomat belgilash"** → `/attendance/{activityId}?date={date}`, and **"Faoliyatni ochish"** → `/activities/{activityId}`.
6. A `Trener` filter dropdown above the calendar (`GET /api/users/trainers`) passes `trainerId` — useful for checking a trainer's load at a glance.

**Day detail — `GET /api/dashboard/calendar/:date`** (e.g. `/api/dashboard/calendar/2026-09-02?branchId=`)

Returns `{ date, weekday, sessionCount, sessions: [...] }` with the same session shape. Use this for the day panel if you prefer a dedicated fetch, or for a standalone day view; the month response already contains everything, so a client-side lookup is also fine.

Weekday labels: `['Dush','Sesh','Chor','Pay','Jum','Shan','Yak']` — index with `weekday - 1`.

---

## 6. Users section  (`/users`) — the participants

This is the "Users" the client talks about: the ~400 people served by the branches. They **do not log in** and have **no email**.

### List — `GET /api/participants`

Query: `page`, `limit` (max 100), `search`, `order` (`asc|desc`), `sortBy` (`lastName|firstName|birthDate|createdAt`, default `createdAt`), `branchId` (super admin), `region` (super admin), `activityId`, `isActive`.

Each row already carries a **row number** and derived fields:

```json
{
  "data": [
    {
      "no": 1,
      "id": "uuid",
      "firstName": "Dilnoza",
      "lastName": "Karimova",
      "middleName": "Baxtiyorovna",
      "fullName": "Karimova Dilnoza Baxtiyorovna",
      "birthDate": "2000-05-14T00:00:00.000Z",
      "age": 26,
      "phone": "+998901234567",
      "address": "Samarqand sh., Registon koʻchasi 12",
      "isActive": true,
      "createdAt": "2026-08-09T10:00:00.000Z",
      "branch": { "id": "uuid", "name": "Samarqand filiali", "region": "SAMARKAND" },
      "createdBy": { "id": "uuid", "username": "admin_samarqand", "fullName": "..." },
      "_count": { "attendances": 4 }
    }
  ],
  "meta": { "total": 230, "page": 1, "limit": 10, "totalPages": 23 }
}
```

Table columns: `№` (use `no`, not the array index) · F.I.Sh (`fullName`) · Yosh (`age`) · Tug'ilgan sana · Telefon · Manzil · Filial (super admin only) · Tashriflar (`_count.attendances`) · Holati · actions.

Sortable headers must set `sortBy` + `order`, **not** sort client-side — the row numbers come from the server and only stay correct if the server does the ordering.

### Create — `POST /api/participants`

Sidebar has a **"Foydalanuvchi qo'shish"** button on this page. Fields:

| Field | Required | Notes |
|---|---|---|
| `lastName` | ✅ | Familiya, 2–60 |
| `firstName` | ✅ | Ism, 2–60 |
| `middleName` | ➖ | Sharifi (otchestvo), ≤60 |
| `birthDate` | ✅ | `YYYY-MM-DD`, full day/month/year. Show the computed age live next to the picker. |
| `phone` | ✅ | 7–30 chars |
| `address` | ✅ | 3–255 |
| `branchId` | conditional | **SUPER_ADMIN: required dropdown. ADMIN: omit the field entirely** — the server assigns the admin's own branch. |
| `notes` | ➖ | free text |
| `isActive` | ➖ | default `true` |

There is **no role field and no email field**. Do not add them.

### Detail / update / delete
- `GET /api/participants/:id` — same shape plus `attendances` (last 50, newest first, each with its `activity`). Render as an attendance history timeline.
- `PATCH /api/participants/:id` — same fields, all optional. `branchId` is accepted **only for SUPER_ADMIN** (moving someone between branches); hide that control for admins.
- `DELETE /api/participants/:id` — confirm dialog.

---

## 7. Activities  (`/activities`)

An activity is a **recurring weekly schedule**, created **empty** — no participants are attached at creation time. People are linked afterwards, on the day, through Attendance.

### Create / edit — `POST /api/activities`, `PATCH /api/activities/:id`

```json
{
  "title": "Ertalabki gimnastika",
  "description": "…",
  "daysOfWeek": [1, 3, 5],
  "startTime": "12:00",
  "durationMinutes": 90,
  "startDate": "2026-09-01",
  "endDate": "2026-12-31",
  "capacity": 25,
  "trainerId": "uuid",
  "branchId": "uuid"
}
```

Form design:
- `daysOfWeek` — a **7-button toggle group** (Dush…Yak) mapping to `1…7`. Add quick presets: "Toq kunlar" `[1,3,5]`, "Juft kunlar" `[2,4,6]`, "Har kuni" `[1..7]`. At least one day required.
- `startTime` — 24-hour `HH:mm` time picker. The API rejects anything else.
- `durationMinutes` — number, 5–1440. Show the resulting end time under the field.
- `endDate` — optional; empty means open-ended. Label it "Muddatsiz" when blank.
- `trainerId` — dropdown from `GET /api/users/trainers` (already branch-filtered for admins).
- `branchId` — **super admin only**, required for them; omit for admins. Not editable after creation (`PATCH` ignores it).

**Trainer conflict — the error you must handle well.** One trainer may run many activities, but never two that share a weekday *and* overlap in time while both schedules are live. Violating that returns **`409 Conflict`**:

> `Qodirov Jasur Anvarovich already runs "Kechki guruh" at 12:30 on weekday(s) 1, 3. A trainer cannot lead two activities at the same time.`

Surface this inline on the trainer/schedule fields, not as a generic toast. Ideally pre-empt it: when a trainer is picked, call `GET /api/activities?trainerId=…` and grey out clashing day/time combinations.

### List — `GET /api/activities`

Query: `page`, `limit`, `search`, `order`, `branchId`, `trainerId`, `dayOfWeek` (1–7), `date` (`YYYY-MM-DD` — everything running on that exact date), `isActive`.

Columns: Nomi · Jadval (render `daysOfWeek` as day chips) · Vaqt (`startTime` + duration) · Trener · Filial (super admin) · Davomat soni (`_count.attendances`) · Holati.

### Schedule expansion — `GET /api/activities/:id/occurrences?from=&to=`

```json
{ "activityId": "uuid", "title": "…", "startTime": "12:00", "durationMinutes": 90,
  "dates": ["2026-09-01", "2026-09-03", "2026-09-05"] }
```

Defaults to 30 days from the activity's start. Use it on the activity detail page to show "next sessions", and to populate the date picker on the attendance screen so only real session dates are selectable.

---

## 8. Attendance  (`/attendance`)

The screen where people get attached to an activity **on the day it happens**.

### Marking — `POST /api/attendance/activities/:activityId`

```json
{
  "date": "2026-09-02",
  "entries": [
    { "participantId": "uuid", "status": "PRESENT" },
    { "participantId": "uuid", "status": "LATE", "notes": "20 daqiqa kechikdi" }
  ]
}
```

`status` ∈ `PRESENT | ABSENT | LATE | EXCUSED`, default `PRESENT`. The call is **idempotent** — re-sending a participant updates them rather than failing, so the screen can simply save the whole sheet on every change.

Server-side validations to surface as field errors:
- the date must fall on one of the activity's scheduled weekdays and inside its start/end window → `400`
- every participant must belong to the activity's branch → `400`
- the session capacity must not be exceeded → `400`

Response is the full session sheet (same shape as the GET below), so use it to refresh the table in place.

**UI:** pick activity → pick date (restricted to `occurrences`) → a two-pane picker: left, the branch's participants (searchable, from `GET /api/participants`), right, those already marked. Each marked row has a status segmented control. Header shows `12 / 30` against capacity.

### Session sheet — `GET /api/attendance/activities/:activityId?date=2026-09-02`

```json
{
  "activity": { "id": "uuid", "title": "…", "startTime": "12:00", "durationMinutes": 90, "capacity": 30 },
  "date": "2026-09-02",
  "total": 12,
  "records": [ { "id": "uuid", "status": "PRESENT", "notes": null, "participant": { … }, "recordedBy": { … } } ]
}
```

### History — `GET /api/attendance`
Query: `page`, `limit`, `order`, `activityId`, `participantId`, `branchId`, `status`, `from`, `to`. Use for the "Davomat tarixi" tab and for a participant's profile.

### `DELETE /api/attendance/:id` — remove one mistaken record.

---

## 9. Branches  (`/branches`) — super admin's control room

- `GET /api/branches` — list. An ADMIN calling this gets **only their own branch**; render it as a read-only info card rather than a table.
- `POST /api/branches` — `{ name, region, address?, phone?, isActive? }`. `region` is a dropdown of the 14 values in §12.
- `GET /api/branches/:id` — includes `staff[]` (id, username, fullName, role, phone) and `_count: { participants, activities, staff }`.
- `PATCH /api/branches/:id`
- **`POST /api/branches/:id/staff`** — `{ "userIds": ["uuid", …] }`. This is the "attach an admin to a branch" action. The moment it succeeds, those admins control that branch's users; their next request already reflects it (the token is re-validated against the database on every call, so **no re-login is needed**).
- `DELETE /api/branches/:id/staff/:userId` — detach.
- `DELETE /api/branches/:id` — refuses with `409` while the branch still has participants or activities. Show that message and suggest deactivating instead.

Branch detail page layout: info header (name, region badge, address, phone) · three stat tiles from `_count` · a staff table with an **"Admin biriktirish"** button opening a multi-select of unassigned admins (`GET /api/users?role=ADMIN`).

---

## 10. Staff & Trainers  (`/staff`)

Accounts that log in.

- `GET /api/users` — query `page`, `limit`, `search`, `order`, `role`, `branchId`, `isActive`. Admins see only their branch.
- `GET /api/users/trainers?branchId=` — convenience list for activity forms.
- `POST /api/users`:

```json
{
  "username": "admin_samarqand",
  "password": "Strong123!",
  "fullName": "Aliyev Sardor Baxtiyorovich",
  "phone": "+998901234567",
  "role": "ADMIN",
  "branchId": "uuid"
}
```

Rules the UI must reflect:
- `username` — lowercase letters, digits, `.`, `-`, `_` only; 3–60. Validate client-side with the same regex and show a live "band" check on blur (`409` if taken).
- **SUPER_ADMIN** may create `ADMIN` or `TRAINER`, and must choose `branchId`.
- **ADMIN** may create **only `TRAINER`**, and must not send `branchId` — the server uses their own branch. Hide the role and branch selectors entirely for admins; the form is then just username / password / full name / phone.
- Nobody can create another `SUPER_ADMIN` through the API (`403`) — do not offer it.

- `PATCH /api/users/:id` — `fullName`, `phone`, `role`, `isActive`, `password`. **`username` and `branchId` are not editable here**; branch changes go through `POST /api/branches/:id/staff`.
- `DELETE /api/users/:id` — SUPER_ADMIN only; you cannot delete yourself or a super admin.

---

## 11. Announcements & Todo lists  (`/announcements`)

Two tabs: **E'lonlar** and **Mening vazifalarim**.

### Announcements
- `GET /api/announcements` — `page`, `limit`, `search`, `order`, `status` (`DRAFT|PUBLISHED`), `branchId`.
- `POST /api/announcements`:

```json
{
  "title": "Yangi oʻquv mavsumiga tayyorgarlik",
  "body": "…",
  "status": "PUBLISHED",
  "branchId": null,
  "todos": [
    { "title": "Roʻyxatni tekshirish", "description": "…", "assigneeId": "uuid", "dueDate": "2026-09-20T00:00:00.000Z" }
  ]
}
```

- `branchId: null` (super admin only) means **every branch** — label it "Barcha filiallar". An admin's announcement is always pinned to their own branch.
- Admins see global announcements plus their own branch's.
- `GET /api/announcements/:id` returns `todos[]` sorted by `position`, each with its `assignee` (including the assignee's branch).
- `PATCH /api/announcements/:id`, `DELETE /api/announcements/:id`.

### Todos
- `POST /api/announcements/:id/todos` — append one item.
- `PATCH /api/announcements/todos/:todoId` — **note the path shape**: `todos` sits directly under `/announcements`, not under the announcement id.
- `DELETE /api/announcements/todos/:todoId` — super admin only.
- `GET /api/announcements/todos?status=&assigneeId=&mine=true` — the flat work queue.

Permission split to render:
- **SUPER_ADMIN** — creates todos, assigns each one to a branch **ADMIN** (`assigneeId`; only `ADMIN` accounts are accepted), edits everything, deletes.
- **ADMIN** — sees the todos assigned to them and may change **only `status`** (`PENDING → IN_PROGRESS → DONE`). Any other edited field returns `403`. So render their view as a checklist with a status control and everything else read-only.

`GET /api/announcements/todos?mine=true` powers the "Ochiq vazifalar" card on the dashboard.

---

## 12. Reports  (`/reports`)

Two report types × three periods, exported as **Excel (.xlsx)**.

| Endpoint | Report |
|---|---|
| `GET /api/reports/participants?period=…` | Ishtirokchilar bo'yicha |
| `GET /api/reports/activities?period=…` | Faoliyatlar bo'yicha |

`period` ∈ `month` (oylik) · `quarter` (3 oylik) · `year` (yillik). Optional `branchId` for super admins.

- `format=json` → the same numbers as JSON. **Use this to render an on-screen preview table.**
- `format=xlsx` (default) → binary download. Request with `responseType: 'blob'`, then save using the filename from `Content-Disposition` (e.g. `ishtirokchilar-month-2026-08-09.xlsx`).

The participants workbook has two sheets — the detail list and a **per-branch summary**. The activities workbook reports scheduled vs. held sessions, total visits, unique participants and average attendance.

UI: two cards, each with a period segmented control (`Oylik | 3 oylik | Yillik`), a live JSON preview table, and an **"Excel yuklab olish"** button.

---

## 13. Enums & constants

```ts
export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'TRAINER'] as const;

export const REGIONS = [
  'KARAKALPAKSTAN', 'ANDIJAN', 'BUKHARA', 'FERGANA', 'JIZZAKH',
  'KASHKADARYA', 'KHOREZM', 'NAMANGAN', 'NAVOIY', 'SAMARKAND',
  'SIRDARYA', 'SURKHANDARYA', 'TASHKENT_REGION', 'TASHKENT_CITY',
] as const;

export const REGION_LABELS: Record<(typeof REGIONS)[number], string> = {
  KARAKALPAKSTAN: 'Qoraqalpogʻiston Respublikasi',
  ANDIJAN: 'Andijon viloyati',
  BUKHARA: 'Buxoro viloyati',
  FERGANA: 'Fargʻona viloyati',
  JIZZAKH: 'Jizzax viloyati',
  KASHKADARYA: 'Qashqadaryo viloyati',
  KHOREZM: 'Xorazm viloyati',
  NAMANGAN: 'Namangan viloyati',
  NAVOIY: 'Navoiy viloyati',
  SAMARKAND: 'Samarqand viloyati',
  SIRDARYA: 'Sirdaryo viloyati',
  SURKHANDARYA: 'Surxondaryo viloyati',
  TASHKENT_REGION: 'Toshkent viloyati',
  TASHKENT_CITY: 'Toshkent shahri',
};

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export const TODO_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'] as const;
export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

// ISO weekdays: index with (weekday - 1)
export const WEEKDAYS = ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'] as const;
```

---

## 14. Error handling

The API returns standard Nest error bodies: `{ statusCode, message, error }`. `message` may be a string or an array of validation strings.

| Status | Meaning | Suggested UI |
|---|---|---|
| `400` | validation / business rule (wrong date for a schedule, capacity exceeded, cross-branch participant) | inline field error, keep the form open |
| `401` | token missing or expired | clear session, redirect to `/login` |
| `403` | out of scope (other branch, role not allowed) | full-page "Ruxsat yo'q" state; ideally never reachable because the UI hid the action |
| `404` | not found, **or deliberately hidden cross-branch record** | "Topilmadi" empty state |
| `409` | conflict — duplicate username/branch name, **trainer double-booking**, deleting a non-empty branch | inline error on the offending field with the server's message |

Show the server's `message` verbatim where possible: the backend already writes them as readable sentences naming the trainer, the clashing activity and the times.

---

## 15. Seeded demo accounts

Password for all of them: `Admin123!`

| Username | Role | Branch |
|---|---|---|
| `superadmin` | SUPER_ADMIN | — (all branches) |
| `admin_samarqand` | ADMIN | Samarqand filiali (230 participants) |
| `admin_toshkent` | ADMIN | Toshkent shahar filiali (110) |
| `admin_fargona` | ADMIN | Fargʻona filiali (60) |
| `trener_samarqand_1`, `trener_samarqand_2` | TRAINER | Samarqand |
| `trener_toshkent_1` | TRAINER | Toshkent |
| `trener_fargona_1` | TRAINER | Fargʻona |

Log in as `admin_samarqand` and you must see exactly 230 people; as `superadmin`, all 400. That is the fastest way to verify the branch scoping is wired correctly end to end.
