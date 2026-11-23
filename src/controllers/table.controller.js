// controllers/table.controller.js
const Table = require("../models/Table");
const Reservation = require("../models/Reservation");

const ALLOWED_ZONES = ["Main Hall", "Window", "Patio", "VIP"];

// GET /api/tables
const getAllTables = async (req, res) => {
  try {
    const tables = await Table.find().sort({ tableNumber: 1 });
    return res.json(tables);
  } catch (error) {
    console.error("Get tables error:", error);
    return res.status(500).json({ message: "Unable to load tables." });
  }
};

// POST /api/tables (ADMIN)
const createTable = async (req, res) => {
  try {
    const tableNumber = Number(req.body?.tableNumber);
    const capacity = Number(req.body?.capacity);
    const zone = ALLOWED_ZONES.includes(req.body?.zone) ? req.body.zone : "Main Hall";

    if (!Number.isInteger(tableNumber) || tableNumber < 1) {
      return res.status(400).json({ message: "Table number must be a positive whole number." });
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
      return res.status(400).json({ message: "Capacity must be between 1 and 20 guests." });
    }

    const existing = await Table.findOne({ tableNumber });
    if (existing) {
      return res.status(409).json({ message: `Table #${tableNumber} already exists.` });
    }

    const table = await Table.create({ tableNumber, capacity, zone });
    return res.status(201).json({
      message: `Table #${table.tableNumber} added successfully.`,
      table,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That table number already exists." });
    }
    console.error("Create table error:", error);
    return res.status(500).json({ message: "Unable to create table." });
  }
};

// PATCH /api/tables/:id (ADMIN)
const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await Table.findById(id);
    if (!table) {
      return res.status(404).json({ message: "Table not found." });
    }

    if (req.body.tableNumber !== undefined) {
      const tableNumber = Number(req.body.tableNumber);
      if (!Number.isInteger(tableNumber) || tableNumber < 1) {
        return res.status(400).json({ message: "Invalid table number." });
      }
      const duplicate = await Table.findOne({ tableNumber, _id: { $ne: id } });
      if (duplicate) {
        return res.status(409).json({ message: `Table #${tableNumber} already exists.` });
      }
      table.tableNumber = tableNumber;
    }

    if (req.body.capacity !== undefined) {
      const capacity = Number(req.body.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
        return res.status(400).json({ message: "Capacity must be between 1 and 20 guests." });
      }

      // Prevent shrinking capacity below an existing ACTIVE reservation's guest count
      const conflictingBooking = await Reservation.findOne({
        table: id,
        status: "ACTIVE",
        guests: { $gt: capacity },
      });
      if (conflictingBooking) {
        return res.status(409).json({
          message: `Cannot reduce capacity to ${capacity}: an active reservation on ${conflictingBooking.date} (${conflictingBooking.timeSlot}) has ${conflictingBooking.guests} guests.`,
        });
      }
      table.capacity = capacity;
    }

    if (req.body.zone && ALLOWED_ZONES.includes(req.body.zone)) {
      table.zone = req.body.zone;
    }

    await table.save();
    return res.json({ message: `Table #${table.tableNumber} updated.`, table });
  } catch (error) {
    console.error("Update table error:", error);
    return res.status(500).json({ message: "Unable to update table." });
  }
};

// DELETE /api/tables/:id (ADMIN)
const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    const activeReservations = await Reservation.countDocuments({
      table: id,
      status: "ACTIVE",
    });

    if (activeReservations > 0) {
      return res.status(409).json({
        message: `Cannot delete this table while it has ${activeReservations} active reservation(s). Cancel or reassign them first.`,
      });
    }

    const deleted = await Table.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Table not found." });
    }

    return res.json({ message: `Table #${deleted.tableNumber} deleted.` });
  } catch (error) {
    console.error("Delete table error:", error);
    return res.status(500).json({ message: "Unable to delete table." });
  }
};

// GET /api/tables/occupancy?date=YYYY-MM-DD&timeSlot=19:00-20:00 (ADMIN)
const getTableOccupancy = async (req, res) => {
  try {
    const { date, timeSlot } = req.query;
    if (!date || !timeSlot) {
      return res.status(400).json({ message: "Date and timeSlot query parameters are required." });
    }

    const [tables, activeReservations] = await Promise.all([
      Table.find().sort({ tableNumber: 1 }).lean(),
      Reservation.find({ date, timeSlot, status: "ACTIVE" })
        .populate("user", "name email")
        .lean(),
    ]);

    const bookingByTableId = new Map(
      activeReservations.map((resv) => [String(resv.table), resv])
    );

    const occupancy = tables.map((table) => {
      const booking = bookingByTableId.get(String(table._id)) || null;
      return {
        ...table,
        status: booking ? "BOOKED" : "AVAILABLE",
        reservation: booking
          ? {
              _id: booking._id,
              guests: booking.guests,
              guestName: booking.user?.name || "Guest",
              guestEmail: booking.user?.email || "",
            }
          : null,
      };
    });

    return res.json({
      date,
      timeSlot,
      totalTables: tables.length,
      bookedCount: activeReservations.length,
      availableCount: tables.length - activeReservations.length,
      occupancy,
    });
  } catch (error) {
    console.error("Table occupancy error:", error);
    return res.status(500).json({ message: "Unable to load table occupancy." });
  }
};

module.exports = {
  getAllTables,
  createTable,
  updateTable,
  deleteTable,
  getTableOccupancy,
};