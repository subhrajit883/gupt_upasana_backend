import { Router } from "express";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { createBooking, myBookings, allBookings, updateBooking } from "../controllers/bookingController.js";

const router = Router();
router.post("/", protect, createBooking);
router.get("/my", protect, myBookings);
router.get("/admin/all", protect, adminOnly, allBookings);
router.patch("/:id", protect, adminOnly, updateBooking);
export default router;
