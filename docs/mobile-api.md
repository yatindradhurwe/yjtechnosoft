# YJTechnosoft Employee App – Mobile API (v1)

This is the REST API for the employee Flutter app. With it, employees can:

* **sign in** with the email and password of their employee portal login,
* view their **profile** and a **dashboard**,
* see the **projects** they are assigned to, with site location and geofence,
* **check in and check out** with GPS geofencing and an optional selfie,
* view their **attendance** calendar and monthly summary,
* **apply for, track and cancel leave**, and see balances and holidays,
* manage their **daily tasks** (status, progress, comments, their own tasks),
* submit **daily work reports**,
* read **notifications** and **announcements**.

HR and admins manage all of this from the existing **admin panel**. See [Admin panel setup](#2-admin-panel-setup).

A machine-readable **OpenAPI 3** spec is in [`mobile-api.openapi.yaml`](mobile-api.openapi.yaml). The server also serves it at `GET /api/mobile/v1/openapi.yaml`. You can import it into Postman or Insomnia, or generate a Dart client from it.

---

## Contents

1. [Basics](#1-basics): base URL, envelope, dates, pagination, errors
2. [Admin panel setup](#2-admin-panel-setup)
3. [Authentication & sessions](#3-authentication--sessions)
4. [Geofencing rules](#4-geofencing-rules)
5. [Endpoint reference](#5-endpoint-reference)
6. [Flutter integration guide](#6-flutter-integration-guide)
7. [Testing with curl](#7-testing-with-curl)
8. [Server configuration](#8-server-configuration)

---

## 1. Basics

### Base URL

```
https://<your-domain>/api/mobile/v1
```

Local development: `http://<your-pc-lan-ip>:5000/api/mobile/v1`. Use your PC's LAN IP rather than `localhost`, because the phone or emulator has its own localhost. The Android emulator reaches the host PC at `10.0.2.2`.

Every endpoint lives under `/api/mobile/v1`. A breaking change would ship as `/v2`, and `v1` would keep working.

### Request format

* Send JSON with `Content-Type: application/json`.
* Two endpoints accept **`multipart/form-data`** for file uploads: `POST /attendance/check-in` (selfie in field `photo`) and `POST /me/photo`.
* Authenticated calls send `Authorization: Bearer <access_token>`.

### Response envelope

Every response, success or error, has the same shape:

```jsonc
// success
{ "success": true, "message": "Checked in successfully", "data": { ... }, "meta": { ... } }

// error
{ "success": false, "message": "You are 412 m from Raipur Site. Check-in is allowed within 150 m.",
  "code": "OUTSIDE_GEOFENCE", "details": { ... } }
```

* `message` is optional on success. When present, it is a human-readable sentence you can show in a snackbar.
* `meta` appears only on paginated lists.
* On errors, `message` is always safe to show the user. Use `code` to drive app logic.

### Dates and times

| Kind | Format | Example |
|------|--------|---------|
| Date | `YYYY-MM-DD` | `2026-10-26` |
| Date-time | ISO 8601 **with offset** | `2026-10-26T09:58:00+05:30` |
| Month | `YYYY-MM` | `2026-10` |
| Shift time | `HH:mm` | `10:00` |

Date-times are company local time (IST by default) and always carry the offset, so `DateTime.parse()` in Dart gives the correct instant. The **server clock is authoritative** for check-in and check-out times. The app never sends a time.

### Pagination

List endpoints that can grow take `?page=1&limit=20` (limit is at most 100) and return:

```json
"meta": { "page": 1, "limit": 20, "total": 57 }
```

Load more while `page * limit < total`.

### HTTP status codes and error codes

| HTTP | `code` | Meaning / what the app should do |
|------|--------|----------------------------------|
| 400 | `VALIDATION_ERROR` | Bad or missing input. Show `message`. |
| 401 | `UNAUTHORIZED` | No token sent. Go to login. |
| 401 | `TOKEN_EXPIRED` | Access token expired. **Call `/auth/refresh` and retry once.** |
| 401 | `TOKEN_INVALID` | Malformed or tampered token. Go to login. |
| 401 | `SESSION_REVOKED` | Signed out (logout, password change, or HR signed out this device). Clear tokens and go to login. |
| 401 | `REFRESH_INVALID` / `REFRESH_EXPIRED` | Refresh token unknown, already used, or expired. Go to login. |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password (login), or wrong current password (change password). |
| 401/403 | `ACCOUNT_DISABLED` | User or employee profile inactive. |
| 403 | `NOT_EMPLOYEE` | Login exists but isn't linked to an employee profile (e.g. a pure admin account). |
| 403 | `FORBIDDEN` | Not allowed (e.g. deleting a task a manager assigned). |
| 403 | `NOT_PROJECT_MEMBER` | Project not assigned to this employee. |
| 404 | `NOT_FOUND` | Record or route not found (or not yours). |
| 409 | `CONFLICT` | Generic conflict. |
| 413 | `FILE_TOO_LARGE` | Upload over 5 MB. |
| 429 | `RATE_LIMITED` | Too many login/refresh attempts. Wait and retry. |
| 500 | `SERVER_ERROR` | Unexpected error. Retry later. |

**Attendance-specific codes**

| HTTP | `code` | When |
|------|--------|------|
| 400 | `LOCATION_REQUIRED` | Enforce mode, and no latitude/longitude was sent. |
| 400 | `LOW_GPS_ACCURACY` | Enforce mode, and `accuracy` exceeds the limit. `details: { accuracy, required }`. |
| 403 | `OUTSIDE_GEOFENCE` | Enforce mode, outside every allowed site. `details.nearest` = `{ type, id, name, distance, radius, inside }`. |
| 403 | `MOCK_LOCATION` | Enforce mode, and `is_mocked: true`. |
| 403 | `WFH_NOT_ALLOWED` | WFH check-in is turned off in settings. |
| 403 | `OFFICE_NETWORK_REQUIRED` | Web panel only (office IP restriction). |
| 400 | `SELFIE_REQUIRED` | Settings require a selfie and no `photo` was attached. |
| 400 | `INVALID_FILE` | Selfie or photo is not an image (jpg, jpeg, png, gif, webp). |
| 409 | `ALREADY_CHECKED_IN` / `ALREADY_CHECKED_OUT` | Already done today. Refresh the screen. |
| 400 | `NOT_CHECKED_IN` | Check-out without a check-in today. |

**Leave-specific codes:** `LEAVE_OVERLAP` (409), `NO_WORKING_DAYS` (400: the range has only holidays or weekly offs), `CANNOT_CANCEL` (400: only pending requests can be cancelled).

---

## 2. Admin panel setup

Everything is configured from the existing panel (`/admin`). No extra admin app is needed.

| What | Where | Notes |
|------|-------|-------|
| **Employee login** | *HR › Employees › Add / Edit* → "Create portal login" | The email and password are what the employee uses in the app. Resigned or terminated employees are blocked automatically. |
| **Geofence mode** | *Settings › HR & Attendance › Geofenced check-in* | `Off` / `Flag` / `Enforce`. See [section 4](#4-geofencing-rules). |
| **Office location** | *Settings › HR & Attendance* → office latitude, longitude, radius | Optional. It becomes a geofence for every employee. |
| **GPS accuracy limit** | *Settings › HR & Attendance* | Default 100 m. Applies in enforce mode only. `0` turns it off. |
| **Allow WFH** | *Settings › HR & Attendance* | When off, "work from home" check-ins are refused (flag and enforce modes). |
| **Require selfie** | *Settings › HR & Attendance* | Mobile check-in must include a `photo`. |
| **Project site + geofence** | *Work › Projects › Edit* → site address, latitude, longitude, radius, "Members can check in at this site" | To get coordinates: Google Maps › right-click the site › click the coordinates to copy them. |
| **Assign employees to a project** | *Projects › Open › Members › + Add* | Members see the project in the app and can check in at its geofence. |
| **Tasks** | *Work › Tasks* (kanban) | Tasks assigned to an employee appear in the app. A push and email go out on assignment. |
| **Leave approval** | *HR › Leaves* | Approve or reject. The employee gets an in-app notification and an email. |
| **Attendance register** | *HR › Attendance* | Shows the source (App/Web), project, geofence result with distance, map links and selfie for each check-in. |
| **Push notifications** | *Settings › Email / SMS / WhatsApp / Push › Push notifications* | Paste the Firebase service-account JSON (same Firebase project as the app). See [6.6](#66-push-notifications-fcm). |
| **Lost phone** | *HR › Employees › (open employee) › Mobile app* | Sign out one device or all. Takes effect immediately. |
| **Announcements, holidays, leave types** | *HR* menu | Shown in the app. |

---

## 3. Authentication & sessions

The app uses two tokens:

| Token | Lifetime | Storage | Use |
|-------|----------|---------|-----|
| `access_token` (JWT) | 1 hour (`MOBILE_ACCESS_TTL`) | memory or secure storage | `Authorization: Bearer …` on every call |
| `refresh_token` (opaque) | 90 days, sliding (`MOBILE_REFRESH_DAYS`) | **`flutter_secure_storage` only** | `POST /auth/refresh` to get a new pair |

```
 login ──► access + refresh ──► API calls ──► 401 TOKEN_EXPIRED
                                     ▲                │
                                     │      POST /auth/refresh (old refresh)
                                     │                │
                                     └── new access + NEW refresh (old one is now dead)
```

* **Rotation:** every refresh returns a **new** refresh token, and the old one stops working at once. Always save the new one. Refresh one request at a time; see the interceptor in [section 6](#6-flutter-integration-guide).
* **Each device is a session.** Send a stable `device_id` on login. Signing in again on the same device replaces its old session.
* **Revocation is immediate.** Logout, a password change (other devices), a password reset, an HR password change, or HR clicking "Sign out" all invalidate the session. The next call returns `SESSION_REVOKED`.
* Mobile tokens work only on `/api/mobile/v1`. The web panel's endpoints reject them, and web tokens don't work here either.
* Login and forgot-password allow 30 requests per 15 minutes per IP. Refresh allows 600 per 15 minutes per IP, because many phones can share one office IP.

---

## 4. Geofencing rules

**Allowed sites for an employee** = the **office** (if its coordinates are set) **plus** every project they are a **member** of that has coordinates, has "Members can check in at this site" ticked, and has status planning, in progress or on hold.

`GET /attendance/geofences` returns this list. Use it to draw the sites on a map and to pre-check the distance on the device, so you can tell the user "You are 300 m away" before they tap. **The server's check is the one that counts.**

### Modes (Settings › HR & Attendance)

| Mode | Check-in outside | Location missing | Mock location | Low accuracy |
|------|------------------|------------------|---------------|--------------|
| `off` | allowed | allowed | allowed | allowed |
| `flag` | allowed, saved as `outside` | allowed (`no_location`) | allowed | allowed |
| `enforce` | **refused** `OUTSIDE_GEOFENCE` | **refused** `LOCATION_REQUIRED` | **refused** `MOCK_LOCATION` | **refused** `LOW_GPS_ACCURACY` |

* In every mode the server saves the coordinates, accuracy, distance to the nearest site and the result, and HR sees them in the attendance register.
* **Check-out is never blocked.** Employees often leave the site before tapping, so an outside check-out is recorded as `outside` and highlighted in red for HR.
* **Work from home** (`wfh: true`) skips the geofence. It is refused with `WFH_NOT_ALLOWED` if HR turned WFH off.
* **No site configured** for the employee (no office coordinates and no geofenced projects): check-in is allowed, and the result is `no_site`.
* **`project_id` (optional)**: the project the employee is working on today. If that project has a geofence, the employee must be inside **that** site. Without `project_id`, the server picks the nearest site they are inside, and tags the attendance with that project automatically if it is a project site.
* A point counts as inside when its distance from the site centre is at most the radius (haversine). GPS accuracy is checked separately against the accuracy limit.

**Geofence result values** (`geofence` / `check_in_location.geofence`): `inside`, `outside`, `wfh`, `no_location`, `no_site`.

---

## 5. Endpoint reference

`🔓` = public, `🔒` = needs `Authorization: Bearer <access_token>`.

### 5.1 App & auth

#### `GET /app-config` 🔓
Company branding and server time for the splash and login screens.
```json
{ "success": true, "data": {
  "api_version": "v1", "company_name": "YJTECHNOSOFT PRIVATE LIMITED",
  "logo_url": "https://yjtechnosoft.com/logo.png",
  "support_email": "yjtechnosoft@gmail.com", "support_phone": "+91 7000796585",
  "timezone": "Asia/Kolkata", "utc_offset": "+05:30", "server_time": "2026-10-26T16:02:04+05:30",
  "push_enabled": true } }
```
`push_enabled` is `true` when the server has Firebase set up. Then ask for notification permission and send the FCM token.

#### `POST /auth/login` 🔓
| Field | Type | Req | Notes |
|-------|------|-----|-------|
| `email` | string | ✔ | case-insensitive |
| `password` | string | ✔ | |
| `device_id` | string | recommended | stable per install (e.g. Android ID or `identifierForVendor`) |
| `device_name` | string | | "Samsung Galaxy A54" |
| `platform` | string | | `android` / `ios` |
| `app_version` | string | | "1.0.0" |
| `fcm_token` | string | | saved for future push notifications |

Response `200`:
```json
{ "success": true, "message": "Signed in", "data": {
  "access_token": "eyJhbGciOi…", "token_type": "Bearer", "expires_in": 3600,
  "refresh_token": "vfV1GlYxnwiLZ8T8…", "refresh_expires_at": "2027-01-24T16:02:03+05:30",
  "user": { "id": 3, "name": "Priya Patel", "email": "priya@yjtechnosoft.com", "phone": "9000000002", "role": "employee" },
  "employee": { /* Employee object, see GET /me */ } } }
```
Errors: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `NOT_EMPLOYEE`, `RATE_LIMITED`.

#### `POST /auth/refresh` 🔓
Body `{ "refresh_token": "…" }` → `data: { access_token, token_type, expires_in, refresh_token, refresh_expires_at }` (save the new refresh token).
Errors: `REFRESH_INVALID`, `REFRESH_EXPIRED`, `SESSION_REVOKED`, `ACCOUNT_DISABLED`.

#### `POST /auth/forgot-password` 🔓
Body `{ "email": "…" }`. Always returns success, so the response never reveals whether an email is registered. The reset link opens the website's reset page.

#### `POST /auth/logout` 🔒
Body (optional) `{ "all_devices": true }`. Without it, only this device is signed out.

#### `PUT /auth/password` 🔒
Body `{ "current_password": "…", "new_password": "min 6 chars" }`. Signs out **every other** device. This device stays signed in.
Errors: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`.

#### `PUT /auth/device` 🔒
Body any of `{ "fcm_token", "app_version", "device_name", "platform" }`. Call it when the FCM token rotates (`onTokenRefresh`) or after an app update. A token belongs to one session: sending it here detaches it from any other signed-in account on the same phone. Signing out stops pushes to that phone.

#### `GET /auth/sessions` 🔒
Signed-in devices for a "Manage devices" screen:
```json
{ "success": true, "data": [ { "id": 4, "device_name": "Samsung Galaxy A54", "platform": "android", "app_version": "1.0.0",
  "ip": "49.36.x.x", "created_at": "2026-10-26T16:02:03+05:30", "last_used_at": "2026-10-26T16:02:03+05:30", "is_current": true } ] }
```
`last_used_at` is updated at login and on each token refresh.

#### `DELETE /auth/sessions/{id}` 🔒
Sign out another of your devices.

### 5.2 Profile

#### `GET /me` 🔒
`data: { user, employee }`. **Employee object:**
```json
{ "id": 2, "emp_code": "YJT002", "name": "Priya Patel", "email": "priya@yjtechnosoft.com", "phone": "9000000002",
  "gender": "female", "dob": "1998-04-12", "father_name": null, "address": "…", "emergency_contact": "…",
  "photo_url": "https://yjtechnosoft.com/api/uploads/avatars/….jpg",
  "employment_type": "full_time", "status": "active", "joining_date": "2024-01-15", "probation_end": null,
  "shift": { "start": "10:00", "end": "18:00" },
  "department": { "id": 2, "name": "Design" }, "designation": { "id": 6, "name": "UI/UX Designer" },
  "reporting_manager": { "id": 1, "name": "Rohit Sahu", "phone": "…", "email": "…" },
  "bank": { "bank_name": "HDFC Bank", "account_no": "••••••••7366", "ifsc": "HDFC0001654" },
  "kyc": { "pan": "••••••234F", "aadhaar": "••••••••9012" } }
```
`employment_type`: `full_time | part_time | intern | contract`. `status`: `active | on_notice | resigned | terminated`.
Bank and KYC numbers are **masked** so a lost phone doesn't expose them. The full values stay in the admin panel.

#### `PUT /me` 🔒
Employees can update only `phone`, `address` and `emergency_contact`. Everything else is edited by HR. Returns the Employee object.

#### `POST /me/photo` 🔒 (multipart)
Field `photo`: an image up to 5 MB. Returns the Employee object with the new `photo_url`.

### 5.3 Dashboard

#### `GET /dashboard` 🔒
Everything the home screen needs in one call:
```jsonc
{ "date": "2026-10-26", "server_time": "2026-10-26T16:02:03+05:30",
  "employee": { /* Employee */ },
  "attendance": {
    "today": { /* Attendance or null */ },
    "can_check_in": false, "can_check_out": true,
    "rules": { "geofence_mode": "enforce", "max_gps_accuracy": 100, "allow_wfh": true, "selfie_required": false,
               "late_grace_minutes": 15, "half_day_hours": 4, "weekly_off": [0] } },
  "month_summary": { "month": "2026-10", "present": 18, "late": 2, "half_day": 1, "absent": 0, "on_leave": 1, "wfh": 3, "work_minutes": 8630 },
  "leave_balance": [ { "leave_type_id": 1, "name": "Casual Leave", "color": "#1d6fb8", "is_paid": true, "quota": 12, "used": 2, "pending": 1, "remaining": 10 } ],
  "tasks": { "counts": { "todo": 3, "in_progress": 1, "review": 0, "blocked": 0, "done": 12, "overdue": 1, "due_today": 2 },
             "open": [ /* up to 10 Task objects, soonest due first */ ] },
  "daily_report_submitted": false,
  "project_count": 2,
  "announcements": [ { "id": 1, "title": "…", "message": "…", "priority": "normal", "created_at": "…" } ],
  "upcoming_holidays": [ { "id": 4, "title": "Diwali", "date": "2026-11-08", "type": "public" } ],
  "unread_notifications": 3 }
```
In `month_summary`, `present` counts every day worked (on time, late or WFH). `late` and `wfh` are breakdowns of it.

### 5.4 Projects

#### `GET /projects` 🔒
Projects the employee is a **member** of, or has tasks in. Optional `?status=in_progress`.
**Project object:**
```json
{ "id": 1, "name": "Raipur Site", "description": null, "status": "in_progress", "client_name": "ABC Infra",
  "start_date": "2026-10-01", "deadline": "2027-03-31",
  "is_member": true, "my_role": "Site engineer", "my_task_count": 4, "my_open_tasks": 2,
  "site": { "address": "Telibandha, Raipur", "latitude": 21.238, "longitude": 81.6337, "radius": 150, "geofence_enabled": true } }
```
`status`: `planning | in_progress | on_hold | completed | cancelled`.

#### `GET /projects/{id}` 🔒
Project object plus:
* `team`: `[ { id, name, emp_code, designation, role, phone, photo_url } ]`, the project members
* `my_tasks`: Task objects in this project assigned to me
* `today_attendance`: my attendance today if it is tagged to this project, otherwise `null`

Returns `404` if the project isn't visible to the employee.

### 5.5 Attendance

**Attendance object:**
```json
{ "id": 12, "date": "2026-10-26", "status": "present",
  "check_in": "2026-10-26T09:58:00+05:30", "check_out": "2026-10-26T18:07:00+05:30", "work_minutes": 489,
  "source": "mobile", "project": { "id": 1, "name": "Raipur Site" },
  "check_in_location":  { "latitude": 21.2381, "longitude": 81.6338, "accuracy": 12, "distance": 14, "geofence": "inside" },
  "check_out_location": { "latitude": 21.2391, "longitude": 81.6350, "accuracy": 20, "distance": 175, "geofence": "outside" },
  "has_selfie": true, "notes": null }
```
`status`: `present | late | half_day | absent | leave | holiday | wfh`. `source`: `mobile | web | null` (rows marked manually by HR have `null`).
A check-out shorter than `half_day_hours` turns the day into `half_day` (except WFH). A check-in after shift start plus `late_grace_minutes` is `late`.

#### `GET /attendance/today` 🔒
```json
{ "date": "2026-10-26", "server_time": "…", "attendance": { /* or null */ },
  "shift": { "start": "10:00", "end": "18:00" }, "can_check_in": true, "can_check_out": false, "rules": { /* as in dashboard */ } }
```

#### `GET /attendance/geofences` 🔒
```json
{ "mode": "enforce", "max_gps_accuracy": 100, "sites": [
  { "type": "office",  "id": null, "name": "YJTECHNOSOFT PRIVATE LIMITED office", "address": "Rajmahal Chowk, Kawardha", "latitude": 22.0136, "longitude": 81.2459, "radius": 200 },
  { "type": "project", "id": 1, "name": "Raipur Site", "address": "Telibandha, Raipur", "latitude": 21.238, "longitude": 81.6337, "radius": 150 } ] }
```

#### `POST /attendance/check-in` 🔒 (JSON **or** multipart when sending a selfie)
| Field | Type | Notes |
|-------|------|-------|
| `latitude`, `longitude` | number | from `geolocator` |
| `accuracy` | number (m) | `position.accuracy` |
| `is_mocked` | bool | `position.isMocked` (Android) |
| `project_id` | int | optional, see [section 4](#4-geofencing-rules) |
| `wfh` | bool | work from home |
| `notes` | string | optional |
| `photo` | file | selfie (multipart only, image ≤ 5 MB) |
| `device_name`, `platform`, `app_version` | string | optional, stored with the record |

In multipart requests every field is a string (`"true"`, `"21.2381"`). That is fine.

Response `200`:
```json
{ "success": true, "message": "Checked in successfully",
  "data": { "attendance": { /* Attendance */ },
            "geofence": { "status": "inside", "mode": "enforce",
                          "site": { "type": "project", "id": 1, "name": "Raipur Site", "distance": 14, "radius": 150, "inside": true } } } }
```
In flag mode an outside check-in still succeeds. Its `message` ends with "– you are outside Raipur Site (412 m away)".

Error example (enforce):
```json
{ "success": false, "code": "OUTSIDE_GEOFENCE",
  "message": "You are 412 m from Raipur Site. Check-in is allowed within 150 m.",
  "details": { "nearest": { "type": "project", "id": 1, "name": "Raipur Site", "distance": 412, "radius": 150, "inside": false } } }
```

#### `POST /attendance/check-out` 🔒
Body `{ latitude, longitude, accuracy, is_mocked }` (all optional, but send them). Same response shape as check-in (`geofence` has no `mode`). It is never refused for location.
Errors: `NOT_CHECKED_IN`, `ALREADY_CHECKED_OUT`.

#### `GET /attendance?month=YYYY-MM` 🔒
Defaults to the current month.
```json
{ "month": "2026-10",
  "summary": { "present": 18, "late": 2, "half_day": 1, "absent": 0, "leave": 1, "wfh": 3, "holiday": 1, "work_minutes": 8630 },
  "records": [ /* Attendance objects for days that have a row */ ],
  "holidays": [ { "id": 3, "title": "Dussehra", "date": "2026-10-20", "type": "public" } ],
  "weekly_off": [0] }
```
For a calendar view: days without a record are weekly off (`weekly_off`, where 0 = Sunday), a holiday, a future day, or not marked yet. `present` includes late and WFH days.

### 5.6 Leaves & holidays

**Leave object:**
```json
{ "id": 7, "leave_type": { "id": 1, "name": "Casual Leave", "color": "#1d6fb8", "is_paid": true },
  "from_date": "2026-11-02", "to_date": "2026-11-03", "half_day": false, "days": 2,
  "reason": "Family function", "status": "pending", "remarks": null, "approved_by": null,
  "applied_at": "2026-10-26T16:10:00+05:30", "can_cancel": true }
```
`status`: `pending | approved | rejected | cancelled`.

| Endpoint | Description |
|----------|-------------|
| `GET /leaves/types` 🔒 | `[ { id, name, quota, is_paid, color } ]` for the apply form |
| `GET /leaves/balance?year=2026` 🔒 | `{ year, balance: [ { leave_type_id, name, color, is_paid, quota, used, pending, remaining } ] }` |
| `GET /leaves/calculate?from_date=&to_date=&half_day=` 🔒 | `{ from_date, to_date, half_day, days }`: working days in the range, skipping weekly offs and holidays. Show it before submitting. |
| `GET /leaves?status=&year=&page=&limit=` 🔒 | My requests, newest first, paginated |
| `GET /leaves/{id}` 🔒 | One request |
| `POST /leaves` 🔒 | Apply (see below). `201` with a Leave object. HR gets a notification. |
| `POST /leaves/{id}/cancel` 🔒 | Cancel a **pending** request. Returns the Leave object. |
| `GET /holidays?year=2026` 🔒 | `[ { id, title, date, type } ]`, where type is `public | optional | company` |

`POST /leaves` body: `{ "leave_type_id": 1, "from_date": "2026-11-02", "to_date": "2026-11-03", "half_day": false, "reason": "…" }`. `to_date` defaults to `from_date`. When `half_day` is true, the request counts as 0.5 day.
Errors: `VALIDATION_ERROR`, `LEAVE_OVERLAP`, `NO_WORKING_DAYS`.
When HR approves a leave, it is written into attendance automatically, and the employee gets an in-app notification and an email.

### 5.7 Tasks (daily project tasks)

**Task object:**
```json
{ "id": 21, "title": "Install CCTV at site", "description": "4 cameras on floor 1",
  "priority": "high", "status": "in_progress", "progress": 40,
  "start_date": "2026-10-26", "due_date": "2026-10-26", "completed_at": null, "is_overdue": false,
  "project": { "id": 1, "name": "Raipur Site" }, "assigned_by": "HR Manager",
  "is_self_created": false, "comment_count": 1,
  "created_at": "2026-10-26T09:00:00+05:30", "updated_at": "2026-10-26T12:30:00+05:30" }
```
`priority`: `low | medium | high | urgent`. `status`: `todo | in_progress | review | done | blocked`.

| Endpoint | Description |
|----------|-------------|
| `GET /tasks` 🔒 | My tasks. Filters: `q` (search), `status` (comma separated, e.g. `todo,in_progress`), `priority`, `project_id`, `due=today\|overdue\|upcoming` (upcoming = next 7 days), `date=YYYY-MM-DD` (the **day plan**: open tasks active that day, plus tasks due or completed that day). Paginated. Sorted by in progress first, then priority, then due date. |
| `GET /tasks/{id}` 🔒 | Task plus `comments: [ { id, comment, user: { id, name, role }, is_mine, created_at } ]` |
| `POST /tasks` 🔒 | Create a task for **myself**: `{ title*, description, project_id, priority, status, start_date, due_date, progress }`. `start_date` defaults to today. The project must be one of mine (`NOT_PROJECT_MEMBER`). |
| `PATCH /tasks/{id}` 🔒 | Update. For tasks a **manager** assigned, only `status` and `progress` (0–100). For tasks **I created**, any field. Setting `status: "done"` sets `progress` to 100 and `completed_at`. |
| `DELETE /tasks/{id}` 🔒 | Delete only tasks I created (`FORBIDDEN` otherwise) |
| `POST /tasks/{id}/comments` 🔒 | `{ "comment": "…" }` → `201` with the comment. Notifies the manager who assigned the task. |

### 5.8 Daily work reports

**Report object:**
```json
{ "id": 5, "report_date": "2026-10-26", "work_done": "CCTV installed on floor 1", "hours": 7.5,
  "plan_tomorrow": "Floor 2 wiring", "blockers": null, "project": { "id": 1, "name": "Raipur Site" },
  "status": "submitted", "reviewer_remarks": null, "submitted_at": "2026-10-26T18:05:00+05:30" }
```
| Endpoint | Description |
|----------|-------------|
| `GET /reports?date=&from=&to=&page=&limit=` 🔒 | My reports, newest first |
| `POST /reports` 🔒 | `{ work_done*, hours, plan_tomorrow, blockers, project_id, report_date }`. `report_date` defaults to today and can't be in the future. Submitting again for the same day **updates** that report. `201` with the Report object. |

`status`: `submitted | reviewed` (HR reviews it in the panel and can add `reviewer_remarks`).

### 5.9 Notifications & announcements

| Endpoint | Description |
|----------|-------------|
| `GET /notifications?unread=1&page=&limit=` 🔒 | `[ { id, type, title, body, link, is_read, created_at } ]`, with `meta.unread` for the badge. `type`: `leave`, `task`, `announcement`, `general`… `link` is a web-panel path; map `type` to an app screen instead. |
| `POST /notifications/{id}/read` 🔒 | Mark one as read |
| `POST /notifications/read-all` 🔒 | Mark all as read |
| `POST /notifications/test` 🔒 | Sends a test push to every device of the signed-in user. `data: { web: {sent, devices}, mobile: {sent, failed, devices} }`, and `message` explains what to fix when nothing was delivered. |
| `GET /announcements?page=&limit=` 🔒 | `[ { id, title, message, priority, created_at } ]`, where priority is `normal | important` |

Every notification is saved in-app (above) **and** pushed to the employee's signed-in phones through FCM, see [6.6](#66-push-notifications-fcm). The employee is notified about:

| `type` | When |
|--------|------|
| `task` | Task assigned to them, a comment on their task, or a manager changing its status |
| `leave` | Leave approved or rejected |
| `report` | Their daily report was reviewed |
| `payslip` | Payslip generated, salary marked paid |
| `letter` | HR letter issued to them |
| `announcement` | New announcement |
| `test` | Test push |

HR, managers and admins (who can also sign in to the app) are notified about: leave requests and withdrawals, daily reports submitted, task status changes on tasks they assigned, task comments, check-ins outside the geofence or with a mock location, new leads, job applications, payments and expiring services.

---

## 6. Flutter integration guide

### 6.1 Packages

```yaml
dependencies:
  dio: ^5.7.0                    # HTTP + interceptors
  flutter_secure_storage: ^9.2.2 # refresh token storage (Keychain / Keystore)
  geolocator: ^13.0.1            # GPS, accuracy, isMocked
  permission_handler: ^11.3.1    # location / camera permission UX
  image_picker: ^1.1.2           # selfie (front camera)
  device_info_plus: ^10.1.2      # device_id / device_name
  package_info_plus: ^8.0.2      # app_version
```

### 6.2 Platform permissions

**Android** `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.CAMERA"/>
```
For HTTP (non-HTTPS) testing only, add `android:usesCleartextTraffic="true"` to `<application>`. Production must use HTTPS.

**iOS** `ios/Runner/Info.plist`:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Your location is used to verify attendance at your office or project site.</string>
<key>NSCameraUsageDescription</key>
<string>A selfie is taken when you check in.</string>
```

### 6.3 API client with automatic token refresh

```dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiException implements Exception {
  final int? status; final String code; final String message; final Map<String, dynamic>? details;
  ApiException(this.status, this.code, this.message, [this.details]);
  @override String toString() => message;
}

class ApiClient {
  static const baseUrl = 'https://yjtechnosoft.com/api/mobile/v1';
  final _storage = const FlutterSecureStorage();
  late final Dio dio;
  String? _accessToken;
  Future<bool>? _refreshing;            // one refresh at a time (refresh tokens rotate!)
  void Function()? onSessionEnded;      // navigate to login

  ApiClient() {
    dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(seconds: 30)));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (o, h) {
        if (_accessToken != null) o.headers['Authorization'] = 'Bearer $_accessToken';
        h.next(o);
      },
      onError: (e, h) async {
        final code = e.response?.data is Map ? e.response!.data['code'] : null;
        final retried = e.requestOptions.extra['retried'] == true;
        if (code == 'TOKEN_EXPIRED' && !retried && await _refresh()) {
          final o = e.requestOptions..extra['retried'] = true
                                    ..headers['Authorization'] = 'Bearer $_accessToken';
          try { return h.resolve(await dio.fetch(o)); } catch (err) { return h.next(err as DioException); }
        }
        if (['SESSION_REVOKED', 'TOKEN_INVALID', 'REFRESH_INVALID', 'REFRESH_EXPIRED', 'ACCOUNT_DISABLED'].contains(code)) {
          await clear(); onSessionEnded?.call();
        }
        h.next(e);
      },
    ));
  }

  Future<bool> _refresh() => _refreshing ??= () async {
    try {
      final rt = await _storage.read(key: 'refresh_token');
      if (rt == null) return false;
      final r = await Dio(BaseOptions(baseUrl: baseUrl)).post('/auth/refresh', data: {'refresh_token': rt});
      await _save(r.data['data']);
      return true;
    } catch (_) { return false; } finally { _refreshing = null; }
  }();

  Future<void> _save(Map<String, dynamic> t) async {
    _accessToken = t['access_token'];
    await _storage.write(key: 'refresh_token', value: t['refresh_token']);
  }

  Future<void> clear() async { _accessToken = null; await _storage.delete(key: 'refresh_token'); }

  /// On app start: true if a session can be restored (gets a fresh access token).
  Future<bool> restore() => _refresh();

  /// Unwraps the envelope: returns `data`, throws ApiException with `code`.
  Future<T> call<T>(Future<Response> Function() req) async {
    try {
      final r = await req();
      return r.data['data'] as T;
    } on DioException catch (e) {
      final d = e.response?.data;
      if (d is Map && d['success'] == false) {
        throw ApiException(e.response?.statusCode, d['code'] ?? 'ERROR', d['message'] ?? 'Error', d['details']);
      }
      throw ApiException(null, 'NETWORK_ERROR', 'No internet connection. Please try again.');
    }
  }

  Future<Map<String, dynamic>> login(String email, String password, Map<String, String> device) async {
    final data = await call<Map<String, dynamic>>(() => dio.post('/auth/login', data: {'email': email, 'password': password, ...device}));
    await _save(data);
    return data;
  }
}
```

### 6.4 Check-in flow with geofence and selfie

```dart
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

Future<Position> currentPosition() async {
  if (!await Geolocator.isLocationServiceEnabled()) throw ApiException(null, 'GPS_OFF', 'Turn on location (GPS).');
  var p = await Geolocator.checkPermission();
  if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
  if (p == LocationPermission.denied || p == LocationPermission.deniedForever) {
    throw ApiException(null, 'LOCATION_DENIED', 'Allow location access to mark attendance.');
  }
  return Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)));
}

Future<Map<String, dynamic>> checkIn(ApiClient api, {int? projectId, bool wfh = false, required bool selfieRequired}) async {
  final pos = await currentPosition();
  final fields = <String, dynamic>{
    'latitude': pos.latitude, 'longitude': pos.longitude, 'accuracy': pos.accuracy.round(),
    'is_mocked': pos.isMocked, if (projectId != null) 'project_id': projectId, if (wfh) 'wfh': true,
  };
  Object body = fields;
  if (selfieRequired) {
    final shot = await ImagePicker().pickImage(source: ImageSource.camera, preferredCameraDevice: CameraDevice.front, imageQuality: 60, maxWidth: 1024);
    if (shot == null) throw ApiException(null, 'CANCELLED', 'Selfie is required to check in.');
    body = FormData.fromMap({...fields.map((k, v) => MapEntry(k, '$v')), 'photo': await MultipartFile.fromFile(shot.path, filename: 'selfie.jpg')});
  }
  return api.call(() => api.dio.post('/attendance/check-in', data: body));
}

// UI handling
try {
  final r = await checkIn(api, projectId: selectedProject?.id, selfieRequired: rules['selfie_required']);
  showSnack('Checked in at ${r['attendance']['check_in']}');
} on ApiException catch (e) {
  switch (e.code) {
    case 'OUTSIDE_GEOFENCE':
      final n = e.details?['nearest'];
      showDialogText('You are ${n['distance']} m from ${n['name']}. Move within ${n['radius']} m.');
    case 'LOW_GPS_ACCURACY': showSnack('Weak GPS signal. Step outside and retry.');
    case 'ALREADY_CHECKED_IN': reloadToday();
    default: showSnack(e.message);
  }
}
```

**Optional on-device pre-check** (for the UI only, before the user taps):
```dart
final sites = (await api.call<Map>(() => api.dio.get('/attendance/geofences')))['sites'] as List;
final nearest = sites.map((s) => (s, Geolocator.distanceBetween(pos.latitude, pos.longitude, s['latitude'], s['longitude'])))
                     .reduce((a, b) => a.$2 < b.$2 ? a : b);
final inside = nearest.$2 <= nearest.$1['radius'];
```

### 6.5 Suggested screens → endpoints

| Screen | Calls |
|--------|-------|
| Splash | `GET /app-config`, `restore()` → `/auth/refresh` |
| Login / Forgot password | `POST /auth/login`, `POST /auth/forgot-password` |
| Home | `GET /dashboard` (pull-to-refresh) |
| Check-in / out | `GET /attendance/today`, `GET /attendance/geofences`, `POST /attendance/check-in`, `POST /attendance/check-out` |
| Attendance calendar | `GET /attendance?month=` |
| Projects → detail / map | `GET /projects`, `GET /projects/{id}` |
| Tasks (Today tab) | `GET /tasks?date=<today>`; list tabs use `status=` and `due=` |
| Task detail | `GET /tasks/{id}`, `PATCH /tasks/{id}`, `POST /tasks/{id}/comments` |
| Daily report | `GET /reports?date=<today>`, `POST /reports` |
| Leaves | `GET /leaves/balance`, `GET /leaves`, `GET /leaves/types`, `GET /leaves/calculate`, `POST /leaves`, `POST /leaves/{id}/cancel` |
| Holidays | `GET /holidays?year=` |
| Notifications | `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/test` |
| Profile / settings | `GET /me`, `PUT /me`, `POST /me/photo`, `PUT /auth/password`, `GET /auth/sessions`, `POST /auth/logout` |

### 6.6 Push notifications (FCM)

Add `firebase_core`, `firebase_messaging` and `flutter_local_notifications` (for foreground banners on Android). Register the app in the **same Firebase project** whose service account is pasted in the admin settings.

1. After login, call `FirebaseMessaging.instance.requestPermission()`, then `getToken()`. Send it as `fcm_token` in `POST /auth/login` or in `PUT /auth/device`.
2. Listen to `onTokenRefresh` and send the new token with `PUT /auth/device`.
3. Create an Android notification channel with id **`default`** (the server sends `android.notification.channel_id = "default"`).

Each message has a `notification` (title, body), so the system shows it when the app is in the background or killed. It also has a `data` block, where every value is a string:

```json
{
  "type": "task",
  "screen": "tasks",
  "notification_id": "1532",
  "task_id": "88",
  "link": "/admin/my/tasks",
  "click_action": "FLUTTER_NOTIFICATION_CLICK"
}
```

| Key | Use |
|-----|-----|
| `screen` | Where to go on tap: `tasks`, `leaves`, `reports`, `attendance`, `announcements`, `payslips`, `letters` or `notifications` (default) |
| `notification_id` | Call `POST /notifications/{id}/read` after opening |
| `task_id` / `leave_id` / `report_id` / `payslip_id` / `letter_id` | Present when the push is about one record: open its detail screen |
| `type` | Same as `type` in `GET /notifications` |
| `link` | Web-panel path. Ignore it in the app. |

On iOS, `aps.badge` is set to the user's unread count.

```dart
FirebaseMessaging.onMessage.listen((m) {            // app in foreground
  showLocalNotification(m.notification?.title, m.notification?.body, payload: jsonEncode(m.data));
  refreshUnreadBadge();
});
FirebaseMessaging.onMessageOpenedApp.listen((m) => openFromPush(m.data));
final initial = await FirebaseMessaging.instance.getInitialMessage();  // launched by a tap
if (initial != null) openFromPush(initial.data);

void openFromPush(Map<String, dynamic> d) {
  if (d['notification_id'] != null) api.post('/notifications/${d['notification_id']}/read');
  switch (d['screen']) {
    case 'tasks': d['task_id'] != null ? router.push('/tasks/${d['task_id']}') : router.push('/tasks'); break;
    case 'leaves': router.push('/leaves'); break;
    case 'reports': router.push('/reports'); break;
    case 'announcements': router.push('/announcements'); break;
    default: router.push('/notifications');
  }
}
```

Use `POST /notifications/test` from a debug menu to check the setup end to end.

### 6.7 Tips

* Use `server_time` from `/dashboard` or `/attendance/today` for the live clock, and don't rely on the phone's clock. The server stamps check-in and check-out times itself.
* After a successful check-in or check-out, refresh `/dashboard`.
* Store **only the refresh token** on disk (secure storage). Keep the access token in memory.
* Treat any `401` other than `TOKEN_EXPIRED` as "go to login".

---

## 7. Testing with curl

```bash
API=https://yjtechnosoft.com/api/mobile/v1

# login
curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"rohit@yjtechnosoft.com","password":"Employee@123","device_id":"test-1","device_name":"curl"}'
TOKEN=<access_token from above>

curl -s $API/dashboard -H "Authorization: Bearer $TOKEN"

# check in (JSON)
curl -s $API/attendance/check-in -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"latitude":21.2381,"longitude":81.6338,"accuracy":12}'

# check in with selfie (multipart)
curl -s $API/attendance/check-in -H "Authorization: Bearer $TOKEN" \
  -F latitude=21.2381 -F longitude=81.6338 -F accuracy=12 -F photo=@selfie.jpg

# apply leave
curl -s $API/leaves -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"leave_type_id":1,"from_date":"2026-11-02","to_date":"2026-11-03","reason":"Family function"}'

# update a task
curl -s -X PATCH $API/tasks/21 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"in_progress","progress":40}'
```

Demo employees (`npm run setup:demo` only): `rohit@ / priya@ / aman@yjtechnosoft.com`, password `Employee@123`.

---

## 8. Server configuration

Optional variables in `server/.env`:

| Variable | Default | Meaning |
|----------|---------|---------|
| `MOBILE_ACCESS_TTL` | `1h` | Access token lifetime (`15m`, `2h`…) |
| `MOBILE_REFRESH_DAYS` | `90` | Refresh token lifetime in days. It slides: each refresh restarts it. |
| `JWT_SECRET` | n/a | Shared with the web panel. Changing it signs everyone out. |
| `CORS_ORIGIN` | n/a | Not needed for the Flutter app (native apps don't use CORS), only for Flutter **web** builds. |

Database tables and columns (`project_members`, `mobile_sessions`, new geofence columns on `projects` and `attendance`, `project_id` on `daily_reports`) are created automatically when the server starts (or with `npm run setup`).

Selfies are stored in `server/uploads/attendance/`, which is private: only logged-in admin, HR and accounts users can open them. Include that folder in your backups.
