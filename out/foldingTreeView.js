"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FoldingTreeDataProvider = exports.MarkerTreeItem = void 0;
const vscode = require("vscode");
const markerManager_1 = require("./markerManager");
const foldingManager_1 = require("./foldingManager");
// ---------------------------------------------------------------------------
// MarkerTreeItem — leaf or parent node in the folding markers hierarchy
// ---------------------------------------------------------------------------
class MarkerTreeItem extends vscode.TreeItem {
    line;
    documentUri;
    marker;
    nestedChildren = [];
    parent;
    constructor(documentUri, marker) {
        super(`Line ${marker.line + 1}`, vscode.TreeItemCollapsibleState.None);
        this.line = marker.line;
        this.documentUri = documentUri;
        this.marker = marker;
        this.description = marker.text && marker.text.length > 0 ? marker.text : '(empty line)';
        this.tooltip = `Line ${marker.line + 1}: ${marker.text || '(empty line)'}\nColor: ${marker.color}\nClick to jump to line`;
        this.iconPath = (0, markerManager_1.createSvgDataUri)(marker.color);
        this.contextValue = 'markerItem';
        this.command = {
            command: 'turboFolding.selectMarkerFromView',
            title: 'Select Marker',
            arguments: [this.documentUri, this.line]
        };
    }
    /** Promote to collapsible when it has nested children (tree view mode). */
    setNestedChildren(children) {
        this.nestedChildren = children;
        for (const child of children) {
            child.parent = this;
        }
        this.collapsibleState = children.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None;
        if (children.length > 0) {
            this.tooltip = `Line ${this.line + 1}: ${this.marker.text || '(empty line)'}\nColor: ${this.marker.color}\n${children.length} nested marker${children.length !== 1 ? 's' : ''}\nClick to jump to line`;
        }
    }
}
exports.MarkerTreeItem = MarkerTreeItem;
/**
 * Returns the effective folding scope [start, end] initiated by the given marker line.
 * If the line does not initiate a folding block, returns null.
 */
function getMarkerFoldingScope(markerLine, rawRanges) {
    // 1. Direct match: one or more folding ranges start exactly at markerLine
    const exactMatches = rawRanges.filter(r => r.start === markerLine && r.end >= r.start);
    if (exactMatches.length > 0) {
        let maxEnd = markerLine;
        for (const r of exactMatches) {
            if (r.end > maxEnd) {
                maxEnd = r.end;
            }
        }
        return { start: markerLine, end: maxEnd };
    }
    // 2. Near-start match: marker is within a multi-line header/tag/decorator
    // where the folding range starts 1-5 lines before markerLine and covers markerLine.
    const headerCandidates = rawRanges.filter(r => r.start < markerLine && r.end >= markerLine && (markerLine - r.start) <= 5);
    if (headerCandidates.length > 0) {
        // Pick the closest start line
        headerCandidates.sort((a, b) => b.start - a.start);
        const best = headerCandidates[0];
        return { start: best.start, end: best.end };
    }
    return null;
}
// ---------------------------------------------------------------------------
// FoldingTreeDataProvider
// ---------------------------------------------------------------------------
class FoldingTreeDataProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    markerManager;
    _treeViewMode = false;
    constructor(markerManager) {
        this.markerManager = markerManager;
        this.markerManager.onDidChangeMarkers(() => {
            this.refresh();
        });
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.refresh();
        });
    }
    get treeViewMode() {
        return this._treeViewMode;
    }
    setTreeViewMode(value) {
        this._treeViewMode = value;
        this.refresh();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getParent(element) {
        if (element instanceof MarkerTreeItem) {
            return element.parent;
        }
        return undefined;
    }
    async getChildren(element) {
        // ── Children of a marker that has nested children ──────────────────
        if (element instanceof MarkerTreeItem) {
            return element.nestedChildren;
        }
        // ── Root call ───────────────────────────────────────────────────────
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            const placeholder = new vscode.TreeItem('No active text editor', vscode.TreeItemCollapsibleState.None);
            placeholder.description = 'Open a file to view markers';
            return [placeholder];
        }
        const markers = this.markerManager.getMarkers(editor.document.uri);
        if (markers.length === 0) {
            const placeholder = new vscode.TreeItem('No markers in current file', vscode.TreeItemCollapsibleState.None);
            placeholder.description = 'Toggle marker on line to add';
            return [placeholder];
        }
        if (!this._treeViewMode) {
            // ── Flat list (original behaviour) ─────────────────────────────
            return markers.map(m => new MarkerTreeItem(editor.document.uri, m));
        }
        // ── Hierarchical Tree view mode ────────────────────────────────────
        return this._buildTreeItems(editor.document.uri, markers, editor.document);
    }
    // -----------------------------------------------------------------------
    // Tree-building helpers
    // -----------------------------------------------------------------------
    async _buildTreeItems(uri, markers, document) {
        const rawRanges = await (0, foldingManager_1.getFoldingRanges)(document);
        if (rawRanges.length === 0 || markers.length <= 1) {
            // No folding info or single marker — return flat list of marker items
            return markers.map(m => new MarkerTreeItem(uri, m));
        }
        // 1. Build a map: markerLine → MarkerTreeItem
        const itemByLine = new Map();
        for (const m of markers) {
            itemByLine.set(m.line, new MarkerTreeItem(uri, m));
        }
        const markerLines = markers.map(m => m.line).sort((a, b) => a - b);
        // 2. Precompute the effective folding scope for each marker
        const scopeByLine = new Map();
        for (const line of markerLines) {
            scopeByLine.set(line, getMarkerFoldingScope(line, rawRanges));
        }
        // 3. For each marker, find its tightest enclosing parent marker.
        // A marker P is an enclosing parent of C if:
        //   - P.line < C.line
        //   - P has a folding scope [P.start, P.end]
        //   - C.line is enclosed: P.start <= C.line <= P.end
        // The direct parent is the candidate with the smallest scope span (P.end - P.start).
        const parentOf = new Map(); // childLine → parentLine | null
        for (const childLine of markerLines) {
            let bestParentLine = null;
            let bestSpan = Infinity;
            for (const parentLine of markerLines) {
                if (parentLine >= childLine) {
                    continue;
                }
                const parentScope = scopeByLine.get(parentLine);
                if (!parentScope) {
                    continue;
                }
                if (childLine <= parentScope.end) {
                    const span = parentScope.end - parentScope.start;
                    if (span < bestSpan || (span === bestSpan && parentLine > (bestParentLine ?? -1))) {
                        bestSpan = span;
                        bestParentLine = parentLine;
                    }
                }
            }
            parentOf.set(childLine, bestParentLine);
        }
        // 4. Attach nested children to their parent MarkerTreeItems
        for (const childLine of markerLines) {
            const parentLine = parentOf.get(childLine);
            if (parentLine !== null && parentLine !== undefined) {
                const parentItem = itemByLine.get(parentLine);
                const childItem = itemByLine.get(childLine);
                parentItem.nestedChildren.push(childItem);
            }
        }
        // 5. Promote parents with children to collapsible (Expanded)
        for (const item of itemByLine.values()) {
            if (item.nestedChildren.length > 0) {
                item.setNestedChildren(item.nestedChildren);
            }
        }
        // 6. Top-level items: markers with no parent marker in the document
        const topLevel = markerLines
            .filter(line => parentOf.get(line) === null)
            .map(line => itemByLine.get(line));
        return topLevel;
    }
}
exports.FoldingTreeDataProvider = FoldingTreeDataProvider;
//# sourceMappingURL=foldingTreeView.js.map