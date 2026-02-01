# Frontend Refactor Plan: Modernization & Type Safety - [COMPLETE]

**Objective:** Migrate the current Vanilla JS frontend (`public/`) to a modern **React + Vite + TypeScript** architecture.
**Goal:** Improve maintainability, eliminate "spaghetti DOM manipulation," and share type definitions with the backend.

## 1. Executive Summary

The current frontend relies on manual DOM manipulation (`innerHTML`, `document.getElementById`) and a custom state manager. While functional, this approach is error-prone and hard to extend. We will replace this with a component-based architecture (React) which allows for declarative UI updates and compile-time safety (TypeScript).

**Target Stack:**

- **Build Tool:** Vite
- **Framework:** React
- **Language:** TypeScript
- **State Management:** Zustand (simpler than Redux, fits our current model well)
- **Routing:** React Router (HashRouter to match current URLs)
- **Styling:** CSS Modules (or keep global CSS initially for speed)

**Deployment Strategy: Parallel Development, Single Switch-Over**
Since the current app is a Single Page Application (SPA), we cannot easily replace page-by-page.

1.  **Develop** the new app in a `client/` folder. It will run on port 5173 (proxying API to 3000).
2.  **Verify** feature parity completely.
3.  **Switch** the backend to serve `client/dist` instead of `public/` in one final deployment ("Big Bang").
    This is the safest path for the team, as it ensures the current app remains stable during the entire refactor.

---

## 2. Phase 1: Foundation & Setup

### Task 1.1: Initialize Client Application - [DONE]

**Goal:** Create a clean slate for the new frontend without breaking the existing one immediately.

- [x] Run `npm create vite@latest client -- --template react-ts` in the project root.
- [x] Install dependencies: `npm install react-router-dom zustand clsx date-fns`.
- [x] Configure `vite.config.ts` to proxy API requests to `http://localhost:3000` (so you can develop without CORS issues).

### Task 1.2: Shared Type Definitions - [DONE]

**Goal:** Ensure Frontend and Backend speak the same language.

- [x] Create a new directory `src/shared`.
- [x] Move `src/types.ts` (backend) to `src/shared/types.ts`.
- [x] Update backend imports to point to the new location.
- [x] In `client/tsconfig.json`, configure `paths` or simply import relatively `../../src/shared/types.ts` to access these types.

---

## 3. Phase 2: Logic & State Migration

### Task 2.1: Port API Layer - [DONE]

**Goal:** Move `public/js/api.js` to TypeScript.

- [x] Create `client/src/api/api.ts`.
- [x] Implement the `fetchStatus`, `startRun`, etc. functions.
- [x] **Crucial:** Use the shared interfaces (e.g., `Run`, `FileResult`) for response types. Do not use `any`.

### Task 2.2: Port State Management (Zustand) - [DONE]

**Goal:** Replace `public/js/state.js` with a proper store.

- [x] Create `client/src/store/useAppStore.ts`.
- [x] Migrate the `state` object properties (`currentRun`, `files`, `isRunning`) to the Zustand store.
- [x] **Challenge:** The current `state.js` has complex "upsert" logic (updating existing items in the array vs adding new ones) inside a store action like `updateFromWebSocket`.

### Task 2.3: WebSocket Integration - [DONE]

**Goal:** Reconnect the live updates.

- [x] Create a React hook `useWebSocket.ts` or put this logic in the store.
- [x] It should handle `onopen`, `onmessage`, `onclose` and dispatch actions to the Zustand store.
- [x] Ensure it handles reconnection automatically (like the old `reconnectInterval`).

---

## 4. Phase 3: Component Migration

### Task 3.1: App Shell (Layout) - [DONE]

**Goal:** Recreate the Sidebar and Header.

- [x] Copy `public/css/*.css` to `client/src/styles/` (or import them globally in `main.tsx` for now).
- [x] Create `Layout.tsx`, `Sidebar.tsx`, `Header.tsx`.
- [x] **Note:** Replace `<a href="#/view">` with `<Link to="/view">` or `<NavLink>`.

### Task 3.2: Views (Page Components) - [DONE]

**Goal:** Port the main sections.

- [x] **LiveView:** Replaces `renderLiveList`. Needs the `files` array from the store.
- [x] **ExplorerView:** Replaces `renderExplorerList`. This has a table with sorting.
- [x] **DashboardView:** Replaces `renderDashboard`.
- [x] **HistoryView:** Replaces `renderHistory`.

### Task 3.3: Modals & Overlays - [DONE]

**Goal:** Port the "Details", "Logs", and "Dry Run" modals.

- [x] Create a `Modal` component that handles the overlay backdrop and close logic.
- [x] Use React state to control visibility (e.g., `isLogModalOpen`). **Do not** toggle `classList.add('hidden')` directly on DOM elements.

---

## 5. Phase 4: Final Integration

### Task 4.1: Switch Over - [DONE]

**Goal:** Serve the new app.

- [x] Run `npm run build` in `client/`.
- [x] Update `src/server.ts` (backend) to serve static files from `client/dist` instead of `public`.
- [x] Verify that all routes work (Live, Explorer, etc.).

### Task 4.2: Cleanup - [DONE]

- [x] Delete `public/js` and `public/css`.
- [x] Removed legacy `public/` directory as it no longer contains unique assets.

## 6. Common Pitfalls for Implementors

1.  **DOM References:** You will be tempted to use `document.getElementById('progressFill')` to update the progress bar. **Stop.** In React, you bind the style to a variable: `<div style={{ width: `${percentage}%` }} />`.
2.  **State Mutation:** Zustand uses immutable updates (mostly). Don't do `state.files.push(x)`. Do `set(state => ({ files: [...state.files, x] }))`.
3.  **Class vs ClassName:** Remember to change `class="sidebar"` to `className="sidebar"`.
4.  **Keys:** When rendering the file list `files.map(f => ...)`, you MUST provide a unique `key` prop (use `f.file_path` or `f.id`).
