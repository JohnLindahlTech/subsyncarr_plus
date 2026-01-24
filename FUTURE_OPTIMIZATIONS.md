# Future Optimizations for Subsyncarr+

This document outlines recommended optimizations to improve the scalability, maintenance, and user experience of Subsyncarr+, specifically tailored for large libraries (10k+ files).

## 1. Database Maintenance (VACUUM)

- **The Problem:** SQLite databases do not automatically reclaim disk space when rows are deleted (e.g., during log trimming or clearing completed files). This leads to "file bloating" and fragmentation over time.
- **The Fix:** Implement an automatic `VACUUM` command that runs during weekly maintenance or after a large deletion.
- **Benefit:** Keeps the database file small, ensures fast query performance, and reduces disk I/O.

## 2. Log File Lifecycle Management

- **The Problem:** Every run creates a unique log file on disk. With frequent runs on large datasets, the `logs/` directory will eventually accumulate thousands of files, consuming inodes and disk space.
- **The Fix:** Synchronize the log file deletion with the database retention policy (currently 30 days). When a run is purged from the database, its corresponding `.log` file should be deleted from the filesystem.
- **Benefit:** Prevents disk clutter and ensures the application is a "good citizen" on the host OS.

## 3. WebSocket Delta Updates

- **The Problem:** Currently, the `file:updated` event sends the full file object. While mitigated by pagination, sending 13,000 full objects over the duration of a run still creates unnecessary network traffic.
- **The Fix:** Modify the event to send only the changed fields (e.g., just the `status` or the latest `engine` result).
- **Benefit:** Reduces bandwidth usage and lowers CPU overhead on both the server and the client browser.

## 4. Runtime Parallelism (Worker Pool)

- **The Problem:** Currently, the engine processes files in fixed batches (e.g., 4 at a time). It waits for the slowest file in a batch to finish before starting the next group, leading to idle CPU cores.
- **The Fix:** Implement a "Worker Pool" pattern where a new file begins processing the **instant** any worker becomes free.
- **Benefit:** Maximizes CPU utilization and significantly reduces total run time for large libraries.

## 5. Video Path Resolution Cache

- **The Problem:** The system calls `findMatchingVideoFile()` multiple times for every file (pre-check, DB insertion, processing start). Each call performs multiple synchronous disk I/O operations.
- **The Fix:** Resolve the video path once during the initial scan and propagate that path through the event system.
- **Benefit:** Eliminates tens of thousands of redundant "file exists" system calls, speeding up the scan phase.

## 6. Parallel Recursive Scanning

- **The Problem:** `findAllSrtFiles` scans directories sequentially (one after another).
- **The Fix:** Update the recursion to use `Promise.all` when entering subdirectories.
- **Benefit:** Leverages the high IOPS of modern SSDs/NVMe drives to finish the initial file scan much faster.

## 7. Stream-Based Process Execution (`spawn`)

- **The Problem:** `exec` buffers the entire stdout/stderr of subprocesses into memory. For thousands of files, this can lead to memory pressure.
- **The Fix:** Switch from `exec` to `spawn` and stream the output directly to the log manager.
- **Benefit:** Reduces the application's memory footprint and allows for real-time log viewing without waiting for a process to complete.

## 8. Failure Observability (Debug View)

- **The Problem:** When an engine fails, the user only sees a "Red" card. Determining the cause requires digging through the raw run logs.
- **The Fix:** Add a "Debug Info" button to failed file cards that displays the exact shell command executed and the last 20 lines of `stderr`.
- **Benefit:** Allows users to quickly diagnose issues like missing dependencies, codec errors, or unmatchable audio.

## 9. Improved Video Matching (Multi-Stage)

- **The Problem:** Current video matching is limited to the same directory and simple filename manipulation. It misses subtitles stored in subdirectories (e.g., `Subs/` or `Subtitles/`) or those with complex language tags (e.g., `movie.en.forced.srt`).
- **The Fix:** Implement a multi-stage resolver that checks adjacent subfolders and uses fuzzy name matching or language tag stripping.
- **Benefit:** Significantly increases the "Match Rate" for complex media collections.

## 10. "Dry Run" Mode

- **The Problem:** Committing to a full run on 13,000 files is a large time investment. Users don't know the impact until processing starts.
- **The Fix:** Add a mode that performs the scan and video matching phase only, presenting a summary of expected results (matches found, files missing video, estimated time).
- **Benefit:** Gives users confidence and transparency before starting a resource-intensive operation.

## 11. Dependency Health Checks

- **The Problem:** If a system dependency like `ffsubsync` is missing from the `$PATH`, the application will start normally but fail every synchronization task.
- **The Fix:** On server startup, perform a check for all enabled engines and verify they are executable. Show a warning in the UI if any are missing.
- **Benefit:** Reduces user frustration by proactively identifying environment issues before a run is attempted.

## 12. File System Watcher (Real-time Sync)

