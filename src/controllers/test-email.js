
require("dotenv").config();
const nodemailer = require("nodemailer");

async function testEmail() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.verify();
  console.log("Gmail SMTP connection successful!");

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: process.env.SMTP_USER,
    subject: "ReserveDine SMTP Test",
    text: "Your ReserveDine email configuration is working.",
  });

  console.log("Test email sent:", result.messageId);
}

testEmail().catch((error) => {
  console.error("Email test failed:", error.message);
});
