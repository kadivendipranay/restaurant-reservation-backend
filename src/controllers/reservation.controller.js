
const Reservation = require("../models/Reservation");
const Table = require("../models/Table");

const ALLOWED_TIME_SLOTS = [
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
];

// Use a consistent YYYY-MM-DD format based on the server's local date.
const getTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

// Mark past ACTIVE reservations as COMPLETED.
const markCompletedReservations = async () => {
  const todayString = getTodayString();

  await Reservation.updateMany(
    {
      status: "ACTIVE",
      date: { $lt: todayString },
    },
    {
      $set: { status: "COMPLETED" },
    }
  );
};

// CREATE RESERVATION
const createReservation = async (req, res) => {
  try {
    const { date, timeSlot } = req.body;
    const guests = Number(req.body.guests);
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required. Please log in again.",
      });
    }

    if (
      typeof date !== "string" ||
      typeof timeSlot !== "string" ||
      req.body.guests === undefined ||
      req.body.guests === null ||
      req.body.guests === ""
    ) {
      return res.status(400).json({
        message: "Date, time slot, and guests are required",
      });
    }

    const normalizedDate = date.trim();
    const normalizedTimeSlot = timeSlot.trim();

    if (!Number.isInteger(guests) || guests < 1) {
      return res.status(400).json({
        message: "Guests must be a positive whole number",
      });
    }

    if (guests > 20) {
      return res.status(400).json({
        message: "Maximum guests allowed is 20",
      });
    }

    if (!ALLOWED_TIME_SLOTS.includes(normalizedTimeSlot)) {
      return res.status(400).json({
        message: "Invalid time slot. Please select a valid slot.",
        allowedSlots: ALLOWED_TIME_SLOTS,
      });
    }

    // Strictly validate YYYY-MM-DD without date rollover.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return res.status(400).json({
        message: "Invalid date format. Use YYYY-MM-DD.",
      });
    }

    const [year, month, day] = normalizedDate.split("-").map(Number);
    const reservationDate = new Date(Date.UTC(year, month - 1, day));

    if (
      reservationDate.getUTCFullYear() !== year ||
      reservationDate.getUTCMonth() !== month - 1 ||
      reservationDate.getUTCDate() !== day
    ) {
      return res.status(400).json({
        message: "Invalid calendar date",
      });
    }

    const todayString = getTodayString();
    const today = new Date(`${todayString}T00:00:00Z`);
    const oneYearLater = new Date(today);
    oneYearLater.setUTCFullYear(oneYearLater.getUTCFullYear() + 1);

    const oneYearLaterString = oneYearLater.toISOString().slice(0, 10);

    if (normalizedDate < todayString) {
      return res.status(400).json({
        message: "Past dates are not allowed",
      });
    }

    if (normalizedDate > oneYearLaterString) {
      return res.status(400).json({
        message: "Booking is allowed only within one year",
      });
    }

    // TEMPORARY DIAGNOSTICS: check the exact lookup used by this request.
    console.log("BOOKING DEBUG:", {
      userId: String(userId),
      date: normalizedDate,
      timeSlot: normalizedTimeSlot,
    });

    const alreadyBooked = await Reservation.findOne({
      user: userId,
      date: normalizedDate,
      timeSlot: normalizedTimeSlot,
      status: "ACTIVE",
    });

    console.log(
      "MATCHING ACTIVE RESERVATION:",
      alreadyBooked
        ? {
            reservationId: String(alreadyBooked._id),
            userId: String(alreadyBooked.user),
            date: alreadyBooked.date,
            timeSlot: alreadyBooked.timeSlot,
            status: alreadyBooked.status,
          }
        : null
    );

    if (alreadyBooked) {
      return res.status(400).json({
        message: "You already have a reservation for this time slot",
      });
    }

    // Find suitable tables, smallest capacity first.
    const tables = await Table.find({
      capacity: { $gte: guests },
    }).sort({ capacity: 1 });

    if (!tables.length) {
      return res.status(400).json({
        message: "No table available for this number of guests",
      });
    }

    for (const table of tables) {
      const conflict = await Reservation.findOne({
        table: table._id,
        date: normalizedDate,
        timeSlot: normalizedTimeSlot,
        status: "ACTIVE",
      });

      if (conflict) {
        continue;
      }

      const reservation = await Reservation.create({
        user: userId,
        table: table._id,
        date: normalizedDate,
        timeSlot: normalizedTimeSlot,
        guests,
        status: "ACTIVE",
      });

      const fullReservation = await Reservation.findById(reservation._id)
        .populate("user", "name email role")
        .populate("table", "tableNumber capacity");

      return res.status(201).json({
        message: "Reservation created successfully",
        reservation: fullReservation,
      });
    }

    return res.status(400).json({
      message: "No tables available for this time slot",
    });
  } catch (error) {
    console.error("CREATE RESERVATION ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "A booking conflict occurred. Please refresh and try again.",
      });
    }

    return res.status(500).json({
      message: "Server error while creating reservation",
    });
  }
};