- **The Problem:** Currently, syncing only happens during manual or scheduled "Full Runs." New media stays out of sync until the next scan.
- **The Fix:** Use a library like `chokidar` to monitor media directories in real-time. Automatically trigger a sync as soon as a new `.srt` or video file is detected.
- **Benefit:** Provides a "set and forget" experience where media is always synchronized immediately after download.

## 13. Priority Queue

- **The Problem:** During a full run of 13,000 files, a newly added movie might be stuck at the end of a multi-hour queue.
- **The Fix:** Implement a priority-based queue where real-time detected files or manually "bumped" files move to the front of the worker pool.
- **Benefit:** Ensures that content the user wants to watch _now_ is processed immediately without waiting for the entire library scan.

## 14. Subtitle Engine "Weighted" Logic

- **The Problem:** The system currently tries engines in a fixed order (`ffsubsync` -> `autosubsync` -> `alass`), which may not be the most efficient for every library.
- **The Fix:** Track success/failure statistics for each engine. Dynamically reorder the attempts to start with the engine that has the highest historical success rate for your specific media type.
- **Benefit:** Reduces total processing time by succeeding on the first attempt more often.

## 15. Intelligent Parameter Optimization

- **The Problem:** Subtitle engines have various parameters (thresholds, penalties, window sizes) that are currently hardcoded or left at defaults. Some files might only sync if these are tuned.
- **The Fix:** Implement an auto-tuning loop using an optimization framework (like Optuna).

* Define categorical and numerical search spaces for engine parameters.
* Optimize for multiple metrics simultaneously: synchronization quality, processing speed, and resource usage.
* Store "studies" in a persistent SQLite database to learn optimal settings over time.

- **Benefit:** Increases the overall "Match Rate" of the application by automatically finding the settings that work for edge-case media.

## 16. Automated Benchmarking & Visualization

- **The Problem:** It is difficult to know if a sync was "high quality" without manually watching the movie, and comparing engine performance is purely anecdotal.
- **The Fix:**

* Implement a `BenchmarkEvaluator` that calculates a composite score for every synchronization attempt.
* Provide a UI dashboard to visualize optimization results using contour plots, slice plots, and parameter evolution charts.
* Aggregate performance data to identify which engines/parameters are most effective for specific media codecs or genres.

- **Benefit:** Provides data-driven insights into the synchronization quality and helps the user identify potentially "shaky" matches.

## 17. Database "Turbo" Tuning

- **The Problem:** The current SQLite cache is set to 1MB, which is insufficient for tracking 10k+ files and their multi-engine results efficiently.
- **The Fix:** Increase `cache_size` to 64MB+ and set `synchronous = NORMAL` to optimize write speeds while maintaining WAL safety.
- **Benefit:** Ensures that UI pagination and filtering remains instantaneous as the library grows.

## 18. Error Grouping & Aggregation

- **The Problem:** Viewing 1,000+ individual error cards is overwhelming and makes it hard to identify systemic issues (like a missing dependency).
- **The Fix:** Implement an "Error Summary" view that aggregates failures by their root cause using the permanent failure detection regexes.
- **Benefit:** Allows the user to quickly identify if a large number of failures are due to a single environmental issue or specific media patterns.

## 19. Granular & Adaptive Timeouts

- **The Problem:** While a global 30-minute timeout exists, it is often too long for short episodes and may be too short for 4K REMUX movies. A single hung process can still block a worker slot for half an hour.
- **The Fix:**

1. Implement per-engine timeouts (e.g., `ffsubsync` usually finishes in <5 mins, while `alass` may need more).
2. Implement adaptive timeouts based on video duration (e.g., `Timeout = VideoDuration * 0.1 + 60s`).

- **Benefit:** Prevents individual files from stalling the entire queue while ensuring complex matches have enough time to succeed.

## 20. Darkmode UI

- **The Problem:** The current UI is lightmode only, which can be harsh on the eyes during nighttime viewing.
- **The Fix:** Implement a darkmode theme toggle in the frontend (`app.js` and CSS).
- **Benefit:** Enhances user comfort and accessibility during low-light conditions.

# Completed Optimizations

The following items have been successfully implemented and verified:

## 1. Immediate Task Termination (Process Management)

- **Problem:** "Stop Run" and "Skip File" buttons were non-immediate, waiting for the active engine to finish naturally.
- **Solution:** Implemented PID tracking and `AbortSignal` support. The application now sends `SIGTERM` to subprocesses instantly.
- **Status:** Done.

## 2. End-to-End Pagination & Scalability

- **Problem:** Loading 13,000 files into the browser caused memory exhaustion and crashes.
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
- **Solution:** Implemented a fallback to match solitary video files in the same or parent directory.
- **Status:** Done.

## 6. Server-Side Search & Filtering

- **Problem:** Finding specific files in large runs was impossible.
- **Solution:** Added server-side SQL `LIKE` filtering and a debounced search input in the UI.
- **Status:** Done.

## 7. Infinite Scrolling (UX)

- **Problem:** Manual pagination buttons were tedious for large datasets.
- **Solution:** Implemented an `IntersectionObserver` to automatically load more results as the user scrolls.
- **Status:** Done.
