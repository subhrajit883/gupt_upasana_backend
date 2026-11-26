import { Router } from "express";
import { adminOnly, protect, protectAdmin } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import {
  allServiceBookings,
  createServiceBookingOrder,
  getServiceBooking,
  myServiceBookings,
  serviceBookingRazorpayWebhook,
  updateServiceBookingStatus,
  verifyServiceBookingPayment,
} from "../controllers/serviceBookingController.js";

const router = Router();

router.post("/razorpay/webhook", serviceBookingRazorpayWebhook);
router.post(
  "/create-order",
  protect,
  upload.fields([
    { name: "devoteePhoto", maxCount: 1 },
    { name: "employeePhotos", maxCount: 10 },
    { name: "familyPhotos", maxCount: 10 },
  ]),
  createServiceBookingOrder,
);
router.post("/verify-payment", protect, verifyServiceBookingPayment);
router.get("/my", protect, myServiceBookings);
router.get("/admin/all", protectAdmin, adminOnly, allServiceBookings);
router.get("/admin/:id", protectAdmin, adminOnly, getServiceBooking);
router.patch("/:id/status", protectAdmin, adminOnly, updateServiceBookingStatus);
router.get("/:id", protect, getServiceBooking);

export default router;
