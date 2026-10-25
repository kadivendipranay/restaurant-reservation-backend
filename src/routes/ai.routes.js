
const express = require("express");
const router = express.Router();

const { chatWithAI } = require("../controllers/ai.controller");
const {
  parseReservation,
  confirmReservation,
} = require("../controllers/aiReservation.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.post("/chat", chatWithAI);

router.post(
  "/reservation/prepare",
  authMiddleware,
  parseReservation
);

router.post(
  "/reservation/confirm",
  authMiddleware,
  confirmReservation
);

module.exports = router;
