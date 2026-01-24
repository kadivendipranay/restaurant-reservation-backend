const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ✅ REGISTER
const register = async (req, res) => {
  try {
    let { name, email, password, role } = req.body;

    // ✅ trim inputs
    name = name?.trim();
    email = email?.trim().toLowerCase();
    password = password?.trim();

    // ✅ validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, Email, Password required" });
    }

    // ✅ check already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // ✅ create user (DO NOT hash here, model will hash automatically)
    const user = await User.create({
      name,
      email,
      password, // ✅ plain password
      role: role || "USER",
    });

    // ✅ generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      message: "User registered successfully",
      token,
      role: user.role,
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ LOGIN
const login = async (req, res) => {
  try {
    let { email, password } = req.body;

    email = email?.trim().toLowerCase();
    password = password?.trim();

    if (!email || !password) {
      return res.status(400).json({ message: "Email and Password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ compare plain password with hashed password in DB
    const isMatch = await user.comparePassword(password); // ✅ uses model method
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Login successful",
      token,
      role: user.role,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { register, login };
