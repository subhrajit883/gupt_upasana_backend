import Admin from "../models/Admin.js";

export async function changeAdminPassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    !currentPassword ||
    !newPassword
  ) {
    return res.status(400).json({
      success: false,
      message: "Current password and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  const admin = await Admin.findById(req.admin.id).select("+password");
  if (!admin || !(await admin.comparePassword(currentPassword))) {
    return res.status(401).json({
      success: false,
      message: "Current password is incorrect",
    });
  }

  admin.password = newPassword;
  await admin.save();

  res.json({
    success: true,
    message: "Admin password changed successfully",
  });
}
