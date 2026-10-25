
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
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from the .env file");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");

    for (const tableData of tables) {
      await Table.findOneAndUpdate(
        { tableNumber: tableData.tableNumber },
        { $set: { capacity: tableData.capacity } },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );
    }

    console.log("Tables seeded successfully");
    console.log("Existing tables were preserved.");

  } catch (error) {
    console.error("Seeding error:", error.message);
    process.exitCode = 1;

  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed");
  }
}

seed();
