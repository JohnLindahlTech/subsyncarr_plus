# Codebase Review: Subsyncarr-Plus-Plus

**Date:** January 31, 2026
**Reviewer:** Gemini CLI Agent

## 1. Executive Summary

The `subsyncarr_plus` codebase is a functional TypeScript application for synchronizing subtitles using multiple external engines (`ffsubsync`, `autosubsync`, `alass`). It features a persistent state (SQLite), a WebSocket-based UI server, and a concurrent processing pipeline.

The project demonstrates good use of TypeScript and modern async/await patterns. However, there are significant opportunities for improvement in **security** (shell injection risks), **architecture** (separation of concerns), and **robustness** (concurrency management, logging).

## 2. Critical Issues (Security & Stability)

### 2.1. Shell Injection Vulnerability (High Severity)

**Location:** `src/helpers.ts`, `src/generateFfsubsyncSubtitles.ts`, etc.
**Issue:** The application constructs shell commands using string interpolation and executes them via `child_process.exec`.

```typescript
// src/helpers.ts
const command = `ffmpeg -y -i "${videoPath}" ...`;
exec(command, ...)
```

**Risk:** If a filename contains a double quote (`"`) or shell metacharacters (e.g., `$(...)`, `;`), it could break out of the quoted string and execute arbitrary commands. While filenames are generally trusted in some environments, this is a dangerous practice.
**Recommendation:** Replace `exec` with `child_process.execFile` or `child_process.spawn`.

**⚠️ Implementation Warning:**

- **Argument Parsing:** `spawn` and `execFile` take arguments as an **array of strings**, not a single string. You must split the command arguments manually (e.g., `['-y', '-i', videoPath]`). Do NOT wrap the variables in quotes yourself; the node runtime handles escaping.
- **Output Handling:** `exec` buffers stdout/stderr for you. `spawn` returns streams. If you switch to `spawn`, you must manually collect the data from the streams (e.g., `stdout.on('data', ...)`). For short commands, `util.promisify(execFile)` is the easiest replacement as it still buffers output.
- **Shell Features:** You will lose shell features like pipes (`|`) or redirects (`>`). If the code uses these, you must implement them in Node.js (e.g., pipe streams manually).

### 2.2. "God Object" Anti-Pattern

**Location:** `src/processingEngine.ts`
**Issue:** The `ProcessingEngine` class is responsible for too many things:

- File system scanning (`findAllSrtFiles`).
- Logic for grouping files by video.
- Audio extraction (management and execution).
- Worker pool management.
- Individual file processing logic.
- Engine execution strategy.
  **Risk:** This makes the class hard to test, maintain, and extend.
  **Recommendation:** Decompose `ProcessingEngine` into smaller, focused services:
- `ScannerService`: Handles file discovery.
- `QueueService`: Manages concurrency and the worker pool.
- `JobProcessor`: Handles the logic for a single video/file group.
- `AudioExtractor`: Manages audio extraction lifecycle.

**⚠️ Implementation Warning:**

- **Circular Dependencies:** Be careful not to create circular dependencies between these new services. Use Dependency Injection (pass services into constructors) to wire them together in `index.ts` or `coordinator.ts`.
- **Event Continuity:** The current `ProcessingEngine` emits many events (`file:started`, `video:completed`, etc.) that the UI relies on. When refactoring, ensure these events are still emitted with the **exact same names and payload structures**, possibly by aggregating events in the Coordinator.

## 3. Architecture & Design Recommendations

### 3.1. Decouple State and Business Logic

**Location:** `src/stateManager.ts`
**Issue:** `StateManager` mixes low-level database operations with high-level business logic (e.g., `reconcileFileResults` contains scoring logic).
**Recommendation:** Keep `StateManager` (or `Repository`) focused on CRUD operations. Move business logic (scoring, agreement verification) to a `ResultAnalyzer` or `SyncService`.

**⚠️ Implementation Warning:**

- **Transaction Safety:** When moving logic out, ensure you don't break transaction boundaries. If a business operation requires multiple DB updates, they might need to be wrapped in a transaction, which `better-sqlite3` supports synchronously.

### 3.2. Improve Event-Driven Architecture

**Issue:** The communication between `Coordinator`, `ProcessingEngine`, and `StateManager` relies heavily on a complex web of event emitters. This makes the data flow hard to trace.
**Recommendation:**

- Consider using a centralized **Event Bus** or strictly defined interfaces for communication.
- Reduce reliance on events for control flow. Use return values or state machines where appropriate.

### 3.3. Standardize Configuration

**Location:** Scattered `process.env` usage.
**Issue:** Environment variables are accessed directly in multiple files (`config.ts`, `ProcessingEngine`, `Coordinator`, `helpers.ts`).
**Recommendation:** Centralize all configuration in a typed `Config` service/singleton. This ensures all env vars are validated and typed in one place.

## 4. Code Quality & Maintainability

### 4.1. Structured Logging with Pino

**Issue:** `console.log` and `console.error` are used extensively.
**Recommendation:** Integrate the **Pino** logging library.

- Use log levels (debug, info, warn, error).
- JSON output for easier parsing.
- Context injection (e.g., attaching `runId` to all logs in a request).

**⚠️ Implementation Warning:**

- **Argument Compatibility:** `console.log` accepts variadic arguments. Pino expects an object as the first argument for structured data: `logger.info({ count }, 'Found files')`. You will need to update the call sites.
- **Test Silence:** Ensure Pino is configured with `level: 'silent'` when `NODE_ENV === 'test'`. Automated tests must not produce log output to the console.

### 4.2. Magic Strings

**Issue:** Strings like `'ffsubsync'`, `'autosubsync'`, `'pending'`, `'processing'`, `'completed'` are hardcoded throughout the app.
**Recommendation:** Use `enum`s or `const` assertions for:

