import { createHash, randomBytes } from "node:crypto";
import sendEmail from "./sendEmail.js";
import dotenv from "dotenv";
dotenv.config({quiet:true});

export async function emailPasswordResetLink(user) {
  const token = randomBytes(32).toString("hex");
  user.passwordResetToken = createHash("sha256").update(token).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const configuredFrontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")[0]
    .trim();
  const absoluteFrontendUrl = /^https?:\/\//i.test(configuredFrontendUrl)
    ? configuredFrontendUrl
    : `https://${configuredFrontendUrl}`;
  const resetUrl = new URL("reset-password", `${absoluteFrontendUrl.replace(/\/+$/, "")}/`);
  resetUrl.searchParams.set("token", token);
  const fullResetUrl = resetUrl.toString();
  const htmlResetUrl = fullResetUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  await sendEmail({
    to: user.email,
    subject: "Reset your Gupt Upasana password",
    text: `Use this link to reset your password. The link expires in one hour: ${fullResetUrl}`,
    html: `<p>Use this link to reset your password. The link expires in one hour.</p><p><a href="${htmlResetUrl}">${htmlResetUrl}</a></p>`
  });
}