// GET MY RESERVATIONS
const getMyReservations = async (req, res) => {
  try {
    await markCompletedReservations();

    const status = String(req.query.status || "ACTIVE").toUpperCase();
    const allowedStatuses = ["ACTIVE", "CANCELLED", "COMPLETED", "ALL"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid reservation status",
      });
    }

    const filter = { user: req.user.userId };

    if (status !== "ALL") {
      filter.status = status;
    }

    const reservations = await Reservation.find(filter)
      .populate("user", "name email role")
      .populate("table", "tableNumber capacity")
      .sort({ createdAt: -1 });

    return res.json(reservations);
  } catch (error) {
    console.error("GET MY RESERVATIONS ERROR:", error);
    return res.status(500).json({
      message: "Server error while fetching reservations",
    });
  }
};

// GET ALL RESERVATIONS (ADMIN)
const getAllReservations = async (req, res) => {
  try {
    await markCompletedReservations();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 5)
    );
    const skip = (page - 1) * limit;

    const status = String(req.query.status || "ACTIVE").toUpperCase();
    const allowedStatuses = ["ACTIVE", "CANCELLED", "COMPLETED", "ALL"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid reservation status",
      });
    }

    const search = String(req.query.search || "").trim().toLowerCase();
    const sortOrder = String(req.query.sort || "asc").toLowerCase();
    const sortValue = sortOrder === "desc" ? -1 : 1;

    const filter = {};

    if (status !== "ALL") {
      filter.status = status;
    }

    let reservations = await Reservation.find(filter)
      .populate("user", "name email role")
      .populate("table", "tableNumber capacity")
      .sort({ date: sortValue, createdAt: -1 });

    if (search) {
      reservations = reservations.filter((reservation) =>
        reservation.user?.email?.toLowerCase().includes(search)
      );
    }

    const total = reservations.length;
    const data = reservations.slice(skip, skip + limit);

    return res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      status,
      search,
      sort: sortOrder,
      data,
    });
  } catch (error) {
    console.error("GET ALL RESERVATIONS ERROR:", error);
    return res.status(500).json({
      message: "Server error while fetching reservations",
    });
  }
};

// CANCEL RESERVATION (USER)
const cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        message: "Invalid reservation ID",
      });
    }

    const reservation = await Reservation.findOne({
      _id: id,
      user: req.user.userId,
      status: "ACTIVE",
    });

    if (!reservation) {
      return res.status(404).json({
        message: "Active reservation not found",
      });
    }

    reservation.status = "CANCELLED";
    await reservation.save();

    return res.json({
      message: "Reservation cancelled successfully",
    });
  } catch (error) {
    console.error("CANCEL RESERVATION ERROR:", error);
    return res.status(500).json({
      message: "Server error while cancelling reservation",
    });
  }
};

// CANCEL RESERVATION (ADMIN)
const cancelReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        message: "Invalid reservation ID",
      });
    }

    const reservation = await Reservation.findOne({
      _id: id,
      status: "ACTIVE",
    });

    if (!reservation) {
      return res.status(404).json({
        message: "Active reservation not found",
      });
    }

    reservation.status = "CANCELLED";
    await reservation.save();

    return res.json({
      message: "Reservation cancelled by admin",
    });
  } catch (error) {
    console.error("ADMIN CANCEL ERROR:", error);
    return res.status(500).json({
      message: "Server error while cancelling reservation",
    });
  }
};

// RESTORE RESERVATION (ADMIN)
const restoreReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        message: "Invalid reservation ID",
      });
    }

    const reservation = await Reservation.findById(id);

    if (!reservation) {
      return res.status(404).json({
        message: "Reservation not found",
      });
    }

    if (reservation.status !== "CANCELLED") {
      return res.status(400).json({
        message: "Only CANCELLED reservations can be restored",
      });
    }

    const conflict = await Reservation.findOne({
      _id: { $ne: reservation._id },
      table: reservation.table,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      status: "ACTIVE",
    });

    if (conflict) {
      return res.status(409).json({
        message: "Cannot restore because this table and slot are already booked",
      });
    }

    reservation.status = "ACTIVE";
    await reservation.save();

    return res.json({
      message: "Reservation restored successfully",
    });
  } catch (error) {
    console.error("ADMIN RESTORE ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Cannot restore because this table and slot are already booked",
      });
    }

    return res.status(500).json({
      message: "Server error while restoring reservation",
    });
  }
};

// COMPLETE RESERVATION (ADMIN)
const completeReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        message: "Invalid reservation ID",
      });
    }

    const reservation = await Reservation.findOne({
      _id: id,
      status: "ACTIVE",
    });

    if (!reservation) {
      return res.status(404).json({
        message: "Active reservation not found",
      });
    }

    reservation.status = "COMPLETED";
    await reservation.save();

    return res.json({
      message: "Reservation marked as completed",
    });
  } catch (error) {
    console.error("ADMIN COMPLETE ERROR:", error);
    return res.status(500).json({
      message: "Server error while completing reservation",
    });
  }
};

module.exports = {
  createReservation,
  getMyReservations,
  getAllReservations,
  cancelReservation,
  cancelReservationByAdmin,
  restoreReservationByAdmin,
  completeReservationByAdmin,
};
