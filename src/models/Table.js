// models/Table.js
const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    tableNumber: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },
    zone: {
      type: String,
      enum: ["Main Hall", "Window", "Patio", "VIP"],
      default: "Main Hall",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Table", tableSchema);