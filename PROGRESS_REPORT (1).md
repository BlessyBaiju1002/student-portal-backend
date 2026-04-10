# Progress Report — Blessy Baiju
**Role:** Backend & Security Implementation  
**Course:** SECU2000 — Application Security  
**Project:** Secure Student Portal  

---

## Work Completed

### 1. Backend Server Setup
Built the core Express.js server (`server.js`) with all security middleware integrated in the correct order:
- **Helmet.js** for HTTP security headers (CSP, X-Frame-Options, noSniff, HSTS)
- **CORS** with an explicit origin whitelist — no wildcard
- **Morgan** HTTP request logger piped into Winston
- **Body parser** with size limits (10KB max) to prevent large payload attacks
- **Global rate limiter** (100 requests / 15 min per IP)
- **Centralized error handler** — suppresses stack traces in production

### 2. Database Design and Schema
Designed and implemented a PostgreSQL schema with **5 related tables**:

| Table | Purpose |
|-------|---------|
| `users` | Stores all user accounts with bcrypt password hashes and role |
| `courses` | Course catalog with instructor FK relationship |
| `enrollments` | Student-course relationship with grade and status |
| `file_uploads` | Metadata for uploaded files (no server paths exposed) |
| `audit_logs` | Security event log (append-only via API) |

All tables include appropriate foreign keys, indexes, and constraints. Seed data included for testing.

### 3. Authentication System
Implemented in `routes/auth.js`:
- **Registration** with password complexity validation (8+ chars, upper, lower, number, special char)
- **bcrypt hashing** with cost factor 12 for secure password storage
- **JWT issuance** on login with 1-hour expiry
- **Timing-safe login** using a dummy hash to prevent email enumeration attacks
- **Generic error messages** ("Invalid email or password") — never specifying which field failed
- **Logout** with server-side audit log entry
- All routes protected with `express-validator` input validation

### 4. Authorization (RBAC) Middleware
Implemented in `middleware/auth.js`:
- `authenticate` middleware — verifies JWT, re-fetches user from DB to catch deactivated accounts
- `authorize(...roles)` middleware — checks user role against allowed roles for each route
- All failed attempts (expired token, wrong role) are written to the `audit_logs` table
- Applied at router level in `routes/admin.js` so ALL admin routes are double-protected

### 5. Secure Course Routes (`routes/courses.js`)
- Search endpoint uses **parameterized ILIKE** — completely safe from SQL injection
- Pagination via parameterized `LIMIT` / `OFFSET`
- Create/Update restricted to `admin` and `instructor` roles
- Delete is a **soft delete** (sets `is_active = FALSE`) — data is preserved for audit

### 6. Grade & Enrollment Routes (`routes/grades.js`)
- **IDOR prevention**: `GET /api/grades/my` always reads `student_id = req.user.id` from the JWT — a student cannot pass a different ID to view someone else's grades
- Grade updates require `admin` or `instructor` role
- Course capacity is checked before enrollment

### 7. Secure File Upload (`routes/upload.js`)
Security controls applied:
- **Dual validation**: MIME type whitelist AND file extension whitelist (JPEG, PNG, PDF only)
- **File size enforcement**: 5MB maximum, enforced by Multer (not just client-side)
- **UUID rename**: every uploaded file is stored with a UUID filename — prevents path traversal, filename conflicts, and executable name tricks
- Files stored **outside web root** (in `/uploads/` directory, not publicly accessible)
- Only file **metadata** is stored in the database and returned to the client — server path is never exposed
- Upload rate limit: 20 uploads per 15 minutes per IP

### 8. Admin Panel (`routes/admin.js`)
- Dashboard statistics (user counts, enrollment stats, 24h activity)
- User listing with role filter
- Role change endpoint — with guard preventing admin self-demotion
- Account activate/deactivate toggle
- **Audit log viewer** — read-only, no delete endpoint exists

### 9. Rate Limiting (`middleware/rateLimiter.js`)
Three separate limiters with different strictness:
- **apiLimiter** — 100 requests / 15 min (general API)
- **loginLimiter** — 10 failed attempts / 15 min (login brute-force protection)
- **uploadLimiter** — 20 uploads / 15 min

### 10. Security Logging (`utils/logger.js` + `audit_logs` table)
- Winston logger with rotating file transports (`combined.log`, `error.log`)
- Database `audit_logs` table captures: user ID, action type, resource, IP address, user agent, status, JSON details
- 15+ distinct security events are logged throughout the application

---

## Current Work in Progress

- Coordinating API response formats with Heli for frontend integration (see `API_DOCS.md`)
- Reviewing and testing all routes for edge cases
- Supporting Ayush with understanding which endpoints to target for security testing

---

## Challenges Encountered

1. **Timing attack on login** — Realized that checking "does email exist" before password comparison could leak whether an email is registered through response time differences. Resolved by always running `bcrypt.compare()` against a dummy hash when the user is not found.

2. **Dynamic query building for audit log filters** — Building a parameterized query with optional WHERE clauses required careful incrementing of `$N` placeholder indices to avoid injection.

3. **Multer error handling** — Multer errors do not propagate through Express's normal `next(err)` flow unless the upload middleware is called as an inline function. Wrapped it correctly to catch both Multer errors and custom file type rejections.

---
