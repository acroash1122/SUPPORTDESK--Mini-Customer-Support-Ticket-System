# SupportDesk

A mini customer support ticket system.  
**Backend:** Node.js + Express + PostgreSQL &nbsp;|&nbsp; **Frontend:** React + Vite &nbsp;|&nbsp; **Tests:** Vitest

# Video Demostration
https://www.loom.com/share/6ca2e9bf34ee45c98b2c54af97fa62fd

---

## Getting Started

### 1. Create the database
```bash
createdb supportdesk
```

### 2. Start the backend
```bash
cd server
cp .env.example .env      # set your DATABASE_URL
npm install
npm run dev               # → http://localhost:4000
```

`.env` format:
```
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/supportdesk
PORT=4000
```

> If your password contains special characters (e.g. `@`), URL-encode them:  
> `Ahsan@123` → `Ahsan%40123`

### 3. Start the frontend
Open a second terminal:
```bash
cd client
npm install
npm run dev               # → http://localhost:5173
```

### 4. Run tests
```bash
cd server
npm test
```
No database required — all tests are pure unit tests.

---

## Application Flow

Open **http://localhost:5173** in the browser. The app has a fixed sidebar with three sections:

**All Tickets**  
Displays all support tickets in a table. You can search by customer name, email, or subject, filter by priority or status, and sort by date. Urgent tickets are highlighted with a red indicator automatically — a ticket is urgent if its priority is High, or if the word "urgent" appears anywhere in the description.

**New Ticket**  
A form to submit a new support ticket. All fields are validated on the backend — submitting invalid data returns per-field error messages shown directly under each input. If the email already belongs to a previous ticket, a warning notice appears briefly before the app proceeds, so agents are aware of returning customers.

**Dashboard**  
Shows live counts of total, open, in-progress, resolved, and urgent tickets, all calculated from the database.

**Ticket Detail**  
Clicking any ticket in the list opens its full detail view. From here you can update the ticket status (Open → In Progress → Resolved) and view the full ticket history for that customer — every previous ticket filed under the same email address.
