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

    guests: { type: Number, required: true },

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

// ✅ Unique booking: 1 table + 1 date + 1 timeslot cannot be duplicated
reservationSchema.index({ table: 1, date: 1, timeSlot: 1 }, { unique: true });

module.exports = mongoose.model("Reservation", reservationSchema);
