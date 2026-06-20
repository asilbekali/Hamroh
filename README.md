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

### Event Management

- Create, update, publish, and archive events
- Manage event schedules and timelines
- Monitor participant registrations
- Assign event coordinators
- Track event status

### Activity Management

- Create and manage organizational activities
- Organize activities by category
- Schedule recurring activities
- Track engagement and participation

### Participant Management

- Store participant information
- Manage registrations
- Track attendance
- Search and filter participant records

### User Management

- Administrator account management
- Role-based permissions
- User activity monitoring
- Secure authentication and authorization

### Communication System

- Automated email notifications
- Event reminders
- Announcements and updates
- Password recovery emails

### Reporting & Analytics

- Event statistics
- Participation reports
- Activity performance insights
- Administrative dashboards

---

## Technology Stack

### Backend

| Technology | Purpose |
|------------|----------|
| NestJS | Backend Framework |
| TypeScript | Application Development |
| Node.js | Runtime Environment |
| AWS EC2 | Cloud Hosting |
| AWS S3 | File Storage |
| AWS SES | Email Delivery |
| Nodemailer | Email Services |
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
 AWS Infrastructure (EC2, S3, SES)

 Authentication & Authorization
The platform implements a secure access control system based on JWT authentication and Role-Based Access Control (RBAC).
Supported Roles
Super Admin
Admin
Manager
Viewer
Each role has specific permissions and access levels to ensure secure operation across the platform.
Email Notification System
The platform uses Nodemailer and AWS services to automate communication workflows.
Supported notifications include:
Event registration confirmations
Event reminders
Activity updates
Administrative notifications
Password recovery emails
General announcements
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

About Hamroh
Hamroh is an organization focused on creating educational, cultural, and community-driven opportunities. The Hamroh Admin Panel serves as the operational platform that supports the management of programs, events, activities, and participant engagement.

## About Hamroh

Hamroh is an organization focused on creating educational, cultural, and community-driven opportunities. The Hamroh Admin Panel serves as the operational platform that supports the management of programs, events, activities, and participant engagement.
