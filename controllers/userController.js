import User from "../models/User.js";
import Donation from "../models/Donation.js";

export async function getProfile(req, res) {
  res.json({ success: true, user: req.user });
}
export async function updateProfile(req, res) {
  const allowed = ["name", "phone", "email", "address", "city", "state", "type"];
  for (const key of allowed) if (req.body[key] !== undefined) req.user[key] = req.body[key];
  await req.user.save();
  res.json({ success: true, user: req.user });
}
export async function listUsers(req, res) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const filter = {};
  if (req.query.search) filter.$or = [
    { name: new RegExp(req.query.search, "i") }, { phone: new RegExp(req.query.search, "i") }, { email: new RegExp(req.query.search, "i") }
  ];
  const [users, total] = await Promise.all([
    User.find(filter).select("-password").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter)
  ]);
  res.json({ success: true, users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
export async function getUserDonations(req, res) {
  const userId = req.params.userId;
  if (req.user.role !== "admin" && req.user._id.toString() !== userId) return res.status(403).json({ success: false, message: "Forbidden" });
  const donations = await Donation.find({ donor: userId, paymentStatus: "paid" }).sort({ createdAt: -1 });
  res.json({ success: true, donations });
}
