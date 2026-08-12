import * as vscode from 'vscode';
import { MarkerItem, MarkerManager, createSvgDataUri } from './markerManager';

export class MarkerTreeItem extends vscode.TreeItem {
    public readonly line: number;
    public readonly documentUri: vscode.Uri;
    public readonly marker: MarkerItem;

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
}

export class FoldingTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private markerManager: MarkerManager;

    constructor(markerManager: MarkerManager) {
        this.markerManager = markerManager;

        this.markerManager.onDidChangeMarkers(() => {
            this.refresh();
        });

        vscode.window.onDidChangeActiveTextEditor(() => {
            this.refresh();
        });
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            const placeholder = new vscode.TreeItem('No active text editor', vscode.TreeItemCollapsibleState.None);
            placeholder.description = 'Open a file to view markers';
            return Promise.resolve([placeholder]);
        }

        const markers = this.markerManager.getMarkers(editor.document.uri);
        if (markers.length === 0) {
            const placeholder = new vscode.TreeItem('No markers in current file', vscode.TreeItemCollapsibleState.None);
            placeholder.description = 'Toggle marker on line to add';
            return Promise.resolve([placeholder]);
        }

        const items = markers.map(m => new MarkerTreeItem(editor.document.uri, m));
        return Promise.resolve(items);
    }
}
