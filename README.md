# ⚡ Turbo Folding

<p align="center">
  <img src="icon.png" alt="Turbo Folding Icon" width="160" style="border-radius: 24px; box-shadow: 0 8px 30px rgba(0,210,255,0.3);" />
</p>

<p align="center">
  <strong>High-speed selective folding, vivid gutter markers, smart two-line comment previews, hierarchical tree views, tag/level isolation, and visual folding management for VS Code.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#new-in-this-version">What's New</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands--keybindings">Commands & Keybindings</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#license">License</a>
</p>

---

## 🌟 Overview

**Turbo Folding** brings clarity, structure, and speed to navigating large, deeply nested files (such as HTML templates, Angular/Vue/React JSX trees, JSON payloads, Markdown documents, and TypeScript/JavaScript source files).

Instead of manually hunting for tiny folding chevrons or using blunt "Fold All" commands that collapse everything, **Turbo Folding** lets you:
- Pinpoint and bookmark critical blocks with **vivid gutter markers**.
- View **smart two-line previews** in the Folding Manager that automatically grab concise section comments directly above each folding block.
- Switch seamlessly between **Hierarchical Tree View** (nested by scope) and **Flat List** (with level-based arrow indentation).
- Isolate blocks with single-click **Focus Mode** (unfolds the target block and cleanly collapses other marked regions).
- Perform **semantic & tag-level sibling operations**: mark or fold matching sibling tags/functions at the exact same hierarchy level.
- Rapidly jump across siblings with **Status Bar navigation buttons** and intuitive hotkeys.

---

## ✨ Features

### 💬 1. Smart Two-Line Comment Previews *(New!)*
- If a folding line has a concise comment (`//`, `/* */`, `<!-- -->`, `#`, `--`, etc. under 40 characters) immediately before it, the Folding Manager automatically formats a **two-line preview**:
  - **Line 1**: The trimmed section comment (e.g. `// Auth Handler`).
  - **Line 2**: The code line / tag signature (e.g. `export function handleAuth() {`).
- Provides instant context and readability without having to unfold the code.

### 🌳 2. Tree View & Flat List Modes *(New!)*
- **Hierarchical Tree View**: Automatically nests markers according to their enclosing folding scopes.
- **Flat List View**: Displays all markers sequentially with relative arrow indentation (`->`, `-->`) based on indentation and folding depth.
- Toggle between views with one click in the Folding Manager title bar.

### 🎯 3. Vivid Gutter Markers
- Toggle colorful marker dots in the editor gutter on any line (`Ctrl+Alt+F` / context menu / command).
- 16 neon & vivid palette colors assigned sequentially or randomly.
- Markers automatically track document edits, reanchor on file changes, and survive document edits dynamically.

### 🔍 4. Visual Folding Manager
- Dedicated Activity Bar view listing all active markers in the document.
- One-click jump to any marked line.
- **Focus Marker** inline action: unfolds the chosen block and folds all other markers.
- **Focus on Select** toggle: when turned ON, clicking any marker in the list instantly isolates it and collapses all other marked blocks.
- **Toggle Line Numbers**: show or hide line numbers (`:15`) in the marker labels with a single click.

### 🏷️ 5. Semantic & Tag-Level Sibling Operations
- **Add Markers at Same Level**: Automatically detects the HTML tag name, function, class, or indentation depth and batch-marks all matching siblings across the file.
- **Fold Other at Same Level** (`Ctrl+Alt+H` / `Cmd+Alt+H`): Collapses all sibling elements of the same type at the same level, keeping only your active block in view.
- **Fold All at Same Level**: Folds all siblings at this level including the current one.
- **Unfold Recursively** (`Ctrl+Alt+U` / `Cmd+Alt+U`): Recursively expands the entire subtree under the active block.

### 🧭 6. Level Navigation
- **Status Bar Buttons**: Dedicated **"$(arrow-up) Prev Level"** and **"$(arrow-down) Next Level"** buttons on the right side of the status bar.
- **Keybindings**: Jump directly between sibling foldables at the same indentation level with `Ctrl+Alt+Up` / `Ctrl+Alt+Down`.

### 🚀 7. Auto-Folding Mode (Cursor Tracking)
- Optional real-time auto-folding mode (`turboFolding.autoMode.enabled`).
- Automatically maintains clean folding depths above and below your active cursor position as you navigate large files.

---

## 🆕 New in This Version

- 💬 **Smart Two-Line Previews**: Automatically detects preceding comment lines (< 40 characters) and renders them as the first line of a two-line preview in the Folding Manager.
- 🌳 **Hierarchical Tree View**: Nest markers under their parent folding blocks with expandable/collapsible nodes.
- 🔢 **Toggle Line Numbers**: Easily toggle line number prefixes in the Folding Manager view.
- 🧭 **Status Bar & Keybinding Level Navigation**: Rapidly traverse siblings with `Ctrl+Alt+Up` and `Ctrl+Alt+Down`.
- 🛡️ **Isolated Folding**: All folding actions strictly isolate their target level (`levels: 1`), eliminating cascading upward folds.

