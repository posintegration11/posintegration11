import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { platformAdminEmails } from "../config/env.js";
import { sendDemoRequestNotification } from "../services/mail.js";

const router = Router();

const demoSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
  restaurantName: z.string().max(200).optional(),
  message: z.string().max(4000).optional(),
});

router.post("/demo-requests", async (req, res, next) => {
  try {
    const body = demoSchema.parse(req.body);
    await prisma.demoRequest.create({
      data: {
        email: body.email.trim().toLowerCase(),
        name: body.name?.trim() || null,
        restaurantName: body.restaurantName?.trim() || null,
        message: body.message?.trim() || null,
      },
    });
    const admins = platformAdminEmails();
    await sendDemoRequestNotification(admins, {
      email: body.email,
      name: body.name,
      restaurantName: body.restaurantName,
      message: body.message,
    });
    res.status(201).json({ ok: true, message: "Thanks — we'll be in touch." });
  } catch (e) {
    next(e);
  }
});

export const demoRouter = router;
