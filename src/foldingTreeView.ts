import * as vscode from 'vscode';
import { MarkerItem, MarkerManager, createSvgDataUri } from './markerManager';
import { getFoldingRanges, computeFoldingDepths } from './foldingManager';

// ---------------------------------------------------------------------------
// MarkerGroupItem — collapsible parent node used in tree view mode
// ---------------------------------------------------------------------------
export class MarkerGroupItem extends vscode.TreeItem {
    public readonly children: MarkerTreeItem[];

    constructor(label: string, children: MarkerTreeItem[]) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.children = children;
        this.description = `${children.length} marker${children.length !== 1 ? 's' : ''}`;
        this.contextValue = 'markerGroup';
        this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    }
}

// ---------------------------------------------------------------------------
// MarkerTreeItem — leaf node (individual marker)
// ---------------------------------------------------------------------------
export class MarkerTreeItem extends vscode.TreeItem {
    public readonly line: number;
    public readonly documentUri: vscode.Uri;
    public readonly marker: MarkerItem;
    public nestedChildren: MarkerTreeItem[] = [];

    constructor(documentUri: vscode.Uri, marker: MarkerItem) {
        super(`Line ${marker.line + 1}`, vscode.TreeItemCollapsibleState.None);
        this.line = marker.line;
        this.documentUri = documentUri;
        this.marker = marker;

        this.description = marker.text && marker.text.length > 0 ? marker.text : '(empty line)';
        this.tooltip = `Line ${marker.line + 1}: ${marker.text || '(empty line)'}\nColor: ${marker.color}\nClick to jump to line`;
        this.iconPath = createSvgDataUri(marker.color);
        this.contextValue = 'markerItem';

        this.command = {
            command: 'turboFolding.selectMarkerFromView',
            title: 'Select Marker',
            arguments: [this.documentUri, this.line]
        };
    }

    /** Promote to collapsible when it has nested children (tree view mode). */
    public setNestedChildren(children: MarkerTreeItem[]) {
        this.nestedChildren = children;
        this.collapsibleState = children.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None;
    }
}

// ---------------------------------------------------------------------------
// FoldingTreeDataProvider
// ---------------------------------------------------------------------------
export class FoldingTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private markerManager: MarkerManager;
    private _treeViewMode: boolean = false;

    constructor(markerManager: MarkerManager) {
        this.markerManager = markerManager;

        this.markerManager.onDidChangeMarkers(() => {
            this.refresh();
        });

        vscode.window.onDidChangeActiveTextEditor(() => {
            this.refresh();
        });
    }

    public get treeViewMode(): boolean {
        return this._treeViewMode;
    }

    public setTreeViewMode(value: boolean): void {
        this._treeViewMode = value;
        this.refresh();
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
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

    private async _buildTreeItems(
        uri: vscode.Uri,
        markers: MarkerItem[],
        document: vscode.TextDocument
    ): Promise<vscode.TreeItem[]> {
        const rawRanges = await getFoldingRanges(document);

        if (rawRanges.length === 0) {
            // No folding info — fall back to flat list
            return markers.map(m => new MarkerTreeItem(uri, m));
        }

        const rangeInfo = computeFoldingDepths(rawRanges);

        // Build a map: markerLine → MarkerTreeItem
        const itemByLine = new Map<number, MarkerTreeItem>();
        for (const m of markers) {
            itemByLine.set(m.line, new MarkerTreeItem(uri, m));
        }

        const markerLines = markers.map(m => m.line).sort((a, b) => a - b);

        // For each marker find its tightest enclosing marker (parent).
        // A marker P is the parent of C when there is a folding range that
        // starts at P.line and ends >= C.line, and no other marked line
        // between P and C also covers C.
        const parentOf = new Map<number, number | null>(); // childLine → parentLine | null

        for (const childLine of markerLines) {
            let bestParentLine: number | null = null;
            let bestRangeSize = Infinity;

            for (const parentLine of markerLines) {
                if (parentLine >= childLine) { continue; }

                // Find a folding range that starts at parentLine and contains childLine
                const coveringRange = rawRanges.find(
                    r => r.start === parentLine && r.end >= childLine
                );

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
                const parentItem = itemByLine.get(parentLine)!;
                const childItem = itemByLine.get(childLine)!;
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
            .map(line => itemByLine.get(line)!);

        // If all markers ended up at top level (no nesting), group by depth
        const allTopLevel = topLevel.length === markerLines.length;
        if (allTopLevel && markerLines.length > 1) {
            return this._groupByDepth(uri, markers, rangeInfo);
        }

        return topLevel;
    }

    /** Fallback grouping: organise markers into depth-level group nodes. */
    private _groupByDepth(
        uri: vscode.Uri,
        markers: MarkerItem[],
        rangeInfo: ReturnType<typeof computeFoldingDepths>
    ): vscode.TreeItem[] {
        const depthMap = new Map<number, MarkerItem[]>();

        for (const m of markers) {
            const info = rangeInfo.find(r => r.startLine === m.line)
                ?? rangeInfo
                    .filter(r => r.startLine <= m.line && r.endLine >= m.line)
                    .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];

            const depth = info ? info.depth : 1;
            if (!depthMap.has(depth)) { depthMap.set(depth, []); }
            depthMap.get(depth)!.push(m);
        }

        const groups: MarkerGroupItem[] = [];
        const sortedDepths = [...depthMap.keys()].sort((a, b) => a - b);

        for (const depth of sortedDepths) {
            const items = depthMap.get(depth)!.map(m => new MarkerTreeItem(uri, m));
            groups.push(new MarkerGroupItem(`Level ${depth}`, items));
        }

        return groups;
    }
}
