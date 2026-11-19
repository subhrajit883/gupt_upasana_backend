import { Router } from "express";
import { protect, protectAdmin, adminOnly } from "../middleware/authMiddleware.js";
import { createDonationOrder, verifyDonationPayment, razorpayWebhook, myDonations, getDonation, adminDonations, donationSummary } from "../controllers/donationController.js";

const router = Router();
router.post("/razorpay/webhook", razorpayWebhook); // raw body; Razorpay dashboard calls this
router.post("/create-order", protect, createDonationOrder);
router.post("/verify-payment", protect, verifyDonationPayment);
router.get("/my", protect, myDonations);
router.get("/summary", protectAdmin, adminOnly, donationSummary);
router.get("/admin/all", protectAdmin, adminOnly, adminDonations);
router.get("/:id", protect, getDonation);
export default router;
