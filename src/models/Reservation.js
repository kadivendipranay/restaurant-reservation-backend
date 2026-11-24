// src/models/Reservation.js
const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    table: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true,
    },

    date: { type: String, required: true }, // "YYYY-MM-DD"
    timeSlot: { type: String, required: true },

    guests: { type: Number, required: true, min: 1, max: 20 },

    occasion: {
      type: String,
      enum: ["None", "Birthday", "Anniversary", "Business", "Date Night"],
      default: "None",
    },

    specialRequests: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

reservationSchema.index(
  { table: 1, date: 1, timeSlot: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  }
);

module.exports = mongoose.model("Reservation", reservationSchema);