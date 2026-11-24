// src/controllers/ai.controller.js
const Table = require("../models/Table");
const Reservation = require("../models/Reservation");

const ALLOWED_TIME_SLOTS = [
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
];

const foodItems = [
  { name: "Veg Biryani", category: "Vegetarian", price: 180 },
  { name: "Paneer Butter Masala", category: "Vegetarian", price: 220 },
  { name: "Masala Dosa", category: "Vegetarian", price: 100 },
  { name: "Veg Fried Rice", category: "Vegetarian", price: 150 },
  { name: "Chicken Biryani", category: "Non-Vegetarian", price: 250 },
  { name: "Grilled Chicken", category: "Non-Vegetarian", price: 280 },
  { name: "Chicken Curry", category: "Non-Vegetarian", price: 240 },
  { name: "French Fries", category: "Snack", price: 90 },
  { name: "Chocolate Brownie", category: "Dessert", price: 120 },
  { name: "Fresh Lime Soda", category: "Drink", price: 60 },
];

const formatLocalDate = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

// Fetch real-time open table counts per slot for today & tomorrow
async function getLiveAvailabilitySummary() {
  const today = formatLocalDate(0);
  const tomorrow = formatLocalDate(1);
  const dates = [today, tomorrow];

  const [tables, activeReservations] = await Promise.all([
    Table.find().select("tableNumber capacity zone").lean(),
    Reservation.find({ date: { $in: dates }, status: "ACTIVE" })
      .select("date timeSlot table")
      .lean(),
  ]);

  if (!tables.length) {
    return { today, tomorrow, summaryText: "No tables configured yet." };
  }

  const lines = [];
  for (const date of dates) {
    const label = date === today ? `Today (${date})` : `Tomorrow (${date})`;
    const slotSummaries = ALLOWED_TIME_SLOTS.map((slot) => {
      const bookedIds = new Set(
        activeReservations
          .filter((r) => r.date === date && r.timeSlot === slot)
          .map((r) => String(r.table))
      );
      const openTables = tables.filter((t) => !bookedIds.has(String(t._id)));
      const maxCap = openTables.length
        ? Math.max(...openTables.map((t) => t.capacity))
        : 0;
      return openTables.length
        ? `${slot}: ${openTables.length} open (up to ${maxCap} guests)`
        : `${slot}: Sold out`;
    });
    lines.push(`${label} -> ${slotSummaries.join(" | ")}`);
  }

  return { today, tomorrow, summaryText: lines.join("\n") };
}

// Offline/no-API-key fallback responder
function fallbackChatReply(message, availabilitySummary) {
  const question = message.toLowerCase();

  if (/\b(hello|hi|hey)\b/.test(question)) {
    return "Hello! Welcome to ReserveDine. I can help you with our menu, prices in ₹, live table availability, or booking a table.";
  }

  if (/\b(available|availability|free table|open table|tonight|today|tomorrow|slot)\b/.test(question)) {
    return (
      "Here is our live table availability:\n" +
      availabilitySummary +
      '\n\nTo book instantly, tell me something like: "Book a table for 4 tomorrow at 7 PM".'
    );
  }

  if (/\b(cancel|cancellation)\b/.test(question)) {
    return "To cancel a booking, go to My Reservations on your dashboard and click 'Cancel booking' on your active reservation.";
  }

  if (
    /\b(veg|vegetarian|non-veg|non veg|menu|food|dish|biryani|price|under|combo|recommend|hungry)\b/.test(
      question
    )
  ) {
    let items = [...foodItems];
    if (/\b(vegetarian|veg)\b/.test(question) && !/\bnon[-\s]?veg/.test(question)) {
      items = items.filter((i) => i.category === "Vegetarian");
    } else if (/\bnon[-\s]?veg/.test(question)) {
      items = items.filter((i) => i.category === "Non-Vegetarian");
    }

    const budgetMatch = question.match(/(?:under|below|less than)\s*(?:rs\.?|₹)?\s*(\d+)/i);
    if (budgetMatch) {
      const budget = Number(budgetMatch[1]);
      items = items.filter((i) => i.price <= budget);
    }

    if (!items.length) {
      return "No menu items matched that exact filter. Try increasing your budget or ask to see the full menu!";
    }

    return (
      "Here are our menu recommendations:\n" +
      items.map((item) => `• ${item.name} — ₹${item.price} (${item.category})`).join("\n")
    );
  }

  if (/\b(book|table|reservation)\b/.test(question)) {
    return 'You can book directly here by typing: "Book a table for 2 tonight at 7 PM" or using the Reserve Your Table form on your dashboard.';
  }

  if (/\bthank/.test(question)) {
    return "You're welcome! Let me know if you'd like menu suggestions or want to reserve a table.";
  }

  return "I can help with our menu (veg/non-veg & combos), live table availability, and table reservations. What would you like to check?";
}

async function generateOpenAIReply(message, availabilitySummary) {
  if (!process.env.OPENAI_API_KEY) return null;

  const menuText = foodItems
    .map((item) => `${item.name} (${item.category}) - ₹${item.price}`)
    .join("\n");

  const systemPrompt = [
    "You are the friendly AI dining assistant for ReserveDine, an Indian restaurant.",
    "Answer concisely in 2–5 short lines or clean bullet points using ₹ for prices.",
    "Use ONLY the menu and live availability provided below. Never invent dishes or fake availability.",
    'If the user wants to book a table, tell them they can type a booking request like: "Book a table for 4 tomorrow at 7 PM" to reserve immediately.',
    "\n--- MENU ---",
    menuText,
    "\n--- LIVE TABLE AVAILABILITY ---",
    availabilitySummary,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_output_tokens: 220,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("OpenAI chat error:", response.status, errText.slice(0, 250));
    return null;
  }

  const data = await response.json();
  const replyText =
    data.output_text ||
    (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n");

  return replyText ? replyText.trim() : null;
}

const chatWithAI = async (req, res) => {
  try {
    const { message } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ reply: "Please enter a question." });
    }

    if (message.length > 500) {
      return res.status(400).json({ reply: "Please keep your question under 500 characters." });
    }

    const cleanMessage = message.trim();
    const { summaryText } = await getLiveAvailabilitySummary();

    let reply = null;
    try {
      reply = await generateOpenAIReply(cleanMessage, summaryText);
    } catch (err) {
      console.error("OpenAI chat fallback triggered:", err.message);
    }

    if (!reply) {
      reply = fallbackChatReply(cleanMessage, summaryText);
    }

    return res.json({
      reply,
      foodItems,
    });
  } catch (error) {
    console.error("Restaurant chatbot error:", error.message);
    return res.status(500).json({
      reply: "Something went wrong. Please try again.",
    });
  }
};

module.exports = { chatWithAI };