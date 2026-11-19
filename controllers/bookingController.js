import crypto from "crypto";
import Booking from "../models/Booking.js";

export async function createBooking(req, res) {
  const { pujaName, pujaDate, slot, devotees, sankalp, specialRequest } = req.body;
  if (!pujaName || !pujaDate) return res.status(400).json({ success: false, message: "pujaName and pujaDate are required" });
  const booking = await Booking.create({
    bookingNo: `BK-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
    user: req.user._id, pujaName, pujaDate, slot, devotees, sankalp, specialRequest
  });
  res.status(201).json({ success: true, booking });
}
export async function myBookings(req, res) {
  const bookings = await Booking.find({ user: req.user._id }).populate("donation").sort({ createdAt: -1 });
  res.json({ success: true, bookings });
}
export async function allBookings(_req, res) {
  const bookings = await Booking.find().populate("user", "name phone email").populate("donation").sort({ createdAt: -1 }).limit(500);
  res.json({ success: true, bookings });
}
export async function updateBooking(req, res) {
  const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  res.json({ success: true, booking });
}
