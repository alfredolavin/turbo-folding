"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkerManager = void 0;
const vscode = require("vscode");
class MarkerManager {
    decorationType;
    // Map document URI string -> Set of line numbers (0-indexed)
    markers = new Map();
    context;
    constructor(context) {
        this.context = context;
        const iconPath = vscode.Uri.file(context.asAbsolutePath('resources/green-dot.svg'));
        this.decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: iconPath,
            gutterIconSize: 'contain'
        });
        this.loadMarkers();
    }
    loadMarkers() {
        const saved = this.context.workspaceState.get('turboFolding.savedMarkers', {});
        for (const [uriStr, lines] of Object.entries(saved)) {
            if (Array.isArray(lines) && lines.length > 0) {
                this.markers.set(uriStr, new Set(lines));
            }
        }
    }
    async saveMarkers() {
        const data = {};
        for (const [uriStr, lineSet] of this.markers.entries()) {
            if (lineSet.size > 0) {
                data[uriStr] = Array.from(lineSet);
            }
        }
        await this.context.workspaceState.update('turboFolding.savedMarkers', data);
    }
    toggleMarker(editor, lineNumber) {
        const docUri = editor.document.uri.toString();
        if (!this.markers.has(docUri)) {
            this.markers.set(docUri, new Set());
        }
        const lineSet = this.markers.get(docUri);
        const lineToToggle = lineNumber !== undefined ? lineNumber : editor.selection.active.line;
        if (lineSet.has(lineToToggle)) {
            lineSet.delete(lineToToggle);
        }
        else {
            lineSet.add(lineToToggle);
        }
        if (lineSet.size === 0) {
            this.markers.delete(docUri);
        }
        this.saveMarkers();
        this.updateDecorations(editor);
    }
    getMarkedLines(editor) {
        const docUri = editor.document.uri.toString();
        const lineSet = this.markers.get(docUri);
        return lineSet ? Array.from(lineSet) : [];
    }
    clearAll(editor) {
        const docUri = editor.document.uri.toString();
        this.markers.delete(docUri);
        this.saveMarkers();
        this.updateDecorations(editor);
    }
    updateDecorations(editor) {
        const docUri = editor.document.uri.toString();
        const lineSet = this.markers.get(docUri);
        if (!lineSet || lineSet.size === 0) {
            editor.setDecorations(this.decorationType, []);
            return;
        }
        const ranges = [];
        for (const line of lineSet) {
            if (line < editor.document.lineCount) {
                ranges.push(new vscode.Range(line, 0, line, 0));
            }
        }
        editor.setDecorations(this.decorationType, ranges);
    }
    dispose() {
        this.decorationType.dispose();
    }
}
exports.MarkerManager = MarkerManager;
//# sourceMappingURL=markerManager.js.map