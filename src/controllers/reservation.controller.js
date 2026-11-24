const mongoose = require("mongoose");
const Reservation = require("../models/Reservation");
const Table = require("../models/Table");
const User = require("../models/User");

const ALLOWED_SLOTS = [
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
];

const ALLOWED_OCCASIONS = [
  "None",
  "Birthday",
  "Anniversary",
  "Business",
  "Date Night",
];

const pad = (value) => String(value).padStart(2, "0");

const getLocalDateString = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function isValidObjectId(id) {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function normalizeDate(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    parsed.getFullYear() !== Number(y) ||
    parsed.getMonth() !== Number(m) - 1 ||
    parsed.getDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

function validateBookingInput({ date, timeSlot, guests }) {
  const cleanDate = normalizeDate(date);
  if (!cleanDate) {
    return { error: "Please provide a valid date in YYYY-MM-DD format." };
  }

  const today = getLocalDateString();
  if (cleanDate < today) {
    return {
      error: "Past dates are not allowed. Please choose today or a future date.",
    };
  }

  const maxDateObj = new Date();
  maxDateObj.setFullYear(maxDateObj.getFullYear() + 1);
  if (cleanDate > getLocalDateString(maxDateObj)) {
    return { error: "Bookings are allowed only within the next 12 months." };
  }

  if (!ALLOWED_SLOTS.includes(timeSlot)) {
    return {
      error: "Please select a valid time slot (17:00-18:00 to 20:00-21:00).",
    };
  }

  const guestCount = Number(guests);
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    return {
      error: "Number of guests must be a whole number between 1 and 20.",
    };
  }

  return { cleanDate, timeSlot, guestCount };
}

function sanitizeOccasion(occasion) {
  return ALLOWED_OCCASIONS.includes(occasion) ? occasion : "None";
}

function sanitizeNotes(notes) {
  return typeof notes === "string" ? notes.trim().slice(0, 200) : "";
}

async function findAvailableBestFitTable({
  date,
  timeSlot,
  guests,
  excludeReservationId = null,
}) {
  const candidateTables = await Table.find({ capacity: { $gte: guests } }).sort({
    capacity: 1,
    tableNumber: 1,
  });

  if (!candidateTables.length) {
    return {
      table: null,
      reason: "No table can accommodate this party size.",
    };
  }

  for (const table of candidateTables) {
    const query = {
      table: table._id,
      date,
      timeSlot,
      status: "ACTIVE",
    };
    if (excludeReservationId) {
      query._id = { $ne: excludeReservationId };
    }

    const conflict = await Reservation.findOne(query).lean();
    if (!conflict) {
      return { table, reason: null };
    }
  }

  return {
    table: null,
    reason: "All suitable tables are already booked for that date and time slot.",
  };
}

// =========================================================
// USER CONTROLLERS
// =========================================================

// GET /api/reservations/availability?date=YYYY-MM-DD&guests=2
const getSlotAvailability = async (req, res) => {
  try {
    const cleanDate = normalizeDate(req.query?.date);
    const rawGuests =
      req.query?.guests === undefined || req.query?.guests === ""
        ? 1
        : Number(req.query.guests);

    if (!cleanDate) {
      return res
        .status(400)
        .json({ message: "Valid date (YYYY-MM-DD) is required." });
    }

    if (!Number.isInteger(rawGuests) || rawGuests < 1 || rawGuests > 20) {
      return res
        .status(400)
        .json({ message: "Guests must be a whole number between 1 and 20." });
    }

    const [suitableTables, activeBookings] = await Promise.all([
      Table.find({ capacity: { $gte: rawGuests } })
        .select("_id capacity")
        .lean(),
      Reservation.find({ date: cleanDate, status: "ACTIVE" })
        .select("timeSlot table")
        .lean(),
    ]);

    const slots = ALLOWED_SLOTS.map((slot) => {
      const bookedTableIds = new Set(
        activeBookings
          .filter((booking) => booking.timeSlot === slot)
          .map((booking) => String(booking.table))
      );

      const availableTables = suitableTables.filter(
        (table) => !bookedTableIds.has(String(table._id))
      ).length;

      return {
        timeSlot: slot,
        availableTables,
        available: availableTables > 0,
      };
    });

    return res.json({ date: cleanDate, guests: rawGuests, slots });
  } catch (error) {
    console.error("Slot availability error:", error);
    return res
      .status(500)
      .json({ message: "Unable to check slot availability." });
  }
};

// POST /api/reservations
const createReservation = async (req, res) => {
  try {
    const { date, timeSlot, guests, occasion, specialRequests } = req.body || {};
    const validated = validateBookingInput({ date, timeSlot, guests });

    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    const { cleanDate, guestCount } = validated;

    const existingUserBooking = await Reservation.findOne({
      user: req.user.userId,
      date: cleanDate,
      timeSlot,
      status: "ACTIVE",
    }).lean();

    if (existingUserBooking) {
      return res.status(409).json({
        message:
          "You already have an active reservation for this date and time slot.",
      });
    }

    const { table, reason } = await findAvailableBestFitTable({
      date: cleanDate,
      timeSlot,
      guests: guestCount,
    });

    if (!table) {
      return res.status(409).json({ message: reason });
    }

    const reservation = await Reservation.create({
      user: req.user.userId,
      table: table._id,
      date: cleanDate,
      timeSlot,
      guests: guestCount,
      occasion: sanitizeOccasion(occasion),
      specialRequests: sanitizeNotes(specialRequests),
      status: "ACTIVE",
    });

    const populated = await Reservation.findById(reservation._id)
      .populate("user", "name email role")
      .populate("table", "tableNumber capacity zone");

    return res.status(201).json({
      message: `Reservation confirmed! Assigned Table #${table.tableNumber}.`,
      reservation: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "That table was just booked by another guest. Please try again.",
      });
    }
    console.error("Create reservation error:", error);
    return res.status(500).json({ message: "Unable to create reservation." });
  }
};

