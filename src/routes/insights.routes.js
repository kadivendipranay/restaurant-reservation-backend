
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

const {
  getReservationInsights,
} = require("../controllers/insights.controller");

router.get(
  "/",
  authMiddleware,
  roleMiddleware("ADMIN"),
  getReservationInsights
);

module.exports = router;
