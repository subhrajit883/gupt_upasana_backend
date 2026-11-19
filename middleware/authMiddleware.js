
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Donor authentication
export async function protect(req, res, next) {
  try {
    const headerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;

    const token = headerToken || req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject Admin token
    // if (decoded.role !== "user") {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Donor access required",
    //   });
    // }

    const user = await User.findById(decoded.id).select("-password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is unavailable",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

// Admin authentication
export async function protectAdmin(req, res, next) {
  try {
    const headerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;

    const token = headerToken || req.cookies?.adminToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.id !== "admin" || decoded.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    req.admin = {
      id: "admin",
      email: process.env.ADMIN_EMAIL,
      role: "admin",
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired admin token",
    });
  }
}

// Admin authorization
export const adminOnly = (req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};
