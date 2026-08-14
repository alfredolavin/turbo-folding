# ⚡ Turbo Folding

<p align="center">
  <img src="icon.png" alt="Turbo Folding Icon" width="160" style="border-radius: 24px; box-shadow: 0 8px 30px rgba(0,210,255,0.3);" />
</p>

<p align="center">
  <strong>High-speed selective folding, vivid gutter markers, tag-level sibling isolation, and visual folding management for VS Code.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#new-in-this-version">What's New</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#license">License</a>
</p>

---

## 🌟 Overview

**Turbo Folding** brings unparalleled clarity and speed to navigating large, deeply nested files (such as complex HTML templates, Angular/Vue/React component trees, JSON payloads, XML, and TypeScript/JavaScript source files).

Instead of manually clicking tiny folding chevrons or using basic "Fold All" commands that hide everything, **Turbo Folding** lets you:
- Pinpoint and bookmark critical blocks with **vivid gutter markers**.
- Focus on what matters with single-click **Focus Mode** (unfolds the target block and cleanly folds all other marked blocks).
- Perform **tag-level sibling folding** to inspect one specific `<section>`, `<div>`, `<mat-tab>`, or function while collapsing identical sibling tags at the exact same hierarchy level.
- Keep track of all active markers in the dedicated **Folding Manager** tree view.

---

## ✨ Features

### 🎯 1. Vivid Gutter Markers
- Toggle colorful marker dots in the editor gutter on any line (`Ctrl+Alt+F` / context menu / command).
- 16 neon & vivid palette colors assigned sequentially or randomly.
- Markers automatically track document edits and line movements dynamically.

### 🔍 2. Folding Manager
- Dedicated Activity Bar view listing all marked lines in the active document.
- One-click jump to any marker.
- Inline actions: **Focus Marker** (unfold target & fold others) and **Delete Marker**.
- **Focus on Select** toggle: when turned ON, clicking any marker in the tree view instantly isolates and opens that block while folding all other marked blocks.

### 🏷️ 3. Tag-Level & Sibling Folding *(New!)*
- **Add marker to this and all same tags at same level**: Automatically detects the HTML/XML tag or identifier and indentation depth on the selected line, and batch-places markers on all matching sibling blocks across the entire document.
- **Fold all other same tags at this same level**: Instantly folds all sibling elements of the same tag type at the same nesting level, keeping your current block in full view.

### 🚀 4. Auto-Folding Mode (Cursor Tracking)
- Optional real-time auto-folding mode (`turboFolding.autoMode.enabled`).
- Automatically maintains clean folding depths above and below your active cursor position as you navigate large files.

---

## 🆕 New in This Version

- 🛡️ **Fixed Upward-Fold Escalation**: Fixed an issue where repeatedly focusing or unfolding an item caused ancestor folds to cascade upwards until the whole file collapsed. All folding actions now strictly isolate their target level (`levels: 1`).
- 🏷️ **Tag & Sibling Level Operations**: Added commands to mark and fold all matching tags at the same indentation level with a single click.
- 🎨 **Brand New Neon Icon & Enhanced Metadata**: Updated publisher, repository, and high-resolution icon.

---

## 🕹️ Quick Start

1. **Mark Lines**: Right-click any line number or gutter area and choose **"Turbo Folding: Toggle Marker on Current Line"**.
2. **Batch-Mark Siblings**: Right-click an opening HTML tag (e.g. `<div class="card">`) and select **"Add Marker to This and All Same Tags at Same Level"**.
3. **Focus a Block**: Click the marker in the **Folding Manager** sidebar view or right-click and choose **"Fold Marked Regions Except Current"** (`Ctrl+Alt+F` / `Cmd+Alt+F`).
4. **Fold Other Siblings**: Right-click and choose **"Fold All Other Same Tags at This Same Level"** to collapse all matching sibling blocks in one go.

---

## ⌨️ Commands

| Command | Title | Description |
|---|---|---|
| `turboFolding.toggleMarker` | **Toggle Marker on Current Line** | Places or removes a colorful marker on the active line. |
| `turboFolding.foldMarkedExceptCurrent` | **Fold Marked Regions Except Current** (`Ctrl+Alt+F`) | Folds all marked blocks except the one around the active cursor. |
| `turboFolding.addMarkerToSameTags` | **Add Marker to This and All Same Tags at Same Level** | Finds and marks all identical tags at the same indentation depth. |
| `turboFolding.foldOtherSameTags` | **Fold All Other Same Tags at This Same Level** | Collapses all sibling tags at the same level except the active one. |
| `turboFolding.clearAllMarkers` | **Clear All Markers** | Removes all markers from the current file. |
| `turboFolding.toggleFocusOnSelect` | **Toggle Focus on Select** | Toggles auto-focus mode when selecting items in the Folding Manager view. |
| `turboFolding.toggleAutoMode` | **Toggle Auto Mode** | Enables/disables cursor-based automatic background folding. |
| `turboFolding.refreshMarkersView` | **Refresh Markers** | Manually refreshes the Folding Manager tree view. |

---

## ⚙️ Configuration

Customize Turbo Folding in your VS Code `settings.json`:

```jsonc
{
  // Strategy for assigning marker colors: "sequential" or "random"
  "turboFolding.colorAssignment": "sequential",

  // Automatically unfold selected marker and fold other marked blocks
  "turboFolding.focusOnSelect": false,

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
