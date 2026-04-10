# Student Portal — Project Report
**Course:** SECU2000 — Application Security  
**Project:** Secure Client–Server Application  
**Team:** Heli Patel · Blessy Baiju · Ayush Prajapati  

---

## 1. Project Scope (Problem Definition)

### 1.1 Problem Statement
Educational institutions rely on student portals to manage course registrations, grades, and document submissions. These systems handle highly sensitive personal and academic data, yet are frequently vulnerable to attacks such as SQL injection, unauthorized access to other students' records, and insecure file uploads. A compromised portal can expose student PII, allow grade tampering, or enable account takeovers — all with serious real-world consequences.

### 1.2 Who the Users Are
- **Students** — view their grades, register for courses, upload documents
- **Instructors** — post grades, create/manage courses
- **Admins** — manage all users, view audit logs, access the admin dashboard

### 1.3 What the Application Does
The Student Portal provides:
- Secure account registration and login (with role-based access)
- Course listing and search
- Student course enrollment and grade viewing
- Document and profile image upload
- Admin dashboard for user management and audit log review

### 1.4 Boundaries (What Is Not Included)
- Email verification / password reset flow (out of scope for this phase)
- Payment processing or fee management
- Video/streaming content delivery
- Mobile-native application (web-based frontend only)

---

## 2. Application Architecture

The application strictly separates three layers. The frontend never directly queries the database. All database access flows through the backend, which enforces authentication, authorization, and validation before any data operation.

```
Frontend (React.js)
      │
      │  REST API over HTTP (JSON)
      ▼
Backend (Node.js + Express)
  ├─ Middleware Layer: Helmet, CORS, Rate Limiter, JWT Auth, RBAC, Validator, Logger
  └─ Route Handlers: /auth, /courses, /grades, /upload, /admin
      │
      │  Parameterized SQL queries (pg library)
      ▼
Database (PostgreSQL)
  └─ Tables: users, courses, enrollments, file_uploads, audit_logs
```

### 2.1 Layer Responsibilities

**Frontend (Heli Patel)**
- Renders UI: login, dashboard, course registration, grades view
- Applies output encoding to prevent XSS from API data
- Manages JWT token in sessionStorage (not localStorage)
- Sends sanitized form data to the API

**Backend (Blessy Baiju)**
- Handles all business logic and security enforcement
- Authenticates users with bcrypt + JWT
- Enforces role-based access control on every route
- Validates and sanitizes all inputs server-side
- Executes parameterized database queries
- Manages secure file upload pipeline
- Logs all critical security events

**Database (shared)**
- PostgreSQL with five related tables
- No direct access from frontend
- Schema uses foreign keys, constraints, and indexes
- Password hashes never returned in API responses



## 3. Required Threat Surface Implementation

| Entry Point | Implementation | Purpose |
|-------------|---------------|---------|
| **Login form** | `POST /api/auth/login` — bcrypt verify, JWT issue, rate limit 10/15min | Authentication |
| **Search form** | `GET /api/courses?search=...` — parameterized ILIKE query | Course discovery |
| **File upload** | `POST /api/upload` — Multer, MIME + ext whitelist, UUID rename, 5MB limit | Document/image upload |
| **REST APIs** | All `/api/*` routes — JWT protected, role-checked, validated | Core application actions |
| **Admin panel** | `GET/PUT /api/admin/*` — admin role required, read-only audit logs | User management + monitoring |

---

## 4. OWASP Top 10 Mapping

### A01 — Broken Access Control
**Risk:** A student could access another student's grades by manipulating the user ID in the request.

**Mitigations implemented:**
- In `routes/grades.js` — `GET /api/grades/my` always uses `req.user.id` from the verified JWT, never from query parameters. A student cannot supply a different `student_id`.
- In `routes/upload.js` — `GET /api/upload/my-files` filters by `user_id = $1` using the JWT identity.
- In `routes/admin.js` — `router.use(authenticate, authorize('admin'))` is applied at the router level so every admin route is double-protected.
- Admins cannot change their own role or deactivate their own account.

**Code evidence:**
```js
// routes/grades.js — IDOR prevention
const result = await pool.query(
  `SELECT ... FROM enrollments WHERE student_id = $1`,
  [req.user.id]   // ← always from JWT, never from req.body or req.params
);
```

---

### A03 — Injection
**Risk:** An attacker submits `' OR '1'='1` in the search field to extract all records or drop tables.

**Mitigations implemented:**
- Every single database query in every route file uses PostgreSQL parameterized queries with `$1, $2, ...` placeholders. No string concatenation is ever used to build SQL.
- `express-validator` sanitizes and validates all inputs before they reach the database layer.
- Dynamic query building (in the admin logs route) still uses parameterized values.

