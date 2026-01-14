require("dotenv").config();
const mongoose = require("mongoose");
const Table = require("./models/Table");

const tables = [
  { tableNumber: 1, capacity: 2 },
  { tableNumber: 2, capacity: 2 },
  { tableNumber: 3, capacity: 4 },
  { tableNumber: 4, capacity: 4 },
  { tableNumber: 5, capacity: 6 },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");

    await Table.deleteMany(); // clear existing tables (safe for dev)
    await Table.insertMany(tables);

    console.log("Tables seeded successfully");
    process.exit();
  } catch (err) {
    console.error("Seeding error:", err.message);
    process.exit(1);
  }
}

seed();
