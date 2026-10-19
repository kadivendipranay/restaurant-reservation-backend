
const Reservation = require("../models/Reservation");

const getReservationInsights = async (req, res) => {
  try {
    const [
      totalReservations,
      statusCounts,
      popularSlots,
    ] = await Promise.all([
      Reservation.countDocuments(),

      Reservation.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      Reservation.aggregate([
        {
          $match: {
            status: "ACTIVE",
          },
        },
        {
          $group: {
            _id: "$timeSlot",
            count: { $sum: 1 },
          },
        },
        {
          $sort: {
            count: -1,
            _id: 1,
          },
        },
      ]),
    ]);

    const counts = {
      ACTIVE: 0,
      CANCELLED: 0,
      COMPLETED: 0,
    };

    statusCounts.forEach((item) => {
      counts[item._id] = item.count;
    });

    const cancellationRate =
      totalReservations === 0
        ? 0
        : Number(
            (
              (counts.CANCELLED / totalReservations) *
              100
            ).toFixed(2)
          );

    const mostPopularSlot = popularSlots.length
      ? {
          timeSlot: popularSlots[0]._id,
          activeReservations: popularSlots[0].count,
        }
      : null;

    const suggestions = [];

    if (totalReservations === 0) {
      suggestions.push(
        "No reservations have been recorded yet. Check back after customers start booking."
      );
    } else {
      if (cancellationRate > 20) {
        suggestions.push(
          "Cancellations exceed 20% of all reservations. Review cancellation patterns."
        );
      }

      if (mostPopularSlot) {
        suggestions.push(
          `The busiest active reservation slot is ${mostPopularSlot.timeSlot}. Consider monitoring table capacity during this period.`
        );
      }

      if (suggestions.length === 0) {
        suggestions.push(
          "Reservation activity looks stable based on the available records. Continue monitoring trends."
        );
      }
    }

    return res.json({
      success: true,
      totalReservations,
      statusCounts: counts,
      cancellationRate,
      popularSlots: popularSlots.map((slot) => ({
        timeSlot: slot._id,
        activeReservations: slot.count,
      })),
      mostPopularSlot,
      suggestions,
    });
  } catch (error) {
    console.error("Admin insights error:", error);

    return res.status(500).json({
      message: "Unable to generate reservation insights.",
    });
  }
};

module.exports = { getReservationInsights };
