DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS file_uploads CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    uuid        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    full_name   VARCHAR(100) NOT NULL,
    email       VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student', 'admin', 'instructor')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
    id              SERIAL PRIMARY KEY,
    course_code     VARCHAR(20) NOT NULL UNIQUE,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    instructor_id   INT REFERENCES users(id) ON DELETE SET NULL,
    max_capacity    INT NOT NULL DEFAULT 30,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE enrollments (
    id          SERIAL PRIMARY KEY,
    student_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    grade       NUMERIC(5, 2) CHECK (grade >= 0 AND grade <= 100),
    status      VARCHAR(20) NOT NULL DEFAULT 'enrolled'
                    CHECK (status IN ('enrolled', 'completed', 'dropped', 'pending')),
    enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, course_id)
);

CREATE TABLE file_uploads (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name   VARCHAR(255) NOT NULL,
    stored_name     VARCHAR(255) NOT NULL UNIQUE,
    file_type       VARCHAR(100) NOT NULL,
    file_size_bytes INT NOT NULL,
    upload_purpose  VARCHAR(50) NOT NULL DEFAULT 'document',
    uploaded_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    resource    VARCHAR(100),
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success', 'failure', 'warning')),
    details     JSONB,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email        ON users(email);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_audit_logs_user    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_time    ON audit_logs(created_at);

INSERT INTO users (full_name, email, password_hash, role) VALUES
('Admin User',      'admin@studentportal.com',       '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewpVnJl5v7kDxLqS', 'admin'),
('Dr. Jane Smith',  'jane.smith@studentportal.com',  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewpVnJl5v7kDxLqS', 'instructor'),
('John Student',    'john.student@studentportal.com','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewpVnJl5v7kDxLqS', 'student');

INSERT INTO courses (course_code, title, description, instructor_id) VALUES
('SECU2000', 'Application Security',  'Study of application security threats and mitigations.', 2),
('COMP1001', 'Intro to Programming',  'Basic programming concepts using Python.', 2),
('WEBD2000', 'Web Development',       'Full stack web development with Node.js and React.', 2),
('DATA3001', 'Database Design',       'Relational database design, SQL, and normalization.', 2);

INSERT INTO enrollments (student_id, course_id, status) VALUES
(3, 1, 'enrolled'),
(3, 2, 'enrolled');