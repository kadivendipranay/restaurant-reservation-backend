require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./src/routes/auth.routes");
const reservationRoutes = require("./src/routes/reservation.routes");
const authMiddleware = require("./src/middlewares/auth.middleware");
const roleMiddleware = require("./src/middlewares/role.middleware");

// ✅ IMPORTANT: Update this path if your model file name is different
const User = require("./src/models/User");

const app = express();             

// ✅ middleware
app.use(express.json());

// ✅ permanent dev CORS
app.use(cors({ origin: true, credentials: true }));

// ✅ test route
app.get("/", (req, res) => {
  res.send("API working");
});

// ✅ protected test route
app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "Access granted",
    user: req.user,
  });
});

// ✅ admin-only route
app.get("/api/admin-only", authMiddleware, roleMiddleware("ADMIN"), (req, res) => {
  res.json({
    message: "Admin access granted",
    user: req.user,
  });
});

// ✅ routes
app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);

// ✅ TEMP route: make a user ADMIN (remove after testing)
app.put("/api/make-admin", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const updatedUser = await User.findOneAndUpdate(
      { email },
      { role: "ADMIN" },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      message: "Updated to ADMIN",
      user: {
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ✅ db + server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully");

    // ✅ Windows localhost binding fix
    app.listen(5000, "0.0.0.0", () => {
      console.log("Server started on port 5000");
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
  });
