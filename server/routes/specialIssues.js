import express from "express";
import { searchSpecialIssues } from "../services/specialIssuesService.js";

const router = express.Router();

/**
 * GET /api/special-issues
 * Query params:
 *   query            free-text match over title, guest editors and journal
 *   secondarySubject exact secondary subject area (e.g. "Artificial Intelligence")
 *
 * Expired calls are removed server-side and the nearest deadline comes first.
 */
router.get("/", async (req, res, next) => {
  try {
    const query = String(req.query.query || "").trim();
    const secondarySubject = String(req.query.secondarySubject || "").trim();
    const result = await searchSpecialIssues({ query, secondarySubject });

    res.json({
      success: true,
      data: result.items,
      count: result.items.length,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
