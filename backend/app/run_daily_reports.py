"""
Scheduled daily task report generation.
Run via: docker exec orbit_api python -m app.run_daily_reports
Cron: 30 12 * * * (12:30 UTC = 5:30 PM PKT)

Generates:
  1. Per-user daily task summaries (all active users with assigned tasks)
  2. CEO organizational overview report
"""
import sys
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("daily_reports")


def main():
    logger.info("=== Daily Task Report Generation Started ===")
    start = datetime.utcnow()

    from app.main import SessionLocal
    from app.services.task_service import TaskService

    db = SessionLocal()
    ts = TaskService()
    try:
        # 1. Per-user reports
        logger.info("Generating per-user daily task summaries...")
        results = ts.generate_daily_reports(db)
        logger.info(f"Generated {len(results)} personal report(s):")
        for r in results:
            logger.info(f"  {r['rep_id']} ({r['name']}): {r['task_count']} tasks")

        # 2. CEO org overview
        logger.info("Generating organizational overview for CEO...")
        org_result = ts.generate_org_report(db)
        if org_result:
            logger.info(f"Org report generated for {org_result['rep_id']} ({org_result['name']}): {org_result['task_count']} total tasks")
        else:
            logger.warning("No CEO found or org report generation skipped")

        elapsed = (datetime.utcnow() - start).total_seconds()
        logger.info(f"=== Daily Report Generation Complete ({elapsed:.1f}s) ===")

    except Exception as e:
        logger.error(f"Report generation failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