**Code evidence:**
```js
// routes/courses.js — parameterized search (safe from SQL injection)
await pool.query(
  `SELECT ... FROM courses WHERE title ILIKE $1 LIMIT $2 OFFSET $3`,
  [`%${search}%`, limit, offset]   // ← user input is always a parameter
);
```

---

### A05 — Security Misconfiguration
**Risk:** Default Express headers reveal the framework, missing Content Security Policy enables script injection, overly broad CORS allows cross-origin attacks.

**Mitigations implemented:**
- **Helmet.js** is configured in `server.js` to set: Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, and removes `X-Powered-By`.
- CORS is configured with an explicit origin whitelist — wildcard `*` is never used.
- Stack traces are suppressed in production (controlled in `middleware/errorHandler.js`).
- Environment variables used for all secrets — never hardcoded.
- `.env` is in `.gitignore` — it is never committed to the repository.
- PostgreSQL SSL is enforced when `NODE_ENV=production`.

**Code evidence:**
```js
// server.js
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], ... } },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000 } : false,
}));
```

---

### A07 — Identification & Authentication Failures
**Risk:** Weak passwords, brute-force attacks, session tokens that never expire.

**Mitigations implemented:**
- Passwords must meet complexity requirements (8+ chars, upper, lower, number, special character) — enforced by `express-validator` in `routes/auth.js`.
- Passwords are hashed using **bcrypt with cost factor 12** before storage.
- **Rate limiting** on login: 10 attempts per IP per 15 minutes (implemented in `middleware/rateLimiter.js`).
- JWT tokens expire after **1 hour** (`JWT_EXPIRES_IN=1h`).
- **Timing-safe login**: a dummy bcrypt hash is always compared even when the email does not exist, preventing timing attacks that could enumerate registered emails.
- Generic error message: `"Invalid email or password."` — never specifies which field was wrong.
- Deactivated accounts are rejected even with valid tokens (re-checked from DB on each request).

**Code evidence:**
```js
// routes/auth.js — timing-safe login
const DUMMY_HASH = '$2a$12$...';
const user        = result.rows[0];
const hashToCheck = user ? user.password_hash : DUMMY_HASH;
// bcrypt.compare runs even if user doesn't exist — prevents timing enumeration
const passwordMatch = await bcrypt.compare(password, hashToCheck);
```

---

### A09 — Security Logging & Monitoring Failures
**Risk:** Attacks go undetected because there is no log of failed logins, unauthorized access attempts, or privilege changes.

**Mitigations implemented:**
- **Winston logger** (`utils/logger.js`) writes structured JSON logs to rotating files in `logs/`.
- **audit_logs database table** records: user ID, action, resource, IP address, user agent, status (success/failure/warning), and a JSON details field.
- The following events are logged: USER_REGISTERED, LOGIN_SUCCESS, LOGIN_FAILED, AUTH_REJECTED, UNAUTHORIZED_ACCESS, LOGOUT, COURSE_CREATED, COURSE_ENROLLED, FILE_UPLOADED, UPLOAD_REJECTED, GRADE_UPDATED, ROLE_CHANGED, USER_ACTIVATED, USER_DEACTIVATED.
- Audit logs are read-only via the API — there is no DELETE endpoint for logs.
- Morgan middleware logs every HTTP request including status codes and response times.

**Code evidence:**
```js
// middleware/auth.js — unauthorized access audit entry
await writeAuditLog(
  req.user.id, 'UNAUTHORIZED_ACCESS', req.path,
  req.ip, req.headers['user-agent'], 'failure',
  { userRole: req.user.role, requiredRoles: allowedRoles }
);
```

---

## 5. STRIDE Threat Model