- Engine names.
- File statuses.
- Agreement statuses.

### 4.3. Type Safety

**Issue:** While TypeScript is used, there are opportunities for stricter typing.

- `any` casting in error handling (`error as Error & ...`).
  **Recommendation:** Create custom Error classes (e.g., `TimeoutError`, `ProcessError`) to handle specific failure modes cleanly.

## 5. Performance & Concurrency

### 5.1. Queue Management with p-queue

**Location:** `src/processingEngine.ts`
**Issue:** The custom worker pool implementation is basic and lacks robust error handling and scheduling.
**Recommendation:** Use **p-queue** to manage concurrency. It provides a clean API for limiting concurrent tasks and handling priorities.

**⚠️ Implementation Warning:**

- **In-Memory Only:** `p-queue` is in-memory. If the app restarts, the queue is cleared. This is acceptable for the current use case but important to note.

### 5.2. Non-Blocking Audio Extraction

**Issue:** Audio extraction happens sequentially for a video group, blocking the worker.
**Recommendation:** If using a queue system, audio extraction could be a separate job type. Once extraction finishes, synchronization jobs can be enqueued.

## 6. Testing

### 6.1. Reduce Mocking

**Issue:** `processingEngine.test.ts` relies heavily on mocks.
**Recommendation:** Introduce **Integration Tests** that run against a real (temporary) SQLite database and a real file system. This ensures the components actually work together.

**⚠️ Implementation Warning:**

- **Resource Cleanup:** Real integration tests create files and DB entries. Ensure you use a `beforeEach`/`afterEach` strategy or a library like `tmp-promise` to create isolated environments for each test, so they don't pollute the dev machine or conflict with each other.

## 7. Actionable Tasks

### Task 1: Security Hardening (High Priority) - [COMPLETED]

- [x] **Objective:** Replace `exec` with `spawn` or `execFile` in `src/helpers.ts`.
- [x] **Sub-task:** Refactor `execPromise` to accept `args: string[]` instead of a command string.
- [x] **Sub-task:** Update `generateFfsubsyncSubtitles.ts`, `generateAutosubsyncSubtitles.ts`, and `generateAlassSubtitles.ts` to pass arguments as arrays.
- [x] **Validation:** Ensure that arguments with spaces (e.g., filename `"Movie Title (2020).mkv"`) are handled correctly WITHOUT manual quotes.
- [x] **Validation:** Verify `stdout` parsing still works (e.g., for `ffsubsync` scoring).

### Task 2: Logging & Configuration - [COMPLETED]

- [x] **Objective:** Centralize config and implement **Pino** logging.
- [x] **Sub-task:** Install `pino`.
- [x] **Sub-task:** Create `src/services/logger.ts` and `src/config/appConfig.ts`.
- [x] **Sub-task:** Configure Pino to be silent if `NODE_ENV === 'test'`.
- [x] **Sub-task:** Replace all `process.env` calls with `appConfig.get(...)`.
- [x] **Sub-task:** Replace `console.log` with `logger.info`, ensuring arguments are passed correctly (object-first style).

### Task 3: Refactor ProcessingEngine - [COMPLETED]

- [x] **Objective:** Break down the God Object using **p-queue**.
- [x] **Sub-task:** Create `ScannerService.ts` and move `findAllSrtFiles` logic there.
- [x] **Sub-task:** Create `AudioExtractor.ts` for ffmpeg audio extraction logic.
- [x] **Sub-task:** Introduce `p-queue` to replace the manual worker pool in `ProcessingEngine`.
- [x] **Constraint:** Maintain the `EventEmitter` interface of `ProcessingEngine` so `Coordinator` doesn't break.

### Task 4: State & Database Cleanup - [COMPLETED]

- [x] **Objective:** Separate DB concerns from business logic.

- [x] **Sub-task:** Extract `reconcileFileResults` logic into a pure function/service `ScoreCalculator.ts`.

- [x] **Sub-task:** Define proper Enums for `FileStatus` etc., in `src/types.ts`.

- [x] **Sub-task:** Ensure `StateManager` only handles DB reads/writes.

### Task 5: Testing Improvements

- [ ] **Objective:** Add integration tests.
- [ ] **Sub-task:** Create `src/__tests__/integration/pipeline.test.ts`.
- [ ] **Sub-task:** Use `better-sqlite3` with an in-memory DB (`:memory:`) for tests.
- [ ] **Sub-task:** Use `mock-fs` to simulate a file scan.
- [ ] **Sub-task:** Mock _only_ the `child_process.spawn` calls to avoid running real `ffmpeg`.
- [ ] **Sub-task:** Verify that running tests produces zero console output from the logger.

### Task 6: Modernize Tooling (Vitest) & Migrate to ESM - [COMPLETED]

- [x] **Sub-task (Tooling):** Remove Jest, Babel, and related dependencies.

- [x] **Sub-task (Tooling):** Install Vitest and migrate existing tests (`jest.fn` -> `vi.fn`, `jest.mock` -> `vi.mock`).

- [x] **Sub-task (ESM):** Add `"type": "module"` to `package.json`.

- [x] **Sub-task (ESM):** Update `tsconfig.json` to use `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`.

- [x] **Sub-task (ESM):** Update all internal imports in `.ts` files to include the `.js` file extension (required for ESM).

- [x] **Sub-task (ESM):** Replace `__dirname` and `__filename` with `import.meta.url` logic in `src/server.ts` and `src/stateManager.ts`.

- [x] **Sub-task (Dependencies):** Update `p-queue` to version 9+ and all other dependencies to latest.

- [x] **Validation:** Ensure `npm run build`, `npm run lint`, and `npm test` (now Vitest) all pass.
