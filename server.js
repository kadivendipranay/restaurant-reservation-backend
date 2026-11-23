// server.js
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const aiRoutes = require("./src/routes/ai.routes");
const authRoutes = require("./src/routes/auth.routes");
const reservationRoutes = require("./src/routes/reservation.routes");
const tableRoutes = require("./src/routes/table.routes");
const insightsRoutes = require("./src/routes/insights.routes");

const authMiddleware = require("./src/middlewares/auth.middleware");
const roleMiddleware = require("./src/middlewares/role.middleware");

const app = express();

// Validate required environment variables early
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing from environment variables.");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing from environment variables.");
  process.exit(1);
}

// Allowed frontend origins
const allowedOrigins = [
  "https://restaurant-reservation-frontend-pli.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Middleware
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., Postman, curl, Render health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ReserveDine API is running",
    timestamp: new Date().toISOString(),
  });
});

// Protected test route
app.get("/api/protected", authMiddleware, (req, res) => {
  res.status(200).json({
    message: "Access granted",
    user: req.user,
  });
});

// Admin-only test route
app.get(
  "/api/admin-only",
  authMiddleware,
  roleMiddleware("ADMIN"),
  (req, res) => {
    res.status(200).json({
      message: "Admin access granted",
      user: req.user,
    });
  }
);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/insights", insightsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// Start server after MongoDB connects
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server started on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  });