---

## 🕹️ Quick Start

1. **Mark a Line**: Right-click any line number or gutter area and choose **"Turbo Folding: Toggle Marker on Current Line"**.
2. **Batch-Mark Siblings**: Right-click an element or opening tag and select **"Turbo Folding: Add Markers to All Foldables at Same Level"**.
3. **Navigate & Inspect**: Open the **Folding Manager** view in the sidebar to browse markers with smart two-line comment previews.
4. **Isolate with Focus Mode**: Click a marker in the tree view or run **"Fold Marked Regions Except Current"** (`Ctrl+Alt+F` / `Cmd+Alt+F`).
5. **Traverse Siblings**: Use the status bar buttons or `Ctrl+Alt+Up` / `Ctrl+Alt+Down` to move across sibling blocks.

---

## ⌨️ Commands & Keybindings

| Command | Title | Default Keybinding | Description |
|---|---|---|---|
| `turboFolding.toggleMarker` | **Toggle Marker on Current Line** | — | Places or removes a colorful marker on the active line. |
| `turboFolding.foldMarkedExceptCurrent` | **Fold Marked Regions Except Current** | `Ctrl+Alt+F` / `Cmd+Alt+F` | Folds all marked blocks except the one around the cursor. |
| `turboFolding.foldOtherAtSameLevel` | **Fold Everything Else at Same Level** | `Ctrl+Alt+H` / `Cmd+Alt+H` | Collapses all sibling foldables at the same level except the active one. |
| `turboFolding.foldAllAtSameLevel` | **Fold Everything at Same Level** | — | Collapses all foldables at the same level (including current). |
| `turboFolding.unfoldRecursively` | **Unfold Recursively** | `Ctrl+Alt+U` / `Cmd+Alt+U` | Recursively expands all nested children under the active block. |
| `turboFolding.gotoPrevSameLevel` | **Go to Previous Foldable at Same Level** | `Ctrl+Alt+Up` / `Cmd+Alt+Up` | Moves cursor to the previous sibling foldable at the same level. |
| `turboFolding.gotoNextSameLevel` | **Go to Next Foldable at Same Level** | `Ctrl+Alt+Down` / `Cmd+Alt+Down` | Moves cursor to the next sibling foldable at the same level. |
| `turboFolding.addMarkersAtSameLevel` | **Add Markers to All Foldables at Same Level** | — | Finds and marks all matching sibling foldables across the document. |
| `turboFolding.toggleTreeView` | **Switch to Tree View** | — | Toggles hierarchical tree view in the Folding Manager. |
| `turboFolding.toggleTreeViewFlat` | **Switch to Flat List** | — | Toggles flat list mode with arrow indentation in the Folding Manager. |
| `turboFolding.toggleLineNumbers` | **Toggle Line Numbers** | — | Toggles line number prefixes in the Folding Manager. |
| `turboFolding.toggleFocusOnSelect` | **Toggle Focus on Select** | — | Toggles auto-focus mode when clicking items in the Folding Manager. |
| `turboFolding.clearAllMarkers` | **Clear All Markers** | — | Removes all markers from the active document. |
| `turboFolding.toggleAutoMode` | **Toggle Auto Mode** | — | Enables/disables cursor-based automatic background folding. |
| `turboFolding.refreshMarkersView` | **Refresh Markers** | — | Manually refreshes the Folding Manager tree view. |

---

## ⚙️ Configuration

Customize Turbo Folding in your VS Code `settings.json`:

```jsonc
{
  // Strategy for assigning marker colors: "sequential" or "random"
  "turboFolding.colorAssignment": "sequential",

  // Automatically unfold selected marker and fold other marked blocks on click
  "turboFolding.focusOnSelect": false,

  // Show line numbers (:15) in the Folding Manager view
  "turboFolding.showLineNumbers": true,

  // Custom vivid color palette for gutter markers
  "turboFolding.palette": [
    "#FF3366", "#00D2FF", "#00E676", "#FF9100",
    "#9D00FF", "#FFD600", "#FF1744", "#00E5FF",
    "#76FF03", "#E040FB", "#2979FF", "#FF6D00",
    "#1DE9B6", "#F50057", "#651FFF", "#00C853"
  ],

  // Automatic folding based on cursor position
  "turboFolding.autoMode.enabled": false,
  "turboFolding.autoMode.previousDepth": 1,
  "turboFolding.autoMode.nextDepth": 1
}
```

---

## 👤 Author

**Alfredo Alex Lavín Caldas**
- Email: [alfredolavin@gmail.com](mailto:alfredolavin@gmail.com)
- GitHub: [@alfredolavin](https://github.com/alfredolavin)
- Repository: [https://github.com/alfredolavin/turbo-folding](https://github.com/alfredolavin/turbo-folding)

---

## 📄 License

This extension is licensed under the [MIT License](LICENSE).
