import { Router } from "express";
import { getUserDetails, searchUsers, getAllUsers, deleteUser } from "../controllers/adminUserController";

const router = Router();

// GET /api/admin/users?limit=50&offset=0
router.get("/", getAllUsers);

// GET /api/admin/users/search?q=<query>
router.get("/search", searchUsers);

// GET /api/admin/users/:userId
router.get("/:userId", getUserDetails);

// DELETE /api/admin/users/:userId
router.delete("/:userId", deleteUser);

export default router;
