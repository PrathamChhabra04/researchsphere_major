import express from "express";
import { searchSpecialIssues } from "../services/specialIssuesService.js";

const router = express.Router();

/**
 * GET /api/special-issues
 * Query params:
 *   query            free-text match over title, guest editors and journal
 *   secondarySubject exact secondary subject area (e.g. "Artificial Intelligence")
 *   deadline         closing window: 30d, 3m or 6m
 *   minImpactFactor  minimum journal impact factor (e.g. 5)
 *   minCiteScore     minimum journal CiteScore (e.g. 10)
 *   sort             deadline | impactFactor | citeScore
 *
 * Expired calls are removed server-side. Deadline and metric filters combine
 * with the keyword search; the default sort is the nearest deadline.
 */
router.get("/", async (req, res, next) => {
  try {
    const query = String(req.query.query || "").trim();
    const secondarySubject = String(req.query.secondarySubject || "").trim();
    const deadline = String(req.query.deadline || "").trim();
    const minImpactFactor = String(req.query.minImpactFactor || "").trim();
    const minCiteScore = String(req.query.minCiteScore || "").trim();
    const sort = String(req.query.sort || "").trim();
    const result = await searchSpecialIssues({
      query,
      secondarySubject,
      deadline,
      minImpactFactor,
      minCiteScore,
      sort,
    });

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
