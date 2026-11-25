import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";
import authRoutes from "./routers/authRoutes.js";
import userRoutes from "./routers/userRoutes.js";
import packageRoutes from "./routers/packageRoutes.js";
import donationRoutes from "./routers/donationRoutes.js";
import bookingRoutes from "./routers/bookingRoutes.js";
import enquiryRoutes from "./routers/enquiryRoutes.js";
import pujaUpdateRoutes from "./routers/pujaUpdateRoutes.js";
import adminRoutes from "./routers/adminRoutes.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/errorMiddleware.js";

const app = express();
await connectDB();

app.use(helmet());
app.use(cors({
  origin: (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map(v => v.trim()),
  credentials: true
}));
app.use(cookieParser());

// Razorpay webhook needs the raw request body for signature verification.
// Keep this route BEFORE express.json().
app.use("/api/donations/razorpay/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => res.json({ success: true, status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/bookVisits", enquiryRoutes);
app.use("/api/puja-updates", pujaUpdateRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
