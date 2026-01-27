# Future Optimizations for Subsyncarr+

This document outlines recommended optimizations to improve the scalability, maintenance, and user experience of Subsyncarr+, specifically tailored for large libraries (10k+ files).

## 1. WebSocket Delta Updates

- **The Problem:** Currently, the `file:updated` event sends the full file object. While mitigated by pagination, sending 13,000 full objects over the duration of a run still creates unnecessary network traffic.
- **The Fix:** Modify the event to send only the changed fields (e.g., just the `status` or the latest `engine` result).
- **Benefit:** Reduces bandwidth usage and lowers CPU overhead on both the server and the client browser.

## 2. Dependency Health Checks

- **The Problem:** If a system dependency like `ffsubsync` is missing from the `$PATH`, the application will start normally but fail every synchronization task.
- **The Fix:** On server startup, perform a check for all enabled engines and verify they are executable. Show a warning in the UI if any are missing.
- **Benefit:** Reduces user frustration by proactively identifying environment issues before a run is attempted.

## 3. File System Watcher (Real-time Sync)

- **The Problem:** Currently, syncing only happens during manual or scheduled "Full Runs." New media stays out of sync until the next scan.
- **The Fix:** Use a library like `chokidar` to monitor media directories in real-time. Automatically trigger a sync as soon as a new `.srt` or video file is detected.
- **Benefit:** Provides a "set and forget" experience where media is always synchronized immediately after download.

## 4. Priority Queue

- **The Problem:** During a full run of 13,000 files, a newly added movie might be stuck at the end of a multi-hour queue.
- **The Fix:** Implement a priority-based queue where real-time detected files or manually "bumped" files move to the front of the worker pool.
- **Benefit:** Ensures that content the user wants to watch _now_ is processed immediately without waiting for the entire library scan.

## 5. Subtitle Engine "Weighted" Logic

- **The Problem:** The system currently tries engines in a fixed order (`ffsubsync` -> `autosubsync` -> `alass`), which may not be the most efficient for every library.
- **The Fix:** Track success/failure statistics for each engine. Dynamically reorder the attempts to start with the engine that has the highest historical success rate for your specific media type.
- **Benefit:** Reduces total processing time by succeeding on the first attempt more often.

## 6. Intelligent Parameter Optimization

- **The Problem:** Subtitle engines have various parameters (thresholds, penalties, window sizes) that are currently hardcoded or left at defaults. Some files might only sync if these are tuned.
- **The Fix:** Implement an auto-tuning loop using an optimization framework (like Optuna).

* Define categorical and numerical search spaces for engine parameters.
* Optimize for multiple metrics simultaneously: synchronization quality, processing speed, and resource usage.
* Store "studies" in a persistent SQLite database to learn optimal settings over time.

- **Benefit:** Increases the overall "Match Rate" of the application by automatically finding the settings that work for edge-case media.

## 7. Automated Benchmarking & Visualization

- **The Problem:** It is difficult to know if a sync was "high quality" without manually watching the movie, and comparing engine performance is purely anecdotal.
- **The Fix:**

* Implement a `BenchmarkEvaluator` that calculates a composite score for every synchronization attempt.
* Provide a UI dashboard to visualize optimization results using contour plots, slice plots, and parameter evolution charts.
* Aggregate performance data to identify which engines/parameters are most effective for specific media codecs or genres.

- **Benefit:** Provides data-driven insights into the synchronization quality and helps the user identify potentially "shaky" matches.

## 8. Error Grouping & Aggregation

- **The Problem:** Viewing 1,000+ individual error cards is overwhelming and makes it hard to identify systemic issues (like a missing dependency).
- **The Fix:** Implement an "Error Summary" view that aggregates failures by their root cause using the permanent failure detection regexes.
- **Benefit:** Allows the user to quickly identify if a large number of failures are due to a single environmental issue or specific media patterns.

## 9. Granular & Adaptive Timeouts

- **The Problem:** While a global 30-minute timeout exists, it is often too long for short episodes and may be too short for 4K REMUX movies. A single hung process can still block a worker slot for half an hour.
- **The Fix:**

1. Implement per-engine timeouts (e.g., `ffsubsync` usually finishes in <5 mins, while `alass` may need more).
2. Implement adaptive timeouts based on video duration (e.g., `Timeout = VideoDuration * 0.1 + 60s`).

- **Benefit:** Prevents individual files from stalling the entire queue while ensuring complex matches have enough time to succeed.

## 10. Forced Re-Optimization

- **The Problem:** Once a file is marked as "Permanently Failed," it will never be retried, even if engine improvements or parameter optimizations could now succeed.
- **The Fix:** Add a "Re-Optimize Permanently Failed Files" button that resets their status and places them back into the queue for processing with the latest engine versions and parameters.
- **Benefit:** Allows users to recover from past failures and benefit from ongoing improvements in the application.

## 11. Full forced rerun option

- **The Problem:** There is currently no way to force a full re-run of all files without deleting the database.
- **The Fix:** Add a "Force Full Rerun" option that resets all file statuses and reprocesses everything from scratch, including ignoring existing optimized files.
- **Benefit:** Provides a simple way to reprocess the entire library without manual database intervention.

