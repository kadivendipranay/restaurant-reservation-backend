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
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    timeSlot: {
      type: String, // e.g. "18:00-20:00"
      required: true,
    },
    guests: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

// ✅ Prevent same table being booked twice for same slot
reservationSchema.index(
  { table: 1, date: 1, timeSlot: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  }
);

module.exports = mongoose.model("Reservation", reservationSchema);
