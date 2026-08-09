# HAMROH Admin Panel

<p align="center">
  <img src="./assets/logo.svg" alt="Hamroh Logo" width="250"/>
</p>

<h1 align="center">HAMROH ADMIN PANEL</h1>
<p align="center">


Administrative Management Platform for Events, Activities, and Community Operations
</p>

---

## Overview

The Hamroh Admin Panel is a centralized administrative platform developed to manage and streamline organizational operations, events, activities, participant records, and internal communications.

The system provides administrators with a secure and efficient environment for creating and managing events, monitoring registrations, handling participant information, distributing announcements, and generating reports.

Built with modern technologies and cloud infrastructure, the platform is designed for scalability, security, maintainability, and long-term growth.


Official website: [https://hamroh.org](https://hamroh.org)


---

## Key Features

### Dashboard & Calendar

- Branch-scoped dashboard: an admin sees their own branch, a super admin the whole network
- Apple-Calendar style month view of every activity date
- Clicking a date reveals which activities run that day, at what time, with which trainer
- Recurring weekly schedules are expanded into concrete dates by the API

### Branch Management (Regional Split)

- Super admins create branches, each tied to one of the 14 regions of Uzbekistan
- Admins and trainers are attached to a branch and see only that branch's data
- A Samarkand admin sees Samarkand people; a Tashkent admin sees Tashkent people
- Super admins see every branch and may filter by branch or region

### User (Participant) Management

- Full name split into first name, last name and patronymic
- Full date of birth, with age derived automatically
- Address and phone number; no email is stored
- Records are numbered and sortable by name, birth date or registration date
- Admins create people inside their own branch automatically; super admins pick the branch

### Staff & Trainers

- Username + password authentication, no email anywhere
- Super admins create branch admins; branch admins create trainers
- Trainers are assignable to activities

### Activity Management

- Weekly recurring schedule: any weekdays, any start time, any duration
- Created empty — participants are attached afterwards, on the day they show up
- A trainer may run many activities, but never two that overlap in day and time
- Schedules can be expanded into concrete dates

### Attendance

- Attendance is recorded per activity, per date, per participant
- Only dates that fall on a scheduled weekday are accepted
- Capacity limits are enforced per session

### Announcements & Todo Lists

- Announcements carry a checklist of todo items
- A super admin assigns each todo to a branch admin
- Admins see their own work queue and update the status of their items

### Reporting

- Excel (.xlsx) export for participants and for activities
- Each report covers the last month, the last 3 months, or the last year
- Reports respect branch scope: admins export their branch, super admins export everything

## Technology Stack

### Backend

| Technology | Purpose |
|------------|----------|
| NestJS | Backend Framework |
| TypeScript | Application Development |
| Node.js | Runtime Environment |
| AWS EC2 | Cloud Hosting |
| AWS S3 | File Storage |
| Prisma | ORM |
| PostgreSQL 16 | Database |
| JWT | Authentication |
| RBAC | Authorization |
| REST API | API Layer |
| Docker | Containerization |

### Frontend

| Technology | Purpose |
|------------|----------|
| React | User Interface |
| TypeScript | Frontend Development |
| Material UI (MUI) | Component Library |
| TanStack Query | Server State Management |
| Axios | API Communication |
| React Router | Routing |
| React Hook Form | Form Handling |
| Jest | Testing |

---

## Architecture

```text
Client Application (React + MUI)
            │
            ▼
      REST API Layer
         (NestJS)
            │
            ▼
 Authentication & Authorization
      (JWT + RBAC)
            │
            ▼
      Database Services
            │
            ▼
 AWS Infrastructure (EC2, S3)

 Authentication & Authorization
The platform implements a secure access control system based on JWT authentication and Role-Based Access Control (RBAC).
Supported Roles
Super Admin — full access to every branch, creates branches and admins
Admin — full access to a single branch only
Trainer — runs activities and records attendance inside their branch
Each role has specific permissions and access levels to ensure secure operation across the platform.

The panel is administrator-only. There is no public registration and no outgoing email of any kind:

- Administrator accounts are created through the API by a Super Admin
- Accounts sign in with a username and password; no email address is stored
- The frontend exposes a login screen only, with no register form
- Password resets are performed by an administrator updating the account through the API

Performance & Scalability
The application is designed using a modular architecture that supports future growth and expansion.
Key considerations include:
Modular NestJS architecture
Cloud-based AWS deployment
Optimized API communication
Query caching with TanStack Query
Efficient state management
Reusable components
Maintainable code structure

Security
Security is a core component of the platform architecture.
Implemented measures include:
JWT Authentication
Role-Based Access Control (RBAC)
Request Validation
Secure Password Handling
Route Protection
Environment-Based Configuration
Secure API Communication

## About Hamroh

Hamroh is an organization focused on creating educational, cultural, and community-driven opportunities. The Hamroh Admin Panel serves as the operational platform that supports the management of programs, events, activities, and participant engagement.
