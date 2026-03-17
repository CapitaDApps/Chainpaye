import { Router } from "express";
import { getUserDetails, searchUsers, getAllUsers } from "../controllers/adminUserController";

const router = Router();

// GET /api/admin/users?limit=50&offset=0&verified=true&country=NG
router.get("/", getAllUsers);

// GET /api/admin/users/search?q=<name|phone|userId>
router.get("/search", searchUsers);

// GET /api/admin/users/:userId  — lookup by userId, whatsappNumber, or _id
router.get("/:userId", getUserDetails);

export default router;
