# 🍽️ Restaurant Reservation System – Backend

Node.js + Express REST API for Restaurant Reservation Management System with JWT authentication and role-based access.

---

## 🚀 Live API

Backend:  
https://restaurant-reservation-backend-6va5.onrender.com

---

## 🛠 Tech Stack

- Node.js
- Express.js
- MongoDB
- JWT Authentication
- Mongoose
- Render (Deployment)

---

## ✨ Features

### Authentication

- User Register / Login
- JWT Token generation
- Role-based access (Admin / User)

---

### Reservations

- Create reservation
- View own reservations (User)
- Cancel reservation
- Admin view all reservations
- Filter by status
- Admin cancel / restore reservations

---

## 📂 API Endpoints

### Auth

- POST `/auth/register`
- POST `/auth/login`

### User

- POST `/reservations`
- GET `/reservations/my`
- PATCH `/reservations/:id/cancel`

### Admin

- GET `/reservations/all`
- PATCH `/reservations/admin-cancel/:id`
- PATCH `/reservations/admin-restore/:id`

---

## ⚙️ Setup Instructions

### 1. Clone Repository

```bash
git clone https://github.com/kadivendipranay/restaurant-reservation-backend.git
cd restaurant-reservation-backend

2. Install Dependencies
npm install

3. Create .env
PORT=5000
MONGO_URI=your_mongodb_url
JWT_SECRET=your_secret

4. Run Server
npm start

5. Start Application
npm run dev


