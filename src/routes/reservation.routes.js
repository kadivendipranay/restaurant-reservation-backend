const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

const reservationController = require("../controllers/reservation.controller");

// ✅ USER routes
router.post("/", authMiddleware, reservationController.createReservation);
router.get("/my", authMiddleware, reservationController.getMyReservations);
router.patch("/:id/cancel", authMiddleware, reservationController.cancelReservation);

// ✅ ADMIN view all
router.get(
  "/all",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.getAllReservations
);

// ✅ ADMIN cancel any reservation
router.patch(
  "/admin-cancel/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.cancelReservationByAdmin
);

// ✅ ADMIN restore cancelled → active
router.patch(
  "/admin-restore/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.restoreReservationByAdmin
);

// ✅ ADMIN mark active → completed
router.patch(
  "/admin-complete/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reservationController.completeReservationByAdmin
);

module.exports = router;
