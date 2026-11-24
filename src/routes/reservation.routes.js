const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const reservationController = require("../controllers/reservation.controller");

// USER routes
router.post("/", authMiddleware, reservationController.createReservation);
router.get("/my", authMiddleware, reservationController.getMyReservations);
router.get(
  "/availability",
  authMiddleware,
  reservationController.getSlotAvailability
);
router.patch("/:id", authMiddleware, reservationController.updateReservation);
router.patch(
  "/:id/cancel",
  authMiddleware,
  reservationController.cancelReservation
);

// ADMIN routes
router.get(
  "/all",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.getAllReservations
);
router.patch(
  "/admin-cancel/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.cancelReservationByAdmin
);
router.patch(
  "/admin-restore/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.restoreReservationByAdmin
);
router.patch(
  "/admin-complete/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.completeReservationByAdmin
);

module.exports = router;