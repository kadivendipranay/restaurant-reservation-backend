const Reservation = require("../models/Reservation");
const Table = require("../models/Table");

// ✅ Allowed time slots
const ALLOWED_TIME_SLOTS = [
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
];

// ✅ Auto mark old ACTIVE reservations as COMPLETED
const markCompletedReservations = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayString = today.toISOString().split("T")[0];

  await Reservation.updateMany(
    { status: "ACTIVE", date: { $lt: todayString } },
    { $set: { status: "COMPLETED" } }
  );
};

// ✅ CREATE RESERVATION
const createReservation = async (req, res) => {
  try {
    let { date, timeSlot, guests } = req.body;

    timeSlot = timeSlot?.trim();
    guests = Number(guests);

    if (!date || !timeSlot || !guests) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (Number.isNaN(guests)) {
      return res.status(400).json({ message: "Guests must be a number" });
    }

    if (guests < 1) {
      return res.status(400).json({ message: "Guests must be at least 1" });
    }

    if (guests > 20) {
      return res.status(400).json({ message: "Max guests allowed is 20" });
    }

    // ✅ validate time slot
    if (!ALLOWED_TIME_SLOTS.includes(timeSlot)) {
      return res.status(400).json({
        message: "Invalid time slot. Please select a valid slot.",
        allowedSlots: ALLOWED_TIME_SLOTS,
      });
    }

    // ✅ allow only today to next 1 year
    const reservationDate = new Date(date);
    reservationDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(today.getFullYear() + 1);

    if (reservationDate < today) {
      return res.status(400).json({ message: "Past dates not allowed" });
    }

    if (reservationDate > oneYearLater) {
      return res
        .status(400)
        .json({ message: "Booking allowed only within 1 year" });
    }

    // ✅ user already booked same slot
    const alreadyBooked = await Reservation.findOne({
      user: req.user.userId,
      date,
      timeSlot,
      status: "ACTIVE",
    });

    if (alreadyBooked) {
      return res
        .status(400)
        .json({ message: "You already have a reservation for this time slot" });
    }

    // ✅ find best table
    const tables = await Table.find({ capacity: { $gte: guests } }).sort({
      capacity: 1,
    });

    if (!tables.length) {
      return res.status(400).json({
        message: "No table available for this number of guests",
      });
    }

    for (const table of tables) {
      const conflict = await Reservation.findOne({
        table: table._id,
        date,
        timeSlot,
        status: "ACTIVE",
      });

      if (!conflict) {
        const reservation = await Reservation.create({
          user: req.user.userId,
          table: table._id,
          date,
          timeSlot,
          guests,
          status: "ACTIVE",
        });

        // ✅ Populate user + table for frontend
        const fullReservation = await Reservation.findById(reservation._id)
          .populate("user", "name email role")
          .populate("table", "tableNumber capacity");

        return res.status(201).json({
          message: "Reservation created successfully",
          reservation: fullReservation,
        });
      }
    }

    return res
      .status(400)
      .json({ message: "No tables available for this time slot" });
  } catch (error) {
    console.error("CREATE RESERVATION ERROR:", error);

    // ✅ handle duplicate booking nicely
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Table already booked for this time slot",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET MY RESERVATIONS (USER + STATUS FILTER)
const getMyReservations = async (req, res) => {
  try {
    await markCompletedReservations();

    const status = (req.query.status || "ACTIVE").toString().toUpperCase();

    let filter = {
      user: req.user.userId,
    };

    // ✅ If not ALL, filter by status
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
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET ALL RESERVATIONS (ADMIN + PAGINATION + STATUS + SEARCH + SORT)
const getAllReservations = async (req, res) => {
  try {
    await markCompletedReservations();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // ✅ status filter
    const status = (req.query.status || "ACTIVE").toString().toUpperCase();

    // ✅ search email
    const search = (req.query.search || "").toString().trim().toLowerCase();

    // ✅ sort order
    const sortOrder = (req.query.sort || "asc").toString().toLowerCase();
    const sortValue = sortOrder === "desc" ? -1 : 1;

    // ✅ base filter
    let filter = {};
    if (status !== "ALL") {
      filter.status = status;
    }

    // ✅ get all data first (because search is on populated email)
    let reservations = await Reservation.find(filter)
      .populate("user", "name email role")
      .populate("table", "tableNumber capacity")
      .sort({ date: sortValue });

    // ✅ apply search filter after populate
    if (search) {
      reservations = reservations.filter((r) =>
        r.user?.email?.toLowerCase().includes(search)
      );
    }

    const total = reservations.length;

    // ✅ apply pagination after search
    const paginatedData = reservations.slice(skip, skip + limit);

    return res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      status,
      search,
      sort: sortOrder,
      data: paginatedData,
    });
  } catch (error) {
    console.error("GET ALL RESERVATIONS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ CANCEL RESERVATION (USER cancels only their reservation)
const cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findOne({
      _id: id,
      user: req.user.userId,
      status: "ACTIVE",
    });

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    reservation.status = "CANCELLED";
    await reservation.save();

    return res.json({ message: "Reservation cancelled successfully" });
  } catch (error) {
    console.error("CANCEL RESERVATION ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ CANCEL RESERVATION (ADMIN can cancel anyone)
const cancelReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findOne({
      _id: id,
      status: "ACTIVE",
    });

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    reservation.status = "CANCELLED";
    await reservation.save();

    return res.json({ message: "Reservation cancelled by admin ✅" });
  } catch (error) {
    console.error("ADMIN CANCEL ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ RESTORE RESERVATION (ADMIN can restore CANCELLED → ACTIVE)
const restoreReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findById(id);

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    if (reservation.status !== "CANCELLED") {
      return res
        .status(400)
        .json({ message: "Only CANCELLED reservations can be restored" });
    }

    // ✅ check conflict
    const conflict = await Reservation.findOne({
      _id: { $ne: reservation._id },
      table: reservation.table,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      status: "ACTIVE",
    });

    if (conflict) {
      return res.status(400).json({
        message: "Cannot restore. This slot is already booked ✅",
      });
    }

    reservation.status = "ACTIVE";
    await reservation.save();

    return res.json({ message: "Reservation restored to ACTIVE ✅" });
  } catch (error) {
    console.error("ADMIN RESTORE ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ✅ COMPLETE RESERVATION (ADMIN can mark ACTIVE → COMPLETED)
const completeReservationByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

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

    return res.json({ message: "Reservation marked as COMPLETED ✅" });
  } catch (error) {
    console.error("ADMIN COMPLETE ERROR:", error);
    return res.status(500).json({ message: "Server error" });
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
