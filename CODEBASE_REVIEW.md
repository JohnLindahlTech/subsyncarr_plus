# Codebase Review: Subsyncarr-Plus-Plus

**Date:** January 31, 2026
**Reviewer:** Gemini CLI Agent

## 1. Executive Summary

The `subsyncarr_plus` codebase has undergone a significant refactoring to address security, architecture, and stability concerns raised in the previous audit. The application now employs a modular architecture with clear separation of concerns, robust security practices around shell execution, and a modern ESM-based toolchain.

The critical "God Object" anti-pattern has been resolved by decomposing `ProcessingEngine` into specialized services (`ScannerService`, `AudioExtractor`), and concurrency is now safely managed via `p-queue`.

## 2. Resolved Critical Issues

### 2.1. Shell Injection Vulnerability (Fixed)

**Previous Status:** High Severity. Unsafe string interpolation in `exec` calls.
**Current Status:** **Resolved**.
**Verification:**

- All shell executions now use `child_process.execFile` via a helper wrapper.
- Arguments are passed as arrays, preventing shell injection.
- Files: `src/helpers.ts`, `src/generateFfsubsyncSubtitles.ts`, etc.

### 2.2. "God Object" Anti-Pattern (Fixed)

**Previous Status:** `ProcessingEngine` handled too many responsibilities.
**Current Status:** **Resolved**.
**Verification:**

- File scanning moved to `src/services/ScannerService.ts`.
- Audio extraction logic moved to `src/services/AudioExtractor.ts`.
- Concurrency managed by `p-queue`.
- `ProcessingEngine` now acts as a true orchestrator.

## 3. Architecture & Design Improvements

### 3.1. Decoupled State and Business Logic

- **Status:** **Verified**.
- **Details:** `StateManager` is now focused solely on database operations. Business logic for scoring and reconciliation has been moved to `src/services/ScoreCalculator.ts`.
- **Enums:** Strongly typed Enums (`RunStatus`, `FileStatus`, etc.) are now used throughout the application, eliminating magic strings.

### 3.2. Configuration & Logging

- **Status:** **Verified**.
- **Details:**
  - `src/config/appConfig.ts` provides a centralized, type-safe configuration singleton.
  - `pino` structured logging is implemented globally via `src/services/logger.ts`.
  - Console pollution is eliminated during tests.

## 4. Testing & Tooling

### 4.1. Integration Tests

- **Status:** **Verified**.
- **Details:** A comprehensive integration test suite (`src/__tests__/integration/pipeline.test.ts`) using `vitest` mocks external tools (`ffmpeg`, `ffsubsync`) and verifies the end-to-end pipeline against a real SQLite database and file system.

### 4.2. ESM Migration

- **Status:** **Verified**.
- **Details:** The project is fully migrated to ECMAScript Modules (`"type": "module"`), with correct imports and configuration in `tsconfig.json` and `package.json`.

## 5. Remaining Recommendations / Future Work

While the codebase is now in excellent shape, the following minor optimizations could be considered for future sprints:

- **AbortSignal in execFile:** The `execPromise` helper currently manually handles `AbortSignal`. Node.js 16+ supports passing `signal` directly in the `execFile` options, which would simplify the code.
- **Frontend Refactor:** The current refactor focused on the backend. The frontend (`public/js/*.js`) remains plain JavaScript. Migrating this to a build step (e.g., Vite + TypeScript) would improve maintainability.

## 6. Actionable Tasks Status

### Task 1: Security Hardening (High Priority) - [VERIFIED]

- [x] **Objective:** Replace `exec` with `spawn` or `execFile` in `src/helpers.ts`.
- [x] **Sub-task:** Refactor `execPromise` to accept `args: string[]` instead of a command string.
- [x] **Sub-task:** Update `generateFfsubsyncSubtitles.ts`, `generateAutosubsyncSubtitles.ts`, and `generateAlassSubtitles.ts` to pass arguments as arrays.
- [x] **Validation:** Ensure that arguments with spaces are handled correctly WITHOUT manual quotes.
- [x] **Validation:** Verify `stdout` parsing still works.

