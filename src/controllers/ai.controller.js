
const chatWithAI = async (req, res) => {
  try {
    const { message } = req.body;

    // Validate input
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        reply: "Please enter a question.",
      });
    }

    if (message.length > 500) {
      return res.status(400).json({
        reply: "Please keep your question under 500 characters.",
      });
    }

    const question = message.trim().toLowerCase();

    // Handle cancellation questions FIRST
    const cancellationWords = ["cancel", "cancellation"];

    if (
      cancellationWords.some((word) =>
        question.includes(word)
      )
    ) {
      return res.json({
        reply:
          "To cancel a reservation, log in and open My Reservations. Select the reservation you want to cancel and use the cancellation option.",
      });
    }

    // FAQ collection
    const faqs = [
      {
        keywords: ["hello", "hi", "hey", "good morning"],
        answer:
          "Hello! Welcome to our restaurant reservation service. How can I help you today?",
      },
      {
        keywords: ["time", "slot", "timing", "hours"],
        answer:
          "The configured reservation slots are 5 PM–6 PM, 6 PM–7 PM, 7 PM–8 PM, and 8 PM–9 PM. Please check the booking page for current availability.",
      },
      {
        keywords: ["login", "log in", "sign in", "password"],
        answer:
          "Open the login page and enter your registered email and password. If you don't have an account, register first.",
      },
      {
        keywords: ["register", "registration", "sign up", "account"],
        answer:
          "Open the registration page, enter your name, email, and password, and submit the form to create your account.",
      },
      {
        keywords: ["status", "my reservation", "my booking"],
        answer:
          "Log in to your account and open My Reservations to view your reservation details and status.",
      },
      {
        keywords: ["admin", "administrator"],
        answer:
          "Administrators can manage reservations through the admin dashboard after logging in with an authorized admin account.",
      },
      {
        keywords: ["thank", "thanks"],
        answer: "You're welcome! I'm happy to help.",
      },
      {
        keywords: ["help", "what can you do"],
        answer:
          "I can help with registration, login, table reservations, booking time slots, cancellation, and reservation status. What would you like to know?",
      },
      {
        keywords: ["book", "booking", "reservation", "reserve", "table"],
        answer:
          "To reserve a table, log in to your account, open the reservation page, select a date, time slot, and number of guests, then submit your booking.",
      },
    ];

    // Match the first relevant FAQ
    const matchedFaq = faqs.find((faq) =>
      faq.keywords.some((keyword) => {
        const escaped = keyword.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        return new RegExp(`\\b${escaped}\\b`, "i").test(
          question
        );
      })
    );

    return res.json({
      reply:
        matchedFaq?.answer ||
        "I don't have an answer for that yet. Try asking about booking a table, cancellation, login, or reservation time slots.",
    });
  } catch (error) {
    console.error("FAQ chatbot error:", error.message);

    return res.status(500).json({
      reply: "Sorry, something went wrong. Please try again.",
    });
  }
};

module.exports = { chatWithAI };