# Completed Optimizations

The following items have been successfully implemented and verified:

## 1. Immediate Task Termination (Process Management)

- **Problem:** "Stop Run" and "Skip File" buttons were previously non-immediate, waiting for the active engine to finish naturally.
- **Solution:** Implemented PID tracking and `AbortSignal` support. The application now sends `SIGTERM` to subprocesses instantly.
- **Status:** Done.

## 2. End-to-End Pagination & Scalability

- **Problem:** Loading 13,000 files into the browser caused memory exhaustion and crashes. Bulk operations (stopping/re-running) froze the event loop.
- **Solution:** Implemented SQL-level pagination and a "Show More" mechanism.
- **Status:** Done.

## 3. Intelligent Failure Detection

- **Problem:** Retrying files that will never match wasted massive amounts of CPU.
- **Solution:** Engines now detect "Permanent Failures" via output analysis and skip them instantly in future runs.
- **Status:** Done.

## 4. Unified Audio Extraction & Multi-Language Grouping

- **Problem:** Every engine extracted audio independently, repeating work for multiple subtitles of the same movie.
- **Solution:** Grouped subtitles by video and shared a single temporary audio extraction.
- **Status:** Done.

## 5. Context-Aware Fallback Matching

- **Problem:** Inconsistent filenames caused matching failures.
- **Solution:** Implemented a fallback to match solitary video files in the same or parent directory using dot-stripping and proximity logic.
- **Status:** Done.

## 6. Server-Side Search & Filtering

- **Problem:** Finding specific files in large runs was impossible.
- **Solution:** Added server-side SQL `LIKE` filtering and a debounced search input in the UI.
- **Status:** Done.

## 7. Infinite Scrolling (UX)

- **Problem:** Manual pagination buttons were tedious for large datasets.
- **Solution:** Implemented an `IntersectionObserver` to automatically load more results as the user scrolls.
- **Status:** Done.

## 8. Parallel Recursive Scanning

- **Problem:** `findAllSrtFiles` scanned directories sequentially, causing slow startup on large libraries (especially over network shares).
- **Solution:** Updated recursion to use `Promise.all` for concurrent directory traversal.
- **Status:** Done.

## 9. In-Memory Metadata Caching (Video Path Cache)

- **Problem:** `findMatchingVideoFile()` performed multiple redundant synchronous disk I/O operations for every file.
- **Solution:** Built a `fileIndex` Map during the initial scan and used it for all existence checks and matching logic, eliminating tens of thousands of NFS round-trips.
- **Status:** Done.

## 10. Runtime Parallelism (Worker Pool)

- **Problem:** Fixed batches (e.g., 4 at a time) left CPU cores idle if one task in the batch was slower than others.
- **Solution:** Implemented a Worker Pool pattern where a new task starts the **instant** any worker becomes free.
- **Status:** Done.

## 11. Stream-Based Process Execution

- **Problem:** `exec` buffered entire stdout/stderr into memory, causing pressure on large runs.
- **Solution:** Switched to `spawn` with real-time logging and `AbortSignal` support.
- **Status:** Done.

## 12. Granular Activity Tracking

- **Problem:** UI was "frozen" or vague during heavy phases like audio extraction or concurrent syncing.
- **Solution:** Implemented phase-based events (`extracting` vs `syncing`) and injected real-time status updates directly into individual file cards and the main progress area.
- **Status:** Done.

## 13. Database Maintenance & Automatic VACUUM

- **Problem:** SQLite databases do not reclaim disk space automatically, and history/logs clutter the DB over time.
- **Solution:** Implemented a daily maintenance task (3 AM) that deletes old runs, trims logs, and performs a full `VACUUM`.
- **Status:** Done.

## 14. Database "Turbo" Tuning

- **Problem:** Default SQLite settings were too slow for 13,000+ files.
- **Solution:** Increased cache to 64MB, enabled 256MB memory-mapping, and set `synchronous = NORMAL` for high-speed I/O.
- **Status:** Done.

## 15. Log File Lifecycle Management

- **Problem:** Every run created a unique log file on disk that was never deleted.
- **Solution:** Synchronized log file deletion with the database retention policy (30 days). Corresponding `.log` files are now deleted when a run is purged from the DB.
- **Status:** Done.

## 16. Failure Observability (Debug View)

- **Problem:** Determining the cause of an engine failure required digging through raw run logs.
- **Solution:** Added a "Debug Info" (🔍) button to failed file cards that displays the exact shell command, stderr, and stdout in a specialized modal.
- **Status:** Done.

## 17. Darkmode UI

- **Problem:** Lightmode UI was harsh for nighttime viewing.
- **Solution:** Implemented a full theme system that respects OS preferences by default and provides a manual toggle with persistence.
- **Status:** Done.

## 18. "Dry Run" Mode

- **Problem:** Committing to a full run on 13,000 files is a large time investment without knowing the impact.
- **Solution:** Added a mode that performs scan and matching only, presenting a summary of expected results and real-world time estimates.
- **Status:** Done.
