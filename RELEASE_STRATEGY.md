# Gray Rollout Strategy

## Goal

Ship new versions with lower risk by using a staged rollout instead of full release at once.

## Stages

1. Internal smoke (1-2 people, same day)
- Install/upgrade/uninstall
- Tracking loop and timeline live updates
- Backup export and restore

2. Small beta (5-10 users, 1-2 days)
- Real daily usage (work + idle + lock/sleep)
- Collect diagnostics for any issue
- Block full release on data-loss or severe timing bugs

3. Expanded beta (20-30 users, 2-3 days)
- Validate long-run stability and settings behavior
- Verify release notes and feedback links

4. Full rollout
- Publish release notes
- Keep rollback package ready
- Monitor incoming issue volume for 24h

## Go/No-Go Rules

- Go only if:
  - no crash/data-loss regressions
  - backup/restore path is healthy
  - focus timeline and stats stay consistent
- No-Go if:
  - restore breaks or corrupts data
  - active-session sealing fails on lock/suspend
  - severe UI freeze or startup failure appears

## Rollback Plan

- Keep previous stable installer and tag.
- If severe regression appears:
  - stop rollout
  - publish known-issue note
  - revert to previous stable build
  - request diagnostic bundle from affected users
