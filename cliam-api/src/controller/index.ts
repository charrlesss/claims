import express from "express";
import Authentication, { ValidateToken, logout } from "./Authentication";
import { PrismaClient } from "@prisma/client";
import Claims from "./Claims";
import Imbersement from "./Imbersement";

const router = express.Router();
export const prisma = new PrismaClient(); 




router.use(Authentication);
router.use(ValidateToken);
router.use(Claims);
router.use(Imbersement);
router.get("/logout", logout);


export default router;
