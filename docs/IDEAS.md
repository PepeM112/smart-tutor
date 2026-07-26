# SmartTutor — Ideas & Future Work

Items here are not planned — they are ideas worth revisiting later.

## Token Usage Data Consolidation

**Problem**: The `token_usage` table grows by 1 row per AI call. Over months of active use, this accumulates (e.g., 10 calls/day = 3,650 rows/year). Not a problem at current scale, but if the app gains heavy usage or we add more AI features, query performance on large date ranges (1Y) could degrade.

**Proposed solution**: After 3 months, consolidate individual records into daily summaries:
1. Create a `token_usage_daily` table with pre-aggregated columns (date, provider, model, feature, total_input, total_output, total_cost, record_count)
2. A scheduled job runs monthly: aggregates records older than 90 days into daily rows, then deletes the originals
3. The query endpoint unions both tables: recent individual records + older daily summaries

**When to implement**: When the `token_usage` table exceeds ~50K rows or query response time on 1Y range exceeds 200ms. Monitor via `EXPLAIN ANALYZE` on the daily summary query.
