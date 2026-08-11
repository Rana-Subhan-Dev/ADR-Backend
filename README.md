# FEDARB Backend API

A RESTful backend for the FedArb ADR platform, built with **Node.js**, **Express.js**, **Prisma ORM**, and **PostgreSQL**.

## Tech Stack

| Layer           | Technology                    |
|-----------------|-------------------------------|
| Runtime         | Node.js                       |
| Framework       | Express.js 5                  |
| ORM             | Prisma 6 (multi-file schema)  |
| Database        | PostgreSQL                    |
| Auth            | JWT (`jsonwebtoken`) + `bcrypt` |
| Validation      | Joi                           |
| Logging         | Winston, Morgan               |
| Security        | Helmet, CORS, cookie-parser   |
| Package manager | pnpm                          |
| Dev tooling     | Nodemon, ESLint, Prettier     |

---

## Prerequisites

- **Node.js** v18+ (recommended v20+)
- **pnpm** (this project uses pnpm, not npm/yarn)
- **PostgreSQL** running locally or a hosted instance (Neon, Supabase, Railway, etc.)

```bash
npm install -g pnpm
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Rana-Subhan-Dev/ADR-Backend.git
cd ADR-Backend
```

### 2. Install dependencies

```bash
pnpm install
```

Do **not** use `npm install` in this project — stick to `pnpm` to avoid lockfile conflicts.

### 3. Set up environment variables

```bash
cp .env.example .env
```

Required variables (see `.env.example` for the full template)

### 4. Set up PostgreSQL

Create a database (local or hosted), then set `DATABASE_URL` in `.env`.

Local example:

```env
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/fedarb?schema=public"
```

### 5. Generate Prisma Client, migrate, and seed

Prisma uses a **multi-file schema** under `prisma/` (`user-access/` + `case-management/`). The CLI is configured via `package.json` → `"prisma": { "schema": "prisma" }`.

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm prisma:seed:admin
```

- `prisma:seed` — seeds the fixed system roles (`SUPER_ADMIN`, `CASE_MANAGER`, etc.)
- `prisma:seed:admin` — creates the bootstrap `SUPER_ADMIN` user (idempotent; skips if email already exists)

Optional: browse data in Prisma Studio:

```bash
pnpm prisma:studio
```

### 6. Run the server

```bash
pnpm dev      # development (nodemon)
pnpm start    # production
```

Default: `http://localhost:8000`

---

## Verify it's working

```bash
curl http://localhost:8000/api/health
```

```json
{
  "success": true,
  "message": "FEDARB API is running"
}
```

---

## Available Scripts

| Script                 | Description                                      |
|------------------------|--------------------------------------------------|
| `pnpm dev`             | Start dev server with auto-reload                |
| `pnpm start`           | Start production server                          |
| `pnpm prisma:generate` | Generate Prisma Client from the multi-file schema |
| `pnpm prisma:migrate`  | Create & apply a new migration (dev)             |
| `pnpm prisma:studio`   | Open Prisma Studio GUI                           |
| `pnpm prisma:seed`     | Seed system roles                                |
| `pnpm prisma:seed:admin` | Bootstrap SUPER_ADMIN user                     |

---

## Project Structure

```
FEDARB/
├── prisma/
│   ├── schema.prisma              # generator + datasource only
│   ├── user-access/               # users, roles, auth, invitations, audit…
│   ├── case-management/           # inquiries, cases, parties, hearings…
│   ├── migrations/
│   ├── seed.js                    # role seeder
│   └── seed-admin.js              # SUPER_ADMIN bootstrap
├── src/
│   ├── config/prisma.js
│   ├── constants/
│   ├── controllers/
│   ├── middlewares/               # auth, role, validate, errorHandler
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── validations/               # Joi schemas
│   ├── app.js
│   └── server.js
├── .env.example
├── package.json
└── pnpm-lock.yaml
```

Layered architecture: **Route → Controller → Service → Repository → Prisma/DB**

---

## API Overview

Base path: `/api/v1`

| Area       | Prefix          | Notes                                              |
|------------|-----------------|----------------------------------------------------|
| Auth       | `/auth`         | Invite-only signup, accept invitation, sign-in, password reset |
| Users      | `/users`        | List/update users; status changes require admin    |
| Inquiries  | `/inquiries`    | Intake + convert-to-case                           |
| Cases      | `/cases`        | Case CRUD; case manager assigned via `CaseParticipant` |

### Auth flow

1. Admin invites a user: `POST /auth/invite` (requires `SUPER_ADMIN` or `ADMIN_LEADERSHIP`)
2. Invitee accepts: `POST /auth/accept-invitation` (sets name, phone, password)
3. Sign in: `POST /auth/signin`

There is no public self-registration. `SUPER_ADMIN` is created via `pnpm prisma:seed:admin`, not via invite.

---

## Data Model (summary)

The schema is split across `prisma/user-access/` and `prisma/case-management/` (**52 models**).

Key entities:

| Domain        | Models (examples)                                      |
|---------------|--------------------------------------------------------|
| User access   | `User`, `Role`, `Permission`, `AccountInvitation`, `Session`, `PasswordResetToken`, `AuditLog` |
| Case mgmt     | `Inquiry`, `Case`, `CaseParticipant`, `CaseParty`, `Hearing`, `Document`, `Invoice`, `DocuSignEnvelope` |

`User` highlights (current schema):

| Field          | Notes                                              |
|----------------|----------------------------------------------------|
| `email`        | Unique login identifier                            |
| `passwordHash` | Nullable until invitation is accepted              |
| `phone`        | Optional                                           |
| `roleId`       | FK → `Role` (fixed `RoleName` enum)                |
| `status`       | `ACTIVE` \| `INVITED` \| `INVITE_EXPIRED` \| `DEACTIVATED` \| `LOCKED` |
| `userType`     | `INTERNAL` \| `EXTERNAL`                           |

Case manager assignment is **not** a column on `Case` — it is a primary `CaseParticipant` row with `role: CASE_MANAGER`.

---

## Troubleshooting

- **`Environment variable not found: DATABASE_URL`** → Ensure `.env` exists in the project root.
- **`Role "SUPER_ADMIN" not found`** on admin seed → Run `pnpm prisma:seed` first.
- **Port already in use** → Change `PORT` in `.env` or free the port.
- **Migration drift** → `pnpm exec prisma migrate status`; in dev only, `pnpm exec prisma migrate reset` wipes and re-applies.