// GET /api/reservations/my
const getMyReservations = async (req, res) => {
  try {
    const filter = { user: req.user.userId };
    const { status } = req.query;

    if (
      status &&
      ["ACTIVE", "COMPLETED", "CANCELLED"].includes(status.toUpperCase())
    ) {
      filter.status = status.toUpperCase();
    }

    const reservations = await Reservation.find(filter)
      .populate("table", "tableNumber capacity zone")
      .sort({ date: -1, timeSlot: 1, createdAt: -1 });

    return res.json(reservations);
  } catch (error) {
    console.error("Get my reservations error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load your reservations." });
  }
};

// PATCH /api/reservations/:id
const updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid reservation ID." });
    }

    const reservation = await Reservation.findOne({
      _id: id,
      user: req.user.userId,
    });

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.status !== "ACTIVE") {
      return res.status(400).json({
        message: "Only active reservations can be rescheduled or modified.",
      });
    }

    const rawDate =
      req.body.date !== undefined ? req.body.date : reservation.date;
    const rawSlot =
      req.body.timeSlot !== undefined ? req.body.timeSlot : reservation.timeSlot;
    const rawGuests =
      req.body.guests !== undefined ? req.body.guests : reservation.guests;

    const validated = validateBookingInput({
      date: rawDate,
      timeSlot: rawSlot,
      guests: rawGuests,
    });

    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    const { cleanDate, timeSlot, guestCount } = validated;

    const userConflict = await Reservation.findOne({
      _id: { $ne: reservation._id },
      user: req.user.userId,
      date: cleanDate,
      timeSlot,
      status: "ACTIVE",
    }).lean();

    if (userConflict) {
      return res.status(409).json({
        message:
          "You already have another active reservation at that date and time.",
      });
    }

    const { table, reason } = await findAvailableBestFitTable({
      date: cleanDate,
      timeSlot,
      guests: guestCount,
      excludeReservationId: reservation._id,
    });

    if (!table) {
      return res.status(409).json({ message: reason });
    }

    reservation.date = cleanDate;
    reservation.timeSlot = timeSlot;
    reservation.guests = guestCount;
    reservation.table = table._id;

    if (req.body.occasion !== undefined) {
      reservation.occasion = sanitizeOccasion(req.body.occasion);
    }
    if (req.body.specialRequests !== undefined) {
      reservation.specialRequests = sanitizeNotes(req.body.specialRequests);
    }

    await reservation.save();

    const updated = await Reservation.findById(reservation._id)
      .populate("user", "name email role")
      .populate("table", "tableNumber capacity zone");

    return res.json({
      message: `Reservation updated! Assigned Table #${table.tableNumber}.`,
      reservation: updated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "That slot was just booked. Please try another time.",
      });
    }
    console.error("Update reservation error:", error);
    return res.status(500).json({ message: "Unable to update reservation." });
  }
};

