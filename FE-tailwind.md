# Frontend Refactor Plan: Tailwind CSS Migration

**Objective:** Transition the current global CSS architecture to a utility-first **Tailwind CSS** framework.
**Goal:** Improve developer velocity, ensure UI consistency, and eliminate the maintenance burden of large, global CSS files.

## 1. Executive Summary

We have successfully moved to React, but our styling still relies on a "Global CSS" model. As the team adds more features, this will lead to "CSS Bloat" and naming collisions. Tailwind CSS allows us to style components locally, making them easier to move, delete, or refactor without side effects.

**Strategy:** Hybrid Migration. We will install Tailwind and map our existing design tokens (CSS variables) to it. This allows Tailwind and our old CSS to coexist during the transition.

---

## 2. Phase 1: Setup & Configuration

### Task 1.1: Installation - [DONE]

- [x] In `client/` directory, run: `npm install -D tailwindcss postcss autoprefixer`.
- [x] Run `npx tailwindcss init -p` to create `tailwind.config.js` and `postcss.config.js`.
- [x] Configure `content` in `tailwind.config.js` to include all `.tsx` files.

### Task 1.2: Token Mapping (The "Variable" Step) - [DONE]

**Goal:** Ensure we don't lose our brand colors and dark mode support.

- [x] Open `tailwind.config.js`.
- [x] Map existing CSS variables from `theme.css` to the Tailwind theme.
- [x] **Junior Caveat:** DO NOT hardcode hex codes (e.g., `#3b82f6`) in your components. Always use the theme tokens so that Dark Mode continues to work automatically.

---

## 3. Phase 2: Component Migration

### Task 2.1: Create UI Primitives - [DONE]

**Goal:** Prevent "Class Soup" by creating reusable React components for common elements.

- [x] Create `client/src/components/ui/Button.tsx`.
- [x] Create `client/src/components/ui/Badge.tsx`.
- [x] Create `client/src/components/ui/Card.tsx`.

### Task 2.2: Incremental Refactor - [DONE]

- [x] **Step 1:** Refactor `FileCard.tsx`. Use Tailwind for the grid and status tags.
- [x] **Step 2:** Refactor `Sidebar.tsx` and `Header.tsx`.
- [x] **Step 3:** Refactor the Modals (`Modal.tsx`, `Overlay.tsx`).
- [x] **Step 4:** Refactor main Views (`LiveView`, `ExplorerView`).
- [x] **Step 5:** Refactor remaining Views (`DashboardView`, `HistoryView`, `SystemView`, `DocsView`).

---

## 4. Phase 3: The Cleanup

### Task 3.1: CSS Deletion

- [ ] As each component is finished, find the matching rules in `styles/*.css` and delete them.
- [ ] Once a file (like `components.css`) is empty, remove it from the project and from the imports in `main.tsx`.

---

## 5. Implementation Rules for the Team

### 🛑 Rule 1: No @apply Abuse

Junior developers often try to write "standard CSS" inside a `.css` file using `@apply`.

- **Wrong:** `.my-card { @apply p-4 bg-white; }`
- **Right:** `<div className="p-4 bg-white">`
- **Reason:** Using `@apply` re-introduces the naming problem we are trying to solve. Only use it for truly global resets (like `html` or `body`).

### 🛑 Rule 2: Respect the Scale

Tailwind provides a spacing scale (`p-1`=4px, `p-2`=8px, etc.).

- **Wrong:** `p-[13px]`, `w-[241px]`.
- **Right:** Use the nearest standard value (`p-3`, `w-60`).
- **Reason:** Sticking to the scale ensures the app feels "aligned" and professional.

### 🛑 Rule 3: Dark Mode Strategy

Use the `dark:` prefix.

- Since we mapped our colors to CSS variables in Task 1.2, Tailwind will naturally work with our existing theme system. However, for specific overrides, use `dark:text-white` or `dark:bg-gray-900`.

---

## 6. Actionable Tasks Status

- [x] **Task 1: Setup Tailwind**
- [x] **Task 2: Map Theme Tokens**
- [x] **Task 3: Refactor Layout (Sidebar/Header)**
- [x] **Task 4: Refactor Components (FileCard/Modals/Views)**
- [ ] **Task 5: Complete Cleanup**
