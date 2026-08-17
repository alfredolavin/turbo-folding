import * as vscode from 'vscode';
import { MarkerItem, MarkerManager, createSvgDataUri } from './markerManager';
import { getFoldingRanges, computeFoldingDepths, FoldingRangeInfo } from './foldingManager';

// ---------------------------------------------------------------------------
// MarkerTreeItem — leaf or parent node in the folding markers list / tree
// ---------------------------------------------------------------------------
export class MarkerTreeItem extends vscode.TreeItem {
    public readonly line: number;
    public readonly documentUri: vscode.Uri;
    public readonly marker: MarkerItem;
    public readonly depth: number;
    public nestedChildren: MarkerTreeItem[] = [];
    public parent?: MarkerTreeItem;

    constructor(
        documentUri: vscode.Uri,
        marker: MarkerItem,
        depth: number = 1,
        applyIndentation: boolean = false
    ) {
        // Arrow indentation: "->" with 2 extra "-" at the beginning for each folding level up to level 8
        const clampedLevel = Math.min(Math.max(1, depth), 8);
        const indentPrefix = applyIndentation ? `${'-'.repeat(2 * (clampedLevel - 1))}-> ` : '';
        super(`${indentPrefix}Line ${marker.line + 1}`, vscode.TreeItemCollapsibleState.None);

        this.line = marker.line;
        this.documentUri = documentUri;
        this.marker = marker;
        this.depth = depth;

        this.description = marker.text && marker.text.length > 0 ? marker.text : '(empty line)';
        this.tooltip = `Line ${marker.line + 1} (Level ${depth}): ${marker.text || '(empty line)'}\nColor: ${marker.color}\nClick to jump to line`;
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
        for (const child of children) {
            child.parent = this;
        }
        this.collapsibleState = children.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None;

        if (children.length > 0) {
            this.tooltip = `Line ${this.line + 1} (Level ${this.depth}): ${this.marker.text || '(empty line)'}\nColor: ${this.marker.color}\n${children.length} nested marker${children.length !== 1 ? 's' : ''}\nClick to jump to line`;
        }
    }
}

interface MarkerFoldingScope {
    start: number;
    end: number;
}

/**
 * Returns the effective folding scope [start, end] initiated by the given marker line.
 * If the line does not initiate a folding block, returns null.
 */
function getMarkerFoldingScope(
    markerLine: number,
    rawRanges: vscode.FoldingRange[]
): MarkerFoldingScope | null {
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
    const headerCandidates = rawRanges.filter(
        r => r.start < markerLine && r.end >= markerLine && (markerLine - r.start) <= 5
    );
    if (headerCandidates.length > 0) {
        // Pick the closest start line
        headerCandidates.sort((a, b) => b.start - a.start);
        const best = headerCandidates[0];
        return { start: best.start, end: best.end };
    }

    return null;
}

/**
 * Resolves the depth level of a given line from folding ranges or indentation fallback.
 */
function resolveMarkerDepth(
    markerLine: number,
    rangeInfo: FoldingRangeInfo[],
    document: vscode.TextDocument
): number {
    if (rangeInfo.length > 0) {
        const exact = rangeInfo.find(r => r.startLine === markerLine);
        if (exact) {
            return exact.depth;
        }

        const enclosing = rangeInfo
            .filter(r => r.startLine <= markerLine && r.endLine >= markerLine)
            .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine));

        if (enclosing.length > 0) {
            return enclosing[0].depth;
        }
    }

    if (markerLine >= 0 && markerLine < document.lineCount) {
        const lineText = document.lineAt(markerLine).text;
        const indent = lineText.length - lineText.trimStart().length;
        return Math.max(1, Math.floor(indent / 2) + 1);
    }

    return 1;
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

    public getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
        if (element instanceof MarkerTreeItem) {
            return element.parent;
        }
        return undefined;
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
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

        const rawRanges = await getFoldingRanges(editor.document);
        const rangeInfo = computeFoldingDepths(rawRanges);

        if (!this._treeViewMode) {
            // ── Flat list with arrow indentation per level up to level 8 ──
            return markers.map(m => {
                const depth = resolveMarkerDepth(m.line, rangeInfo, editor.document);
                return new MarkerTreeItem(editor.document.uri, m, depth, true);
            });
        }

        // ── Hierarchical Tree view mode ────────────────────────────────────
        return this._buildTreeItems(editor.document.uri, markers, editor.document, rawRanges, rangeInfo);
    }

    // -----------------------------------------------------------------------
    // Tree-building helpers
    // -----------------------------------------------------------------------

    private _buildTreeItems(
        uri: vscode.Uri,
        markers: MarkerItem[],
        document: vscode.TextDocument,
        rawRanges: vscode.FoldingRange[],
        rangeInfo: FoldingRangeInfo[]
    ): vscode.TreeItem[] {
        if (rawRanges.length === 0 || markers.length <= 1) {
            // No folding info or single marker — return flat list of marker items with arrow indentation
            return markers.map(m => {
                const depth = resolveMarkerDepth(m.line, rangeInfo, document);
                return new MarkerTreeItem(uri, m, depth, true);
            });
        }

        // 1. Build a map: markerLine → MarkerTreeItem
        const itemByLine = new Map<number, MarkerTreeItem>();
        for (const m of markers) {
            const depth = resolveMarkerDepth(m.line, rangeInfo, document);
            itemByLine.set(m.line, new MarkerTreeItem(uri, m, depth, false));
        }

        const markerLines = markers.map(m => m.line).sort((a, b) => a - b);

        // 2. Precompute the effective folding scope for each marker
        const scopeByLine = new Map<number, MarkerFoldingScope | null>();
        for (const line of markerLines) {
            scopeByLine.set(line, getMarkerFoldingScope(line, rawRanges));
        }

        // 3. For each marker, find its tightest enclosing parent marker.
        // A marker P is an enclosing parent of C if:
        //   - P.line < C.line
        //   - P has a folding scope [P.start, P.end]
        //   - C.line is enclosed: P.start <= C.line <= P.end
        // The direct parent is the candidate with the smallest scope span (P.end - P.start).
        const parentOf = new Map<number, number | null>(); // childLine → parentLine | null

        for (const childLine of markerLines) {
            let bestParentLine: number | null = null;
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
                const parentItem = itemByLine.get(parentLine)!;
                const childItem = itemByLine.get(childLine)!;
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
            .map(line => itemByLine.get(line)!);

        return topLevel;
    }
}
