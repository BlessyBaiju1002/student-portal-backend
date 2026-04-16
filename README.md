# Student Portal — Secure Client-Server Application
> **SECU2000 — Application Security | Group Project**

A full-stack, security-first student portal demonstrating layered architecture, OWASP Top 10 mitigations, and real-world threat modelling.

---

## Team

| Name | Role |
|------|------|
| Blessy Baiju | Backend API, Security Implementation & Frontend UI |
| Ayush Prajapati | Testing, OWASP & Documentation |
| Heli Patel | Frontend Design Planning (UI Planning) |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   FRONTEND (UI Layer)                │
│        React.js — Forms, Pages, Output Encoding      │
│        No direct DB access                           │
└────────────────────┬─────────────────────────────────┘
                     │ HTTPS / REST API
┌────────────────────▼─────────────────────────────────┐
│              BACKEND (Application Layer)             │
│  Node.js + Express                                   │
│  ┌─────────────────────────────────────────────┐    │
│  │        Security / Middleware Layer           │    │
│  │  Helmet · CORS · Rate Limiting · Validation  │    │
│  │  JWT Auth · RBAC · Logging · Error Handler   │    │
│  └─────────────────────────────────────────────┘    │
│  Routes: /auth  /courses  /grades  /upload  /admin  │
└────────────────────┬─────────────────────────────────┘
                     │ Parameterized Queries (pg)
┌────────────────────▼─────────────────────────────────┐
│              DATABASE LAYER (PostgreSQL)             │
│  users · courses · enrollments · file_uploads        │
│  audit_logs                                          │
└──────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Node.js v18+
- PostgreSQL 14+

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-group/student-portal.git
cd student-portal/backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Open .env and fill in your database credentials and JWT secret

# 4. Create database and run schema
psql -U postgres -c "CREATE DATABASE student_portal;"
psql -U postgres -d student_portal -f schema.sql

# 5. Start the server
npm run dev       # development (nodemon)
npm start         # production
```

Server starts at: `http://localhost:5000`  
Health check: `http://localhost:5000/health`

---

## Test Accounts

> Default password for all accounts: **`Admin@1234`**

| Email | Role |
|-------|------|
| admin@studentportal.com | Admin |
| jane.smith@studentportal.com | Instructor |
| john.student@studentportal.com | Student |

---

##  Security Features

### Authentication & Authorization
- Passwords hashed with **bcrypt** (cost factor 12)
- **JWT tokens** with 1-hour expiry
- **Role-Based Access Control** — Student / Instructor / Admin
- Timing-safe login (dummy hash prevents email enumeration)
- Account deactivation support

### Injection Prevention (OWASP A03)
- 100% parameterized PostgreSQL queries — no string concatenation
- Input validation on all endpoints via `express-validator.`
- Output encoding delegated to frontend

### Broken Access Control (OWASP A01)
- Students can only access their own grades/files (IDOR prevention)
- Admin routes require both authentication and an admin role
- Admins cannot demote their own account

### Security Misconfiguration (OWASP A05)
- **Helmet.js** sets all security headers (CSP, HSTS, X-Frame-Options, noSniff)
- CORS whitelist — no wildcard origins
- Stack traces suppressed in production
- `X-Powered-By` header removed

### Authentication Failures (OWASP A07)
- **Rate limiting** on login endpoint: 10 attempts per 15 min per IP
- Rate limiting on API: 100 requests per 15 min per IP
- Generic error messages (no "email not found" vs "wrong password")
- JWT expiry enforced on every request

### Logging & Monitoring (OWASP A09)
- **Winston** logs all HTTP requests and security events to rotating files
- **audit_logs** database table records all critical actions with timestamp, IP, user agent
- Logged events: login success/failure, unauthorized access, file uploads, role changes

### File Upload Security
- Server-side MIME type + extension whitelist (JPEG, PNG, PDF only)
- Max file size: 5MB (enforced by Multer, not just client)
- Files renamed to UUID on disk (prevents path traversal, overwrites, executable tricks)
- Files stored outside web root
- Only metadata returned to client, never server path

---

##  Project Structure

```
student-portal-backend/
├── server.js              # Entry point — all middleware wired here
├── schema.sql             # Database schema + seed data
├── package.json
├── .env.example           # Config template
├── .gitignore
├── API_DOCS.md            # Full API reference for frontend dev
├── config/
│   └── db.js              # PostgreSQL connection pool
├── middleware/
│   ├── auth.js            # JWT verify + RBAC authorize()
│   ├── rateLimiter.js     # express-rate-limit configs
│   └── errorHandler.js    # Centralized error handler
├── utils/
│   └── logger.js          # Winston logger
├── routes/
│   ├── auth.js            # Register, Login, Logout, /me
│   ├── courses.js         # Course CRUD + search
│   ├── grades.js          # Enrollments + grades
│   ├── upload.js          # Secure file upload
│   └── admin.js           # Admin panel routes
├── uploads/               # Stored files (gitignored)
└── logs/                  # Log files (gitignored)
```

---

##  Database Schema

```
users          → id, uuid, full_name, email, password_hash, role, is_active
courses        → id, course_code, title, instructor_id (FK), max_capacity
enrollments    → id, student_id (FK), course_id (FK), grade, status
file_uploads   → id, user_id (FK), original_name, stored_name, file_type
audit_logs     → id, user_id (FK), action, ip_address, status, details
```

---

##  API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Create student account |
| POST | `/api/auth/login` | — | Login, receive JWT |
| POST | `/api/auth/logout` | ✅ | Logout (audit log) |
| GET | `/api/auth/me` | ✅ | Current user profile |
| GET | `/api/courses` | ✅ | List/search courses |
| POST | `/api/courses` | Admin/Instructor | Create course |
| GET | `/api/grades/my` | Student | Own grades |
| POST | `/api/grades/enroll` | Student | Enroll in course |
| PUT | `/api/grades/:id` | Admin/Instructor | Update grade |
| POST | `/api/upload` | ✅ | Upload file |
| GET | `/api/admin/users` | Admin | Manage users |
| GET | `/api/admin/logs` | Admin | Audit logs |