### Task 2: Logging & Configuration - [VERIFIED]

- [x] **Objective:** Centralize config and implement **Pino** logging.
- [x] **Sub-task:** Install `pino`.
- [x] **Sub-task:** Create `src/services/logger.ts` and `src/config/appConfig.ts`.
- [x] **Sub-task:** Configure Pino to be silent if `NODE_ENV === 'test'`.
- [x] **Sub-task:** Replace all `process.env` calls with `appConfig.get(...)`.

### Task 3: Refactor ProcessingEngine - [VERIFIED]

- [x] **Objective:** Break down the God Object using **p-queue**.
- [x] **Sub-task:** Create `ScannerService.ts` and move `findAllSrtFiles` logic there.
- [x] **Sub-task:** Create `AudioExtractor.ts` for ffmpeg audio extraction logic.
- [x] **Sub-task:** Introduce `p-queue` to replace the manual worker pool in `ProcessingEngine`.

### Task 4: State & Database Cleanup - [VERIFIED]

- [x] **Objective:** Separate DB concerns from business logic.
- [x] **Sub-task:** Extract `reconcileFileResults` logic into a pure function/service `ScoreCalculator.ts`.
- [x] **Sub-task:** Define proper Enums for `FileStatus` etc., in `src/types.ts`.
- [x] **Sub-task:** Ensure `StateManager` only handles DB reads/writes.

### Task 5: Testing Improvements - [VERIFIED]

- [x] **Objective:** Add integration tests.
- [x] **Sub-task:** Create `src/__tests__/integration/pipeline.test.ts`.
- [x] **Sub-task:** Use `better-sqlite3` with an in-memory DB (or isolated temp file) for tests.
- [x] **Sub-task:** Mock _only_ the `child_process.execFile` calls.

### Task 6: Modernize Tooling (Vitest) & Migrate to ESM - [VERIFIED]

- [x] **Sub-task (Tooling):** Remove Jest, Babel, and related dependencies.

- [x] **Sub-task (Tooling):** Install Vitest and migrate existing tests.

- [x] **Sub-task (ESM):** Add `"type": "module"` to `package.json`.

- [x] **Sub-task (ESM):** Update `tsconfig.json` to use `"module": "NodeNext"`.

- [x] **Sub-task (ESM):** Update all internal imports in `.ts` files to include the `.js` file extension.

- [x] **Sub-task (ESM):** Replace `__dirname` and `__filename` with `import.meta.url` logic.

## 7. Advanced Architectural Refinements (New Suggestions)

### 7.1. Orchestrated Graceful Shutdown

**Issue:** The `SIGTERM` handler closes the HTTP server but doesn't orchestrate the shutdown of the `p-queue` or active `child_process` instances.

**Recommendation:** Implement a `shutdown()` method in `Coordinator` that calls `engine.stopAllProcessing()`, waits for the queue to idle (with a timeout), and then closes the database.

### 7.2. Strict Configuration Validation - [VERIFIED]

**Issue:** `AppConfig` lacks runtime validation for environment variables.

**Recommendation:** Use a library like `zod` to define a configuration schema. This ensures the application fails fast at startup if `CRON_SCHEDULE` or `DB_PATH` are malformed.

### 7.3. True Dependency Injection - [VERIFIED]

**Issue:** `ProcessingEngine` still has hard dependencies on service implementations in its constructor.

**Recommendation:** Pass `ScannerService` and `AudioExtractor` as constructor arguments. This allows for much cleaner unit testing without needing to mock the file system or `ffmpeg` globally.

### 7.4. Formal Database Migrations

**Issue:** Migration logic is currently hardcoded file-checks in `index-server.ts`.

**Recommendation:** Implement a simple migration runner that stores a `schema_version` in the database. This prevents data corruption when updating between versions with structural changes.