| # | Threat Type | Entry Point | Risk Description | Mitigation |
|---|------------|-------------|-----------------|-----------|
| 1 | **S — Spoofing** | Login form `/api/auth/login` | Attacker submits valid credentials stolen via phishing to impersonate a student | bcrypt password hashing; JWT with short expiry (1h); rate limiting (10 attempts/15 min); account deactivation by admin |
| 2 | **S — Spoofing** | Authorization header | Attacker crafts or replays a JWT token to act as another user | `jwt.verify()` with strong secret; token re-validated against DB on every request; deactivated users rejected |
| 3 | **T — Tampering** | Grade update API `PUT /api/grades/:id` | Student alters their own grade by calling the grade update endpoint directly | Route requires `admin` or `instructor` role; RBAC checked in `authorize()` middleware |
| 4 | **T — Tampering** | File upload `POST /api/upload` | Attacker uploads a PHP/shell script disguised with a double extension (shell.php.jpg) | Dual validation: MIME type whitelist AND extension whitelist; file renamed to UUID (no executable name retained) |
| 5 | **R — Repudiation** | Any authenticated action | User denies performing an action (e.g., enrolling in a course, uploading a file) | `audit_logs` table records every critical action with user ID, IP, timestamp; logs are append-only via API |
| 6 | **I — Information Disclosure** | Login form error messages | Attacker uses differential error messages ("email not found" vs "wrong password") to enumerate registered emails | Generic error: `"Invalid email or password."` regardless of which field failed |
| 7 | **I — Information Disclosure** | Error responses | Unhandled exceptions expose stack traces, file paths, or DB schema to the client | `errorHandler.js` returns only generic message in production; full error logged server-side only |
| 8 | **I — Information Disclosure** | Admin users API `GET /api/admin/users` | Password hashes leaked in user listing response | `password_hash` column is never included in any SELECT statement returning user data |
| 9 | **D — Denial of Service** | Login form | Attacker floods login endpoint to lock out legitimate users or exhaust server resources | `loginLimiter`: 10 requests/15 min per IP; `apiLimiter`: 100 requests/15 min per IP; request body size capped at 10KB |
| 10 | **D — Denial of Service** | File upload | Attacker uploads very large files repeatedly to exhaust disk space or memory | Multer enforces 5MB max; `uploadLimiter`: 20 uploads/15 min per IP; file count limited to 1 per request |
| 11 | **E — Elevation of Privilege** | Role change API `PUT /api/admin/users/:id/role` | A student calls the role-change endpoint to promote themselves to admin | Route requires admin role; `req.user.id` (from JWT) is checked — admins cannot change their own role |
| 12 | **E — Elevation of Privilege** | Course enrollment | Student passes a different `student_id` in the request body to enroll another student, or accesses admin-only grade updates | `student_id` always taken from `req.user.id` (JWT), never from request body; grade update restricted to admin/instructor |

---

## 6. Secure Coding Practices Summary

| Practice | Implementation |
|----------|---------------|
| Input validation | `express-validator` on every route — type, length, format, whitelist checks |
| Output encoding | Delegated to React frontend (auto-escaping); `.escape()` used on string fields in validator |
| Password storage | bcrypt, cost factor 12 (`bcryptjs`) |
| Secrets management | All secrets in `.env` using `dotenv`; `.env` excluded from git |
| Error handling | Centralized `errorHandler.js`; no raw errors to client in production |
| Parameterized queries | pg library with `$1, $2` placeholders on every query |
| Memory safety | Body size limits (`10kb`); file size limits (`5MB`) |
| Least privilege | DB user should only have SELECT/INSERT/UPDATE on needed tables |
| Safe dependencies | All packages from npm with known good security records |

---

## 7. Data Protection & Privacy

### Data in Transit
- HTTPS enforced in production (configure via reverse proxy — nginx/Caddy with TLS certificate)
- HSTS header enabled in production via Helmet (`max-age: 31536000`)
- Sensitive data never passed in URL query parameters (passwords, tokens)

### Data at Rest
- Passwords stored only as bcrypt hashes — plaintext never written to disk or logs
- JWT secret stored in environment variable, not in code
- Uploaded files renamed to UUIDs — original filenames stored only in DB, not on disk
- Audit logs capture IP addresses for accountability but are access-controlled (admin only)

### Data Minimization
- API responses include only necessary fields (no `password_hash`, no internal `id` where `uuid` suffices)
- Log entries redact sensitive data (emails partially masked in rate-limit logs)

---

## 8. Deployment Security Notes

For production deployment:
- Run behind a reverse proxy (nginx) with TLS termination
- Set `NODE_ENV=production` in environment
- Use a PostgreSQL user with minimum required privileges
- Enable PostgreSQL SSL (`ssl: { rejectUnauthorized: true }` in `config/db.js`)
- Set `ALLOWED_ORIGINS` to the exact frontend domain
- Rotate `JWT_SECRET` periodically and store it in a secrets manager (e.g., AWS Secrets Manager)
- Enable log rotation and alerting on repeated `LOGIN_FAILED` or `UNAUTHORIZED_ACCESS` events
- Schedule regular dependency audits: `npm audit`

---

## 9. References

- OWASP Top 10 (2021): https://owasp.org/Top10/
- OWASP ASVS v4.0: https://owasp.org/www-project-application-security-verification-standard/
- NIST SP 800-63B (Digital Identity): https://pages.nist.gov/800-63-3/sp800-63b.html
- bcrypt best practices: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- JWT security: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
- Node.js Security Checklist: https://blog.risingstack.com/node-js-security-checklist/
