
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");

// Generate JWT token
const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

// REGISTER
const register = async (req, res) => {
  try {
    let { name, email, password } = req.body;

    name = typeof name === "string" ? name.trim() : "";
    email = typeof email === "string"
      ? email.trim().toLowerCase()
      : "";

    if (
      !name ||
      !email ||
      typeof password !== "string" ||
      !password.trim()
    ) {
      return res.status(400).json({
        message: "Name, Email, and Password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return res.status(400).json({
        message: "Please provide a valid email address",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: "USER",
    });

    const token = generateToken(user);

    return res.status(201).json({
      message: "User registered successfully",
      token,
      role: user.role,
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error.message);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    if (error.message === "JWT_SECRET is not configured") {
      return res.status(500).json({
        message: "Server configuration error",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    let { email, password } = req.body;

    email = typeof email === "string"
      ? email.trim().toLowerCase()
      : "";

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Email and Password are required",
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      message: "Login successful",
      token,
      role: user.role,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error.message);

    if (error.message === "JWT_SECRET is not configured") {
      return res.status(500).json({
        message: "Server configuration error",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

// Create email transporter from environment variables
const createMailTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Email service is not configured");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

// FORGOT PASSWORD
const forgotPassword = async (req, res) => {
  let user;

  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    user = await User.findOne({ email });

    // Do not disclose whether this email is registered.
    if (!user) {
      return res.status(200).json({
        message: "If an account exists, a reset link will be sent.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      throw new Error("FRONTEND_URL is not configured");
    }

    const resetUrl =
      `${frontendUrl.replace(/\/$/, "")}/#/reset-password/${rawToken}`;

    const transporter = createMailTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: "Reset your ReserveDine password",
      text: `You requested a password reset. Open this link within 15 minutes:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `
        <p>You requested a password reset for your ReserveDine account.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link expires in 15 minutes. If you did not request this, ignore this email.</p>
      `,
    });

    return res.status(200).json({
      message: "If an account exists, a reset link will be sent.",
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error.message);

    // Invalidate the token if email delivery failed.
    if (user) {
      try {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
      } catch (cleanupError) {
        console.error("RESET TOKEN CLEANUP ERROR:", cleanupError.message);
      }
    }

    return res.status(500).json({
      message: "Unable to process the request right now. Please try again later.",
    });
  }
};

// RESET PASSWORD
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/i.test(token) ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid reset request",
      });
    }

    if (password.length < 8 || !password.trim()) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({
        message: "Reset link is invalid or expired. Please request a new one.",
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // User.js pre-save hook hashes the new password.
    await user.save();

    return res.status(200).json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error.message);

    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
};
