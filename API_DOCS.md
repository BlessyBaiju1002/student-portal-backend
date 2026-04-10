# Student Portal — Backend API Documentation
> For: **Heli Patel (Frontend Developer)**
> Base URL: `http://localhost:5000`  
> All protected routes require: `Authorization: Bearer <token>`


## Authentication

### POST `/api/auth/register`
Create a new student account.

**Request Body:**
```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "Secure@123"
}
```
**Password rules:** min 8 chars, must include uppercase, lowercase, number, and special character (!@#$%^&*)

**Success (201):**
```json
{
  "message": "Account created successfully.",
  "user": {
    "uuid": "...",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "role": "student"
  }
}
```
**Errors:** `400` validation errors | `409` email already exists

---

### POST `/api/auth/login`
Login and receive a JWT token.

**Request Body:**
```json
{
  "email": "jane@example.com",
  "password": "Secure@123"
}
```

**Success (200):**
```json
{
  "message": "Login successful.",
  "token": "eyJhbGci...",
  "user": {
    "uuid": "...",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "role": "student"
  }
}
```
> ⚠️ Store the token in memory or `sessionStorage`. **Never `localStorage`** (XSS risk). Clear it on logout.

**Errors:** `401` wrong credentials | `429` too many attempts (locked 15 min)

---

### POST `/api/auth/logout`
🔒 Protected

Records logout in audit log. Frontend must also delete the token.

**Success (200):**
```json
{ "message": "Logged out successfully. Please delete your token client-side." }
```

---

### GET `/api/auth/me`
🔒 Protected

Get the currently logged-in user's profile.

**Success (200):**
```json
{
  "user": {
    "uuid": "...",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "role": "student"
  }
}
```

---

## Courses

### GET `/api/courses`
🔒 Protected

List/search all active courses.

**Query Parameters:**
| Param    | Type   | Required | Description                     |
|----------|--------|----------|---------------------------------|
| `search` | string | No       | Search by title or course code  |
| `page`   | int    | No       | Page number (default: 1)        |
| `limit`  | int    | No       | Results per page (default: 10)  |

**Example:** `GET /api/courses?search=security&page=1&limit=5`

**Success (200):**
```json
{
  "courses": [
    {
      "id": 1,
      "course_code": "SECU2000",
      "title": "Application Security",
      "description": "...",
      "instructor_name": "Dr. Jane Smith",
      "max_capacity": 30,
      "is_active": true
    }
  ],
  "page": 1,
  "limit": 5
}
```

---

### GET `/api/courses/:id`
Protected — Get a single course by ID.

---

### POST `/api/courses`
Admin / Instructor only

**Request Body:**
```json
{
  "course_code": "COMP9999",
  "title": "Advanced Topics",
  "description": "Optional description",
  "max_capacity": 25
}
```

---

## Grades & Enrollments

### GET `/api/grades/my`
Student — View own grades only.

**Success (200):**
```json
{
  "enrollments": [
    {
      "id": 1,
      "course_code": "SECU2000",
      "title": "Application Security",
      "grade": 88.5,
      "status": "enrolled",
      "enrolled_at": "2025-01-10T..."
    }
  ]
}
```

---

### GET `/api/grades/student/:id`
 Admin / Instructor — View any student's grades.

---

### POST `/api/grades/enroll`
Student — Enroll in a course.

**Request Body:**
```json
{ "course_id": 3 }
```

**Success (201):**
```json
{
  "message": "Enrolled successfully.",
  "enrollment": { "id": 5, "status": "enrolled", "enrolled_at": "..." }
}
```

**Errors:** `409` already enrolled or course full | `404` course not found

---

### PUT `/api/grades/:enrollmentId`
 Admin / Instructor — Post or update a grade.

**Request Body:**
```json
{
  "grade": 91.5,
  "status": "completed"
}
```

---

## File Upload

### POST `/api/upload`
 Protected — Upload a file (profile image or document).

**Request:** `multipart/form-data`
| Field     | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| `file`    | File   | Yes      | Allowed: `.jpg`, `.jpeg`, `.png`, `.pdf` (max 5MB) |
| `purpose` | string | No       | `profile_image`, `document`, `assignment`      |

**Success (201):**
```json
{
  "message": "File uploaded successfully.",
  "file": {
    "id": 1,
    "original_name": "transcript.pdf",
    "file_type": "application/pdf",
    "file_size_bytes": 204800,
    "upload_purpose": "document",
    "uploaded_at": "..."
  }
}
```

**Errors:** `400` wrong type or too large | `429` too many uploads

---

### GET `/api/upload/my-files`
Protected — List the current user's uploaded files.

---

## Admin Panel

> All routes require `role: admin`

### GET `/api/admin/stats`
Dashboard statistics: user counts by role, active courses, enrollment statuses, last 24h activity.

### GET `/api/admin/users`
List all users. Filter by `?role=student|instructor|admin`

### GET `/api/admin/users/:id`
View a specific user (no password returned).

### PUT `/api/admin/users/:id/role`
Change a user's role.
```json
{ "role": "instructor" }
```

### PUT `/api/admin/users/:id/toggle`
Activate or deactivate a user account.

### GET `/api/admin/logs`
View audit logs. Filter by `?action=LOGIN_FAILED&status=failure`

---

## Error Response Format
All errors follow this format:
```json
{
  "error": "Human-readable message here."
}
```
Validation errors return:
```json
{
  "errors": [
    { "field": "email", "msg": "A valid email address is required." }
  ]
}
```

---

## HTTP Status Codes Used
| Code | Meaning                  |
|------|--------------------------|
| 200  | OK                       |
| 201  | Created                  |
| 400  | Bad request / validation |
| 401  | Not authenticated        |
| 403  | Not authorized           |
| 404  | Not found                |
| 409  | Conflict (duplicate)     |
| 429  | Rate limit exceeded      |
| 500  | Internal server error    |

---

## How to Run Locally

```bash
# 1. Clone repo and navigate to backend folder
cd student-portal-backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 4. Create the database
psql -U postgres -c "CREATE DATABASE student_portal;"
psql -U postgres -d student_portal -f schema.sql

# 5. Start the server
npm run dev   # development (with hot reload)
npm start     # production
```

### Default Test Accounts (password: `Admin@1234`)
| Email                           | Role       |
|---------------------------------|------------|
| admin@studentportal.com         | admin      |
| jane.smith@studentportal.com    | instructor |
| john.student@studentportal.com  | student    |
