require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const authRoutes = require("./src/routes/auth.routes");
const reservationRoutes = require("./src/routes/reservation.routes");
const authMiddleware = require("./src/middlewares/auth.middleware");
const roleMiddleware = require("./src/middlewares/role.middleware");

const app = express();

// middleware
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("API working");
});

// protected test route
app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "Access granted",
    user: req.user,
  });
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);

// db + server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully");
    app.listen(5000, () => {
      console.log("Server started on port 5000");
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
  });
