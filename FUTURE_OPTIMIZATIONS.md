# Future Optimizations for Subsyncarr+

This document outlines recommended optimizations to improve the scalability, maintenance, and user experience of Subsyncarr+, specifically tailored for large libraries (10k+ files).

## 1. Error Grouping & Aggregation

- **The Problem:** Viewing 1,000+ individual error cards is overwhelming and makes it hard to identify systemic issues (like a missing dependency).
- **The Fix:** Implement an "Error Summary" view that aggregates failures by their root cause using the permanent failure detection regexes.
- **Benefit:** Allows the user to quickly identify if a large number of failures are due to a single environmental issue or specific media patterns.

# Completed Optimizations

The following items have been successfully implemented and verified:

## 1. Immediate Task Termination (Process Management)

- **Problem:** "Stop Run" and "Skip File" buttons were previously non-immediate.
- **Solution:** Implemented PID tracking and `AbortSignal` support. The application now sends `SIGTERM` to subprocesses instantly.
- **Status:** Done.

## 2. End-to-End Pagination & Scalability

- **Problem:** Loading 13,000 files into the browser caused memory exhaustion.
- **Solution:** Implemented SQL-level pagination and infinite scroll.
- **Status:** Done.

## 3. Intelligent Failure Detection

- **Problem:** Retrying files that will never match wasted CPU.
- **Solution:** Engines now detect "Permanent Failures" and skip them in future runs.
- **Status:** Done.

## 4. Unified Audio Extraction

- **Problem:** Redundant extraction for multiple languages.
- **Solution:** Grouped subtitles by video and shared a single audio reference.
- **Status:** Done.

## 5. Context-Aware Fallback Matching

- **Problem:** Inconsistent filenames caused matching failures.
- **Solution:** Added solitary video fallback in same/parent directories.
- **Status:** Done.

## 6. Server-Side Search & Filtering

- **Problem:** Finding specific files in large runs was impossible.
- **Solution:** Added SQL-based filtering and debounced search.
- **Status:** Done.

## 7. Parallel Recursive Scanning (NFS Optimized)

- **Problem:** Sequential scanning was slow on network shares.
- **Solution:** Updated recursion to use `Promise.all` for concurrent traversal.
- **Status:** Done.

## 8. In-Memory Metadata Caching

- **Problem:** Thousands of redundant disk I/O existence checks.
- **Solution:** Built a `fileIndex` Map during scan to eliminate NFS latency.
- **Status:** Done.

## 9. Runtime Parallelism (Worker Pool)

- **Problem:** Batching left CPU idle during uneven tasks.
- **Solution:** Implemented a high-concurrency Worker Pool.
- **Status:** Done.

## 10. Stream-Based Process Execution

- **Problem:** Buffering large logs into memory.
- **Solution:** Switched to `spawn` with real-time stream processing.
- **Status:** Done.

## 11. Database "Turbo" Tuning & Maintenance

- **Problem:** SQLite was slow; database bloated over time.
- **Solution:** Applied 64MB cache, 256MB mmap, WAL mode, and daily 3 AM `VACUUM`.
- **Status:** Done.

## 12. Failure Observability (Debug Modal)

- **Problem:** Unknown failure causes.
- **Solution:** Added 🔍 button to show exact command, stderr, and stdout.
- **Status:** Done.

## 13. Darkmode UI

- **Solution:** Implemented theme persistence and OS preference detection.
- **Status:** Done.

## 14. "Dry Run" Mode

- **Problem:** Unknown impact of library-wide runs.
- **Solution:** Added scan-only mode with real-world time estimates.
- **Status:** Done.

## 15. Dependency Health Checks

- **Problem:** Missing system tools caused silent failures.
- **Solution:** Added startup verification for ffmpeg, ffprobe, and all engines.
- **Status:** Done.

## 16. Forced Re-Optimization

- **Problem:** Once a file failed permanently, it was never retried.
- **Solution:** Added global reset and 🔥 Force Rerun button to bypass cache.
- **Status:** Done.

## 17. WebSocket Delta Updates

- **Problem:** Sending 13k full objects caused network/browser lag.
- **Solution:** Implemented diff-based updates (Primary Key + Changed Fields).
- **Status:** Done.

## 18. UI State Reconciliation (Self-Healing)

- **Problem:** WebSocket messages were sometimes missed, leading to stale UI.
- **Solution:** Implemented periodic 30s background sync, Tab-Visibility refresh, and reconnection catch-up.
- **Status:** Done.

## 19. Library Dashboard & Global Stats

- **Problem:** Analyzing overall library health across thousands of files was difficult.
- **Solution:** Added a 📊 Library Dashboard with lifetime stats and engine success rates.
- **Status:** Done.

## 20. Granular & Adaptive Timeouts

- **Problem:** Global 30m timeout was too long for short clips and too short for 4K REMUXes.
- **Solution:** Implemented adaptive timeouts based on video duration (`10% duration + 60s`).
- **Status:** Done.

## 21. Automated Benchmarking (Confidence Scoring)

- **Problem:** Impossible to verify 13k syncs manually.
- **Solution:** Engines now parse and store mathematical confidence scores (0-100%) for every synchronization.
- **Status:** Done.

## 22. Cross-Engine Agreement Detection

- **Problem:** Low-quality syncs could go unnoticed.
- **Solution:** Added logic to compare results across engines. Files are now marked as "VERIFIED" (consensus found) or "SUSPICIOUS" (engines disagreed).
- **Status:** Done.

## 23. Intelligent Parameter Optimization (IPO)

- **Problem:** Default settings fail on complex audio or large time-shifts.
- **Solution:** Implemented a multi-trial loop that automatically tries deeper search profiles if initial confidence is low.
- **Status:** Done.
