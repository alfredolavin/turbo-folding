"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkerManager = exports.DEFAULT_VIVID_PALETTE = void 0;
exports.createSvgDataUri = createSvgDataUri;
const vscode = require("vscode");
exports.DEFAULT_VIVID_PALETTE = [
    '#FF3366', // Neon Pink
    '#00D2FF', // Vivid Sky Blue
    '#00E676', // Bright Spring Green
    '#FF9100', // Amber Orange
    '#9D00FF', // Electric Violet
    '#FFD600', // Bright Gold
    '#FF1744', // Crimson Red
    '#00E5FF', // Bright Turquoise
    '#76FF03', // Neon Lime
    '#E040FB', // Bright Fuchsia
    '#2979FF', // Electric Royal Blue
    '#FF6D00', // Deep Tangerine
    '#1DE9B6', // Bright Teal
    '#F50057', // Vivid Raspberry
    '#651FFF', // Deep Indigo
    '#00C853' // Lush Vivid Green
];
function createSvgDataUri(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
        `<circle cx="8" cy="8" r="5" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="0.75"/>` +
        `</svg>`;
    return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}
class MarkerManager {
    // Map of hex color -> TextEditorDecorationType
    decorationTypes = new Map();
    // Map document URI string -> Map of (line number -> MarkerItem)
    markers = new Map();
    // Monotonic color index per document — only ever goes up, never resets on deletion
    colorCounters = new Map();
    context;
    _onDidChangeMarkers = new vscode.EventEmitter();
    onDidChangeMarkers = this._onDidChangeMarkers.event;
    constructor(context) {
        this.context = context;
        this.loadMarkers();
    }
    getPalette() {
        const config = vscode.workspace.getConfiguration('turboFolding');
        const customPalette = config.get('palette');
        if (Array.isArray(customPalette) && customPalette.length > 0) {
            return customPalette;
        }
        return exports.DEFAULT_VIVID_PALETTE;
    }
    getColorAssignmentStrategy() {
        const config = vscode.workspace.getConfiguration('turboFolding');
        return config.get('colorAssignment', 'sequential');
    }
    getOrCreateDecorationType(color) {
        let deco = this.decorationTypes.get(color);
        if (!deco) {
            deco = vscode.window.createTextEditorDecorationType({
                gutterIconPath: createSvgDataUri(color),
                gutterIconSize: 'contain',
                rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
            });
            this.decorationTypes.set(color, deco);
        }
        return deco;
    }
    assignColor(docUri) {
        const palette = this.getPalette();
        const strategy = this.getColorAssignmentStrategy();
        const markerMap = this.markers.get(docUri);
        if (strategy === 'random') {
            // Pick from colors not currently used in this document (prefer unused)
            const usedColors = new Set();
            if (markerMap) {
                for (const m of markerMap.values()) {
                    usedColors.add(m.color);
                }
            }
            const unusedColors = palette.filter(c => !usedColors.has(c));
            const candidatePool = unusedColors.length > 0 ? unusedColors : palette;
            const randomIndex = Math.floor(Math.random() * candidatePool.length);
            return candidatePool[randomIndex];
        }
        // Sequential strategy — use a monotonic counter per document.
        // Never based on markerMap.size (which shrinks on deletion causing repeats).
        const current = this.colorCounters.get(docUri) ?? 0;
        this.colorCounters.set(docUri, current + 1);
        return palette[current % palette.length];
    }
    loadMarkers() {
        const saved = this.context.workspaceState.get('turboFolding.savedMarkers', {});
        const palette = this.getPalette();
        for (const [uriStr, items] of Object.entries(saved)) {
            if (Array.isArray(items) && items.length > 0) {
                const markerMap = new Map();
                let idx = 0;
                for (const item of items) {
                    if (typeof item === 'number') {
                        const color = palette[idx % palette.length];
                        markerMap.set(item, { line: item, color });
                        idx++;
                    }
                    else if (item && typeof item.line === 'number') {
                        const color = typeof item.color === 'string' && item.color.length > 0
                            ? item.color
                            : palette[idx % palette.length];
                        markerMap.set(item.line, { line: item.line, text: item.text, color });
                        idx++;
                    }
                }
                if (markerMap.size > 0) {
                    this.markers.set(uriStr, markerMap);
                    // Seed the counter so new markers continue sequentially after existing ones
                    this.colorCounters.set(uriStr, idx);
                }
            }
        }
    }
    async saveMarkers() {
        const data = {};
        for (const [uriStr, markerMap] of this.markers.entries()) {
            if (markerMap.size > 0) {
                data[uriStr] = Array.from(markerMap.values());
            }
        }
        await this.context.workspaceState.update('turboFolding.savedMarkers', data);
    }
    toggleMarker(editor, lineNumber) {
        const docUri = editor.document.uri.toString();
        if (!this.markers.has(docUri)) {
            this.markers.set(docUri, new Map());
        }
        const markerMap = this.markers.get(docUri);
        let lineToToggle = lineNumber !== undefined ? lineNumber : editor.selection.active.line;
        lineToToggle = Math.max(0, Math.min(lineToToggle, editor.document.lineCount - 1));
        if (markerMap.has(lineToToggle)) {
            markerMap.delete(lineToToggle);
        }
        else {
            const lineText = editor.document.lineAt(lineToToggle).text.trim();
            const color = this.assignColor(docUri);
            markerMap.set(lineToToggle, { line: lineToToggle, text: lineText, color });
        }
        if (markerMap.size === 0) {
            this.markers.delete(docUri);
        }
        this.saveMarkers();
        this.updateDecorations(editor, false);
        this._onDidChangeMarkers.fire(editor.document.uri);
    }
    deleteMarker(docUriOrEditor, line) {
        const docUri = typeof docUriOrEditor === 'string' ? docUriOrEditor : docUriOrEditor.document.uri.toString();
        const markerMap = this.markers.get(docUri);
        if (markerMap && markerMap.has(line)) {
            markerMap.delete(line);
            if (markerMap.size === 0) {
                this.markers.delete(docUri);
            }
            this.saveMarkers();
            for (const editor of vscode.window.visibleTextEditors) {
                if (editor.document.uri.toString() === docUri) {
                    this.updateDecorations(editor, false);
                }
            }
            const targetUri = typeof docUriOrEditor === 'string' ? vscode.Uri.parse(docUri) : docUriOrEditor.document.uri;
            this._onDidChangeMarkers.fire(targetUri);
        }
    }
    getMarkers(documentUri) {
        const uriStr = typeof documentUri === 'string' ? documentUri : documentUri.toString();
        const markerMap = this.markers.get(uriStr);
        if (!markerMap) {
            return [];
        }
        return Array.from(markerMap.values()).sort((a, b) => a.line - b.line);
    }
    getMarkedLines(editor) {
        const docUri = editor.document.uri.toString();
        const markerMap = this.markers.get(docUri);
        return markerMap ? Array.from(markerMap.keys()).sort((a, b) => a - b) : [];
    }
    clearAll(editor) {
        const docUri = editor.document.uri.toString();
        this.markers.delete(docUri);
        this.saveMarkers();
        this.updateDecorations(editor, false);
        this._onDidChangeMarkers.fire(editor.document.uri);
    }
    reanchorMarkers(document) {
        const docUri = document.uri.toString();
        const markerMap = this.markers.get(docUri);
        if (!markerMap || markerMap.size === 0) {
            return false;
        }
        let changed = false;
        const newMap = new Map();
        const usedLines = new Set();
        for (const [, marker] of markerMap.entries()) {
            const targetLine = marker.line;
            const targetText = marker.text;
            const lineValid = targetLine >= 0 && targetLine < document.lineCount;
            const currentLineText = lineValid ? document.lineAt(targetLine).text.trim() : null;
            if (targetText && lineValid && currentLineText === targetText) {
                newMap.set(targetLine, { line: targetLine, text: targetText, color: marker.color });
                usedLines.add(targetLine);
                continue;
            }
            // Search nearby lines for matching text content
            let foundLine;
            if (targetText && targetText.length > 0) {
                const maxRadius = Math.max(document.lineCount, 100);
                for (let r = 1; r < maxRadius; r++) {
                    const up = targetLine - r;
                    const down = targetLine + r;
                    if (up >= 0 && !usedLines.has(up) && document.lineAt(up).text.trim() === targetText) {
                        foundLine = up;
                        break;
                    }
                    if (down < document.lineCount && !usedLines.has(down) && document.lineAt(down).text.trim() === targetText) {
                        foundLine = down;
                        break;
                    }
                }
            }
            if (foundLine !== undefined) {
                changed = true;
                newMap.set(foundLine, { line: foundLine, text: targetText, color: marker.color });
                usedLines.add(foundLine);
            }
            else if (lineValid) {
                const updatedText = document.lineAt(targetLine).text.trim();
                newMap.set(targetLine, { line: targetLine, text: updatedText, color: marker.color });
                usedLines.add(targetLine);
                if (updatedText !== targetText) {
                    changed = true;
                }
            }
            else {
                const clamped = Math.max(0, document.lineCount - 1);
                if (!usedLines.has(clamped)) {
                    changed = true;
                    newMap.set(clamped, { line: clamped, text: document.lineAt(clamped).text.trim(), color: marker.color });
                    usedLines.add(clamped);
                }
            }
        }
        this.markers.set(docUri, newMap);
        if (changed) {
            this.saveMarkers();
            this._onDidChangeMarkers.fire(document.uri);
        }
        return changed;
    }
    handleDocumentChange(event) {
        const docUri = event.document.uri.toString();
        const markerMap = this.markers.get(docUri);
        if (!markerMap || markerMap.size === 0 || event.contentChanges.length === 0) {
            return;
        }
        // Sort changes descending by start line so we apply bottom-up (avoid cascading index drift)
        const sortedChanges = [...event.contentChanges].sort((a, b) => {
            if (b.range.start.line !== a.range.start.line) {
                return b.range.start.line - a.range.start.line;
            }
            return b.range.start.character - a.range.start.character;
        });
        let currentMarkers = Array.from(markerMap.values());
        for (const change of sortedChanges) {
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;
            const deletedLineCount = endLine - startLine; // lines spanned by the deletion
            const addedLineCount = (change.text.match(/\n/g) || []).length; // newlines inserted
            const lineDelta = addedLineCount - deletedLineCount;
            // If this change is entirely within a single line (no newlines added or removed)
            // it cannot shift any marker — skip expensive per-marker processing.
            if (lineDelta === 0 && deletedLineCount === 0) {
                continue;
            }
            const nextMarkers = [];
            for (const marker of currentMarkers) {
                if (marker.line < startLine) {
                    // Above the change — unaffected
                    nextMarkers.push(marker);
                }
                else if (marker.line > endLine) {
                    // Below the change — shift by line delta
                    nextMarkers.push({
                        line: marker.line + lineDelta,
                        text: marker.text,
                        color: marker.color
                    });
                }
                else {
                    // Marker is on a line that was modified or deleted
                    if (deletedLineCount > 0 && marker.line > startLine && marker.line <= endLine) {
                        // The exact line the marker was on was deleted — drop it
                    }
                    else {
                        // Marker is on startLine (or a multi-line insert start)
                        // Keep it at startLine; if lines were inserted BEFORE the content
                        // (change starts at col 0 of this line), push the marker down.
                        let newLine = startLine;
                        if (addedLineCount > 0 &&
                            change.range.start.character === 0 &&
                            change.range.start.line === marker.line &&
                            change.range.end.line === marker.line &&
                            change.range.end.character === 0) {
                            // Pure insertion of blank lines at the very start of the marker line
                            newLine = startLine + addedLineCount;
                        }
                        nextMarkers.push({
                            line: newLine,
                            text: marker.text,
                            color: marker.color
                        });
                    }
                }
            }
            currentMarkers = nextMarkers;
        }
        const newMap = new Map();
        for (const m of currentMarkers) {
            if (m.line >= 0 && m.line < event.document.lineCount) {
                // Refresh the snippet text but keep the line number as-is (do NOT re-anchor)
                const text = event.document.lineAt(m.line).text.trim();
                newMap.set(m.line, { line: m.line, text, color: m.color });
            }
        }
        this.markers.set(docUri, newMap);
        this.saveMarkers();
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.toString() === docUri) {
                this.updateDecorations(editor, false);
            }
        }
        this._onDidChangeMarkers.fire(event.document.uri);
    }
    updateDecorations(editor, doReanchor = false) {
        if (doReanchor) {
            this.reanchorMarkers(editor.document);
        }
        const docUri = editor.document.uri.toString();
        const markerMap = this.markers.get(docUri);
        // Group ranges by color
        const colorRanges = new Map();
        if (markerMap && markerMap.size > 0) {
            for (const marker of markerMap.values()) {
                if (marker.line < editor.document.lineCount) {
                    if (!colorRanges.has(marker.color)) {
                        colorRanges.set(marker.color, []);
                    }
                    colorRanges.get(marker.color).push(new vscode.Range(marker.line, 0, marker.line, 0));
                }
            }
        }
        // Apply decoration for each active color
        for (const [color, ranges] of colorRanges.entries()) {
            const decoType = this.getOrCreateDecorationType(color);
            editor.setDecorations(decoType, ranges);
        }
        // Clear decorations for any unused colors that previously had decorations
        for (const [color, decoType] of this.decorationTypes.entries()) {
            if (!colorRanges.has(color)) {
                editor.setDecorations(decoType, []);
            }
        }
    }
    dispose() {
        this._onDidChangeMarkers.dispose();
        for (const deco of this.decorationTypes.values()) {
            deco.dispose();
        }
        this.decorationTypes.clear();
    }
}
exports.MarkerManager = MarkerManager;
//# sourceMappingURL=markerManager.js.map