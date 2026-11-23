import User from "../models/User.js";
import Admin from "../models/Admin.js";
import jwt from "jsonwebtoken";
import { emailPasswordResetLink } from "../utils/passwordReset.js";



// Admin Login - credentials checked from .env
export async function adminLogin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let admin = await Admin.findOne({ email: normalizedEmail }).select("+password");
  let isValidLogin = false;

  if (admin) {
    isValidLogin = admin.isActive && await admin.comparePassword(password);
  } else {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return res.status(500).json({
        success: false,
        message: "Admin credentials are not configured",
      });
    }

    if (
      normalizedEmail === adminEmail.trim().toLowerCase() &&
      password === adminPassword
    ) {
      admin = await Admin.create({
        name: "Administrator",
        email: normalizedEmail,
        password,
      });
      isValidLogin = true;
    }
  }

  if (!isValidLogin) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin credentials",
    });
  }

  const token = jwt.sign(
    { id: admin._id.toString(), email: admin.email, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );

  res.json({
    success: true,
    message: "Admin login successful",
    token,
    admin: {
      email: admin.email,
      role: "admin",
    },
  });
}

export async function sendUserPasswordReset(req, res) {
  const user = await User.findById(req.params.id);

  if (!user || !user.email) {
    return res.status(404).json({
      success: false,
      message: "User or user's email address not found",
    });
  }

  await emailPasswordResetLink(user);

  res.json({
    success: true,
    message: "Password reset link sent to the user's current email address",
  });
}

// Create donor account
export async function createUserByAdmin(req, res) {
  const { name, email, password, isActive } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Name, email and password are required",
    });
  }

  const user = await User.create({
    name,
    email,
    password,
    isActive: isActive === undefined ? true : Boolean(isActive),
  });

  res.status(201).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
    },
  });
}

// Activate / deactivate donor
export async function setUserActive(req, res) {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: Boolean(req.body.isActive) },
    { new: true, runValidators: true }
  ).select("-password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.json({
    success: true,
    user,
  });
}
