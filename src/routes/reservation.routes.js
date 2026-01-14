const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

const reservationController = require("../controllers/reservation.controller");

// USER routes
router.post("/", authMiddleware, reservationController.createReservation);
router.get("/my", authMiddleware, reservationController.getMyReservations);
router.patch(
  "/:id/cancel",
  authMiddleware,
  reservationController.cancelReservation
);

// ADMIN route
router.get(
  "/all",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.getAllReservations
);

module.exports = router;