// PATCH /api/reservations/:id/cancel
const cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid reservation ID." });
    }

    const reservation = await Reservation.findOne({
      _id: id,
      user: req.user.userId,
    });

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.status !== "ACTIVE") {
      return res.status(400).json({
        message: `Cannot cancel a reservation that is already ${reservation.status.toLowerCase()}.`,
      });
    }

    reservation.status = "CANCELLED";
    await reservation.save();

    return res.json({
      message: "Reservation cancelled successfully.",
      reservation,
    });
  } catch (error) {
    console.error("Cancel reservation error:", error);
    return res.status(500).json({ message: "Unable to cancel reservation." });
  }
};

// =========================================================
// ADMIN CONTROLLERS
// =========================================================

// GET /api/reservations/all
const getAllReservations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const status = (req.query.status || "").toUpperCase();
    const search = (req.query.search || "").trim();
    const date = normalizeDate(req.query.date);

    const filter = {};

    if (
      status &&
      status !== "ALL" &&
      ["ACTIVE", "CANCELLED", "COMPLETED"].includes(status)
    ) {
      filter.status = status;
    }

    if (date) {
      filter.date = date;
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matchingUsers = await User.find({
        $or: [
          { email: { $regex: escaped, $options: "i" } },
          { name: { $regex: escaped, $options: "i" } },
        ],
      })
        .select("_id")
        .lean();

      filter.user = { $in: matchingUsers.map((u) => u._id) };
    }

    const [total, data] = await Promise.all([
      Reservation.countDocuments(filter),
      Reservation.find(filter)
        .populate("user", "name email role")
        .populate("table", "tableNumber capacity zone")
        .sort({ date: -1, timeSlot: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      data,
      total,
      page,
      pages,
    });
  } catch (error) {
    console.error("Get all reservations error:", error);
    return res.status(500).json({ message: "Unable to load reservations." });
  }
};

// PATCH /api/reservations/admin-cancel/:id
const cancelReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid reservation ID." });
    }

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.status !== "ACTIVE") {
      return res.status(400).json({
        message: "Only active reservations can be cancelled.",
      });
    }

    reservation.status = "CANCELLED";
    await reservation.save();

    return res.json({
      message: "Reservation cancelled by admin.",
      reservation,
    });
  } catch (error) {
    console.error("Admin cancel error:", error);
    return res.status(500).json({ message: "Unable to cancel reservation." });
  }
};

// PATCH /api/reservations/admin-restore/:id
const restoreReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid reservation ID." });
    }

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.status !== "CANCELLED") {
      return res.status(400).json({
        message: "Only cancelled reservations can be restored.",
      });
    }

    const originalTableConflict = await Reservation.findOne({
      _id: { $ne: reservation._id },
      table: reservation.table,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      status: "ACTIVE",
    }).lean();

    if (originalTableConflict) {
      const { table: fallbackTable, reason } = await findAvailableBestFitTable({
        date: reservation.date,
        timeSlot: reservation.timeSlot,
        guests: reservation.guests,
        excludeReservationId: reservation._id,
      });

      if (!fallbackTable) {
        return res.status(409).json({
          message: `Cannot restore: original table is now booked and ${reason.toLowerCase()}`,
        });
      }

      reservation.table = fallbackTable._id;
    }

    reservation.status = "ACTIVE";
    await reservation.save();

    const populated = await Reservation.findById(reservation._id)
      .populate("user", "name email role")
      .populate("table", "tableNumber capacity zone");

    return res.json({
      message: `Reservation restored (Table #${populated.table?.tableNumber}).`,
      reservation: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Cannot restore: that table and time slot are already booked.",
      });
    }
    console.error("Admin restore error:", error);
    return res.status(500).json({ message: "Unable to restore reservation." });
  }
};

// PATCH /api/reservations/admin-complete/:id
const completeReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid reservation ID." });
    }

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.status !== "ACTIVE") {
      return res.status(400).json({
        message: "Only active reservations can be marked as completed.",
      });
    }

    reservation.status = "COMPLETED";
    await reservation.save();

    return res.json({
      message: "Reservation marked as completed.",
      reservation,
    });
  } catch (error) {
    console.error("Admin complete error:", error);
    return res.status(500).json({ message: "Unable to complete reservation." });
  }
};

module.exports = {
  getSlotAvailability,
  createReservation,
  getMyReservations,
  updateReservation,
  cancelReservation,
  getAllReservations,
  cancelReservationByAdmin,
  restoreReservationByAdmin,
  completeReservationByAdmin,
};