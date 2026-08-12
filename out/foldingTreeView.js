"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FoldingTreeDataProvider = exports.MarkerTreeItem = void 0;
const vscode = require("vscode");
const markerManager_1 = require("./markerManager");
class MarkerTreeItem extends vscode.TreeItem {
    line;
    documentUri;
    marker;
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
}
exports.MarkerTreeItem = MarkerTreeItem;
class FoldingTreeDataProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    markerManager;
    constructor(markerManager) {
        this.markerManager = markerManager;
        this.markerManager.onDidChangeMarkers(() => {
            this.refresh();
        });
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.refresh();
        });
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
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
exports.FoldingTreeDataProvider = FoldingTreeDataProvider;
//# sourceMappingURL=foldingTreeView.js.map