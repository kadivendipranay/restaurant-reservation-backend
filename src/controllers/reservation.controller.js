const Reservation = require("../models/Reservation");
const Table = require("../models/Table");

// CREATE RESERVATION
exports.createReservation = async (req, res) => {
  try {
    const { date, timeSlot, guests } = req.body;

    if (!date || !timeSlot || !guests) {
      return res.status(400).json({ message: "All fields are required" });
    }

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

    const tables = await Table.find({ capacity: { $gte: guests } }).sort({
      capacity: 1,
    });

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
        });

        return res.status(201).json({
          message: "Reservation created successfully",
          reservation,
        });
      }
    }

    return res
      .status(400)
      .json({ message: "No tables available for this time slot" });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "Table already booked for this time slot" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

// GET MY RESERVATIONS
exports.getMyReservations = async (req, res) => {
  try {
    const reservations = await Reservation.find({
      user: req.user.userId,
      status: "ACTIVE",
    })
      .populate("table", "tableNumber capacity")
      .sort({ createdAt: -1 });

    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL RESERVATIONS (ADMIN + PAGINATION)
exports.getAllReservations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const filter = { status: "ACTIVE" };

    const total = await Reservation.countDocuments(filter);

    const reservations = await Reservation.find(filter)
      .populate("user", "email role")
      .populate("table", "tableNumber capacity")
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit);

    res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      data: reservations,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// CANCEL RESERVATION
exports.cancelReservation = async (req, res) => {
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

    res.json({ message: "Reservation cancelled successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
