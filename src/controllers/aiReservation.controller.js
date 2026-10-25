const Reservation = require("../models/Reservation");
const Table = require("../models/Table");

const ALLOWED_TIME_SLOTS = [
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
];

const pad = (value) => String(value).padStart(2, "0");
const localDateString = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function normalizeDate(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d)
  ) return null;
  return `${y}-${m}-${d}`;
}

function slotFromHour(hour) {
  if (hour === 17) return "17:00-18:00";
  if (hour === 18) return "18:00-19:00";
  if (hour === 19) return "19:00-20:00";
  if (hour === 20) return "20:00-21:00";
  return null;
}

// Local fallback parser, used when OPENAI_API_KEY is not configured or unavailable.
function fallbackParse(message) {
  const text = message.toLowerCase();
  const today = new Date();
  let date = null;

  if (/\b(today|tonight)\b/.test(text)) {
    date = localDateString(today);
  } else if (/\b(tomorrow|tmrw)\b/.test(text)) {
    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);
    date = localDateString(nextDay);
  } else {
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
    if (iso) date = iso[1];
    else if (dmy) date = `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }

  let hour = null;
  const twelveHour = text.match(/\b(5|6|7|8)\s*(?::\s*00)?\s*(pm|p\.m\.?)\b/);
  const twentyFourHour = text.match(/\b(17|18|19|20)(?::00)?\b/);
  if (twelveHour) hour = Number(twelveHour[1]) + 12;
  else if (twentyFourHour) hour = Number(twentyFourHour[1]);
  else if (/\b(5\s*to\s*6|5-6)\b/.test(text)) hour = 17;
  else if (/\b(6\s*to\s*7|6-7)\b/.test(text)) hour = 18;
  else if (/\b(7\s*to\s*8|7-8)\b/.test(text)) hour = 19;
  else if (/\b(8\s*to\s*9|8-9)\b/.test(text)) hour = 20;

  const guestsMatch = text.match(/\b(\d{1,2})\s*(?:people|persons|guests|adults|of us|pax)\b/) ||
    text.match(/\btable\s+for\s+(\d{1,2})\b/) ||
    text.match(/\bfor\s+(\d{1,2})\b/);

  return {
    date,
    timeSlot: hour === null ? null : slotFromHour(hour),
    guests: guestsMatch ? Number(guestsMatch[1]) : null,
  };
}

async function parseWithOpenAI(message) {
  if (!process.env.OPENAI_API_KEY) return null;

  const today = localDateString();
  const prompt = [
    "Extract restaurant reservation details from the user's message.",
    `Today's local date is ${today}.`,
    "Return only a JSON object with keys date, timeSlot, guests.",
    "date must be YYYY-MM-DD or null. Resolve today, tomorrow, and weekday references relative to today's date.",
    "timeSlot must be exactly one of: 17:00-18:00, 18:00-19:00, 19:00-20:00, 20:00-21:00, or null.",
    "Map 5 PM to 17:00-18:00, 6 PM to 18:00-19:00, 7 PM to 19:00-20:00, and 8 PM to 20:00-21:00.",
    "guests must be an integer or null. Do not guess missing information.",
    `User message: ${message}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: prompt,
      max_output_tokens: 120,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenAI reservation parsing failed:", response.status, errorBody.slice(0, 300));
    return null;
  }

  const data = await response.json();
  const outputText = data.output_text ||
    (data.output || []).flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n");
  if (!outputText) return null;

  const jsonText = outputText.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return null;
  const parsed = JSON.parse(jsonText);
  return {
    date: normalizeDate(parsed.date),
    timeSlot: ALLOWED_TIME_SLOTS.includes(parsed.timeSlot) ? parsed.timeSlot : null,
    guests: Number.isInteger(Number(parsed.guests)) && parsed.guests !== null
      ? Number(parsed.guests)
      : null,
  };
}

async function parseReservation(req, res) {
  try {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Please describe your preferred date, time, and number of guests." });
    }
    if (message.length > 500) {
      return res.status(400).json({ message: "Please keep your request under 500 characters." });
    }

    let details = null;
    try {
      details = await parseWithOpenAI(message.trim());
    } catch (error) {
      console.error("AI extraction error:", error.message);
    }
    if (!details) details = fallbackParse(message.trim());

    details.date = normalizeDate(details.date);
    details.timeSlot = ALLOWED_TIME_SLOTS.includes(details.timeSlot) ? details.timeSlot : null;
    details.guests = Number.isInteger(details.guests) ? details.guests : null;

    const missing = [];
    if (!details.date) missing.push("date (for example, tomorrow or 2026-11-02)");
    if (!details.timeSlot) missing.push("time (5 PM, 6 PM, 7 PM, or 8 PM)");
    if (!details.guests || details.guests < 1 || details.guests > 20) missing.push("party size (1–20 guests)");

    if (missing.length) {
      return res.json({
        ready: false,
        details,
        message: `I still need your ${missing.join(", ")}. Please include these details in your request.`,
        allowedTimeSlots: ALLOWED_TIME_SLOTS,
      });
    }

    const validation = validateDetails(details);
    if (validation) {
      return res.status(400).json({ ready: false, details, message: validation, allowedTimeSlots: ALLOWED_TIME_SLOTS });
    }

    const availability = await checkAvailability(details, req.user.userId);
    return res.json({
      ready: true,
      details,
      availability,
      message: availability.available
        ? "I found a suitable table. Review the details below and confirm to book."
        : "That option is not available. Try another time slot or date.",
    });
  } catch (error) {
    console.error("AI reservation preparation error:", error);
    return res.status(500).json({ message: "Unable to prepare this reservation right now. Please try again." });
  }
}

function validateDetails(details) {
  const date = normalizeDate(details.date);
  if (!date) return "Please provide a valid date in YYYY-MM-DD format.";
  if (date < localDateString()) return "Past dates are not allowed. Please choose today or a future date.";

  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  if (date > localDateString(maxDate)) return "Bookings are allowed only within the next year.";

  if (!ALLOWED_TIME_SLOTS.includes(details.timeSlot)) {
    return "Please choose one of the available time slots: 5 PM, 6 PM, 7 PM, or 8 PM.";
  }
  if (!Number.isInteger(details.guests) || details.guests < 1 || details.guests > 20) {
    return "Party size must be a whole number from 1 to 20.";
  }
  return null;
}

async function checkAvailability(details, userId) {
  const alreadyBooked = await Reservation.findOne({
    user: userId,
    date: details.date,
    timeSlot: details.timeSlot,
    status: "ACTIVE",
  });
  if (alreadyBooked) {
    return { available: false, reason: "You already have an active reservation for this date and time slot." };
  }

  const tables = await Table.find({ capacity: { $gte: details.guests } }).sort({ capacity: 1 });
  if (!tables.length) return { available: false, reason: "No table can accommodate this party size." };

  for (const table of tables) {
    const conflict = await Reservation.findOne({
      table: table._id,
      date: details.date,
      timeSlot: details.timeSlot,
      status: "ACTIVE",
    });
    if (!conflict) {
      return {
        available: true,
        table: { tableNumber: table.tableNumber, capacity: table.capacity },
      };
    }
  }
  return { available: false, reason: "All suitable tables are booked for that time slot." };
}

async function confirmReservation(req, res) {
  try {
    const { date, timeSlot, guests, confirmed } = req.body || {};
    if (confirmed !== true) {
      return res.status(400).json({ message: "Explicit confirmation is required before booking." });
    }

    const details = { date: normalizeDate(date), timeSlot, guests: Number(guests) };
    const validation = validateDetails(details);
    if (validation) return res.status(400).json({ message: validation });

    const availability = await checkAvailability(details, req.user.userId);
    if (!availability.available) {
      return res.status(409).json({
        message: availability.reason || "This slot is no longer available. Please check another time.",
        availability,
      });
    }

    const table = await Table.findOne({
      tableNumber: availability.table.tableNumber,
      capacity: { $gte: details.guests },
    });
    if (!table) return res.status(409).json({ message: "The suggested table is no longer available. Please try again." });

    // Recheck just before writing; the unique partial index remains the final concurrency guard.
    const conflict = await Reservation.findOne({
      table: table._id, date: details.date, timeSlot: details.timeSlot, status: "ACTIVE",
    });
    if (conflict) return res.status(409).json({ message: "That slot was just booked. Please choose another time." });

    const reservation = await Reservation.create({
      user: req.user.userId,
      table: table._id,
      date: details.date,
      timeSlot: details.timeSlot,
      guests: details.guests,
      status: "ACTIVE",
    });
    const fullReservation = await Reservation.findById(reservation._id)
      .populate("user", "name email role")
      .populate("table", "tableNumber capacity");

    return res.status(201).json({
      message: "Reservation created successfully.",
      reservation: fullReservation,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That table was just booked. Please choose another time." });
    }
    console.error("AI reservation confirmation error:", error);
    return res.status(500).json({ message: "Unable to complete the reservation. Please try again." });
  }
}

module.exports = { parseReservation, confirmReservation };
