
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
  { name: "Fresh Lime Soda", category: "Drink", price: 60 }
];

const timeSlots = [
  "5 PM - 6 PM",
  "6 PM - 7 PM",
  "7 PM - 8 PM",
  "8 PM - 9 PM"
];

const chatWithAI = async (req, res) => {
  try {
    const { message } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        reply: "Please enter a question."
      });
    }

    if (message.length > 500) {
      return res.status(400).json({
        reply: "Please keep your question under 500 characters."
      });
    }

    const question = message.toLowerCase();
    let reply;

    if (
      question.includes("hello") ||
      question.includes("hi") ||
      question.includes("hey")
    ) {
      reply =
        "Hello! Welcome to our restaurant. I can help you with our menu, food prices, vegetarian dishes, and reservation time slots.";
    } else if (
      question.includes("slot") ||
      question.includes("reservation time") ||
      question.includes("booking time")
    ) {
      reply =
        "Our available reservation time slots are:\n" +
        timeSlots.map((slot) => `• ${slot}`).join("\n") +
        "\nPlease check the reservation page to book a table.";
    } else if (
      question.includes("cancel") ||
      question.includes("cancellation")
    ) {
      reply =
        "To cancel a reservation, log in to your account, open your reservations, and select the cancel option for your active booking.";
    } else if (
      question.includes("vegetarian") ||
      question.includes("vegetarian food") ||
      question.includes("veg food") ||
      question.includes("non-veg") ||
      question.includes("non veg") ||
      question.includes("menu") ||
      question.includes("food") ||
      question.includes("dish") ||
      question.includes("biryani") ||
      question.includes("price") ||
      question.includes("under rs") ||
      question.includes("under ₹") ||
      question.includes("recommend") ||
      question.includes("hungry")
    ) {
      let items = foodItems;

      if (
        question.includes("vegetarian") ||
        question.includes("veg food")
      ) {
        items = items.filter(
          (item) => item.category === "Vegetarian"
        );
      } else if (
        question.includes("non-veg") ||
        question.includes("non veg")
      ) {
        items = items.filter(
          (item) => item.category === "Non-Vegetarian"
        );
      }

      const budgetMatch = question.match(
        /(?:under|below|less than)\s*(?:rs\.?|₹)?\s*(\d+)/i
      );

      if (budgetMatch) {
        const budget = Number(budgetMatch[1]);
        items = items.filter((item) => item.price <= budget);
      }

      if (items.length === 0) {
        reply =
          "Sorry, no menu items match that budget and category. Please try a different budget.";
      } else {
        reply =
          "Here are our menu suggestions:\n" +
          items
            .map(
              (item) =>
                `• ${item.name} - ₹${item.price} (${item.category})`
            )
            .join("\n");
      }
    } else if (
      question.includes("book") ||
      question.includes("table") ||
      question.includes("reservation")
    ) {
      reply =
        "You can book a table from the Reservations page. Log in, select your date, time slot, and number of guests, then submit your reservation.";
    } else if (
      question.includes("thank")
    ) {
      reply = "You're welcome! Let me know if you need help with our menu or reservations.";
    } else {
      reply =
        "I can help with our menu, food prices, vegetarian options, reservation time slots, and cancellations. What would you like to know?";
    }

    return res.json({
      reply,
      foodItems
    });
  } catch (error) {
    console.error("Restaurant chatbot error:", error.message);

    return res.status(500).json({
      reply: "Something went wrong. Please try again."
    });
  }
};

module.exports = { chatWithAI };
