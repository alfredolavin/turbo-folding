"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FoldingTreeDataProvider = exports.MarkerTreeItem = exports.MarkerGroupItem = void 0;
const vscode = require("vscode");
const markerManager_1 = require("./markerManager");
const foldingManager_1 = require("./foldingManager");
// ---------------------------------------------------------------------------
// MarkerGroupItem — collapsible parent node used in tree view mode
// ---------------------------------------------------------------------------
class MarkerGroupItem extends vscode.TreeItem {
    children;
    constructor(label, children) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.children = children;
        this.description = `${children.length} marker${children.length !== 1 ? 's' : ''}`;
        this.contextValue = 'markerGroup';
        this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    }
}
exports.MarkerGroupItem = MarkerGroupItem;
// ---------------------------------------------------------------------------
// MarkerTreeItem — leaf node (individual marker)
// ---------------------------------------------------------------------------
class MarkerTreeItem extends vscode.TreeItem {
    line;
    documentUri;
    marker;
    nestedChildren = [];
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
        this.collapsibleState = children.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None;
    }
}
exports.MarkerTreeItem = MarkerTreeItem;
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
    async getChildren(element) {
        // ── Children of a group node (tree view mode) ──────────────────────
        if (element instanceof MarkerGroupItem) {
            return element.children;
        }
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
        // ── Tree view mode ─────────────────────────────────────────────────
        return this._buildTreeItems(editor.document.uri, markers, editor.document);
    }
    // -----------------------------------------------------------------------
    // Tree-building helpers
    // -----------------------------------------------------------------------
    async _buildTreeItems(uri, markers, document) {
        const rawRanges = await (0, foldingManager_1.getFoldingRanges)(document);
        if (rawRanges.length === 0) {
            // No folding info — fall back to flat list
            return markers.map(m => new MarkerTreeItem(uri, m));
        }
        const rangeInfo = (0, foldingManager_1.computeFoldingDepths)(rawRanges);
        // Build a map: markerLine → MarkerTreeItem
        const itemByLine = new Map();
        for (const m of markers) {
            itemByLine.set(m.line, new MarkerTreeItem(uri, m));
        }
        const markerLines = markers.map(m => m.line).sort((a, b) => a - b);
        // For each marker find its tightest enclosing marker (parent).
        // A marker P is the parent of C when there is a folding range that
        // starts at P.line and ends >= C.line, and no other marked line
        // between P and C also covers C.
        const parentOf = new Map(); // childLine → parentLine | null
        for (const childLine of markerLines) {
            let bestParentLine = null;
            let bestRangeSize = Infinity;
            for (const parentLine of markerLines) {
                if (parentLine >= childLine) {
                    continue;
                }
                // Find a folding range that starts at parentLine and contains childLine
                const coveringRange = rawRanges.find(r => r.start === parentLine && r.end >= childLine);
                if (coveringRange) {
                    const size = coveringRange.end - coveringRange.start;
                    if (size < bestRangeSize) {
                        bestRangeSize = size;
                        bestParentLine = parentLine;
                    }
                }
            }
            parentOf.set(childLine, bestParentLine);
        }
        // Attach nested children to their parent MarkerTreeItems
        for (const childLine of markerLines) {
            const parentLine = parentOf.get(childLine);
            if (parentLine !== null && parentLine !== undefined) {
                const parentItem = itemByLine.get(parentLine);
                const childItem = itemByLine.get(childLine);
                parentItem.nestedChildren.push(childItem);
            }
        }
        // Promote parents with children to collapsible
        for (const item of itemByLine.values()) {
            if (item.nestedChildren.length > 0) {
                item.setNestedChildren(item.nestedChildren);
            }
        }
        // Top-level items: markers with no parent marker
        const topLevel = markerLines
            .filter(line => parentOf.get(line) === null)
            .map(line => itemByLine.get(line));
        // If all markers ended up at top level (no nesting), group by depth
        const allTopLevel = topLevel.length === markerLines.length;
        if (allTopLevel && markerLines.length > 1) {
            return this._groupByDepth(uri, markers, rangeInfo);
        }
        return topLevel;
    }
    /** Fallback grouping: organise markers into depth-level group nodes. */
    _groupByDepth(uri, markers, rangeInfo) {
        const depthMap = new Map();
        for (const m of markers) {
            const info = rangeInfo.find(r => r.startLine === m.line)
                ?? rangeInfo
                    .filter(r => r.startLine <= m.line && r.endLine >= m.line)
                    .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];
            const depth = info ? info.depth : 1;
            if (!depthMap.has(depth)) {
                depthMap.set(depth, []);
            }
            depthMap.get(depth).push(m);
        }
        const groups = [];
        const sortedDepths = [...depthMap.keys()].sort((a, b) => a - b);
        for (const depth of sortedDepths) {
            const items = depthMap.get(depth).map(m => new MarkerTreeItem(uri, m));
            groups.push(new MarkerGroupItem(`Level ${depth}`, items));
        }
        return groups;
    }
}
exports.FoldingTreeDataProvider = FoldingTreeDataProvider;
//# sourceMappingURL=foldingTreeView.js.map