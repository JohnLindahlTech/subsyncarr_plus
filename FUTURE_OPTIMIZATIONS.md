# Future Optimizations for Subsyncarr+

This document outlines recommended optimizations to improve the scalability, maintenance, and user experience of Subsyncarr+, specifically tailored for large libraries (10k+ files).

## 1. Intelligent Parameter Optimization

- **The Problem:** Subtitle engines have various parameters (thresholds, penalties, window sizes) that are currently hardcoded or left at defaults. Some files might only sync if these are tuned.
- **The Fix:** Implement an auto-tuning loop using an optimization framework (like Optuna).

* Define categorical and numerical search spaces for engine parameters.
* Optimize for multiple metrics simultaneously: synchronization quality, processing speed, and resource usage.
* Store "studies" in a persistent SQLite database to learn optimal settings over time.

- **Benefit:** Increases the overall "Match Rate" of the application by automatically finding the settings that work for edge-case media.

## 2. Automated Benchmarking & Visualization

- **The Problem:** It is difficult to know if a sync was "high quality" without manually watching the movie, and comparing engine performance is purely anecdotal.
- **The Fix:**

* Implement a `BenchmarkEvaluator` that calculates a composite score for every synchronization attempt.
* Provide a UI dashboard to visualize optimization results using contour plots, slice plots, and parameter evolution charts.
* Aggregate performance data to identify which engines/parameters are most effective for specific media codecs or genres.

- **Benefit:** Provides data-driven insights into the synchronization quality and helps the user identify potentially "shaky" matches.

## 3. Error Grouping & Aggregation

- **The Problem:** Viewing 1,000+ individual error cards is overwhelming and makes it hard to identify systemic issues (like a missing dependency).
- **The Fix:** Implement an "Error Summary" view that aggregates failures by their root cause using the permanent failure detection regexes.
- **Benefit:** Allows the user to quickly identify if a large number of failures are due to a single environmental issue or specific media patterns.

## 4. Granular & Adaptive Timeouts

- **The Problem:** While a global 30-minute timeout exists, it is often too long for short episodes and may be too short for 4K REMUX movies. A single hung process can still block a worker slot for half an hour.
- **The Fix:**

1. Implement per-engine timeouts (e.g., `ffsubsync` usually finishes in <5 mins, while `alass` may need more).
2. Implement adaptive timeouts based on video duration (e.g., `Timeout = VideoDuration * 0.1 + 60s`).

- **Benefit:** Prevents individual files from stalling the entire queue while ensuring complex matches have enough time to succeed.

# Completed Optimizations

The following items have been successfully implemented and verified:

## 1. Immediate Task Termination (Process Management)

- **Problem:** "Stop Run" and "Skip File" buttons were previously non-immediate.
- **Solution:** Implemented PID tracking and `AbortSignal` support.
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

- **Problem:** Finding specific files was impossible.
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
- **Solution:** Added startup verification for ffmpeg and all engines.
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
