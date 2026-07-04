# Work Log App

A team app for custom work log forms, manager review/approval, and automatic customer email on approval.

## Quick Start

```bash
cd work-log-app
npm install
cp .env.example .env
npm start
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Accounts

| Role     | Email                    | Password     |
|----------|--------------------------|--------------|
| Employee | employee@company.com     | password123  |
| Manager  | manager@company.com      | password123  |

## How It Works

### Employees
1. Sign in and see a **list of available forms**.
2. Click a form to view all **previous submissions** in a scrollable list.
3. **View** or **edit** past submissions (pending/rejected only).
4. Click **Start New Form** to fill out and submit a new one.

### Managers
1. **Manage Forms** — create and edit custom forms with any fields needed.
2. **Review Queue** — approve or reject employee submissions.
3. **On approval**, the app emails the full report (including photos) to the customer.

### Form Builder (Managers Only)

Managers can add these field types to any form:

| Type | Use for |
|------|---------|
| Text | Short answers |
| Long Description | Multi-line text |
| Number | Hours, quantities, etc. |
| Dropdown | Predefined choices (comma-separated options) |
| Photo Upload | Site photos (total capped per form) |
| Job Details | Scope, location, equipment |
| Site Contacts | On-site contact info |
| Customer Name | Client/customer identifier |

Set **Max Photos per Submission** on each form to control the total number of images employees can upload.

## Customizing Email Addresses

There are two places email addresses are configured:

### 1. Default Customer Email (`.env`)

Set a fallback address used when employees leave the customer email field blank:

```env
DEFAULT_CUSTOMER_EMAIL=client@yourcustomer.com
```

Restart the server after changing `.env`.

### 2. Per-Report Customer Email (form field)

Employees can override the default on each submission using the **Customer Email** field on the new work log form. This is useful when different reports go to different clients.

**Priority:** form field → `DEFAULT_CUSTOMER_EMAIL` in `.env`

### 3. SMTP / Outgoing Email Settings

Configure how the app sends emails in `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=Work Logs <your-email@gmail.com>
```

#### Gmail Setup

1. Enable 2-Factor Authentication on your Google account.
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords).
3. Create an app password and paste it as `SMTP_PASS`.
4. Use your Gmail address for `SMTP_USER` and `EMAIL_FROM`.

#### Other Providers

| Provider   | SMTP Host              | Port |
|------------|------------------------|------|
| Outlook    | smtp.office365.com     | 587  |
| SendGrid   | smtp.sendgrid.net      | 587  |
| Mailgun    | smtp.mailgun.org       | 587  |

Use your provider's credentials for `SMTP_USER` and `SMTP_PASS`.

> **Note:** If SMTP is not configured, reports can still be approved — the app will log a warning and skip sending the email.

## Adding Users

Demo users are seeded on first run. To add more users, use the SQLite database:

```bash
sqlite3 db/worklogs.db
```

```sql
-- Generate a password hash first (run in Node):
-- node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"

INSERT INTO users (name, email, password_hash, role)
VALUES ('Alex Smith', 'alex@company.com', '<paste-hash-here>', 'employee');
```

Roles must be `employee` or `manager`.

## Project Structure

```
work-log-app/
├── server.js           # Entry point
├── db/database.js      # SQLite setup + seed users
├── routes/             # Auth, employee, manager routes
├── services/email.js   # Email formatting + sending
├── views/              # EJS templates
└── public/css/         # Styles
```

## Development

```bash
npm run dev   # auto-restarts on file changes (Node 18+)
```