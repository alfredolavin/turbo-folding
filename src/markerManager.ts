import * as vscode from 'vscode';

export class MarkerManager {
    private decorationType: vscode.TextEditorDecorationType;
    // Map document URI string -> Set of line numbers (0-indexed)
    private markers: Map<string, Set<number>> = new Map();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        const iconPath = vscode.Uri.file(context.asAbsolutePath('resources/green-dot.svg'));
        this.decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: iconPath,
            gutterIconSize: 'contain'
        });

        this.loadMarkers();
    }

    private loadMarkers() {
        const saved = this.context.workspaceState.get<Record<string, number[]>>('turboFolding.savedMarkers', {});
        for (const [uriStr, lines] of Object.entries(saved)) {
            if (Array.isArray(lines) && lines.length > 0) {
                this.markers.set(uriStr, new Set(lines));
            }
        }
    }

    private async saveMarkers() {
        const data: Record<string, number[]> = {};
        for (const [uriStr, lineSet] of this.markers.entries()) {
            if (lineSet.size > 0) {
                data[uriStr] = Array.from(lineSet);
            }
        }
        await this.context.workspaceState.update('turboFolding.savedMarkers', data);
    }

    public toggleMarker(editor: vscode.TextEditor, lineNumber?: number) {
        const docUri = editor.document.uri.toString();
        if (!this.markers.has(docUri)) {
            this.markers.set(docUri, new Set());
        }

        const lineSet = this.markers.get(docUri)!;
        const lineToToggle = lineNumber !== undefined ? lineNumber : editor.selection.active.line;

        if (lineSet.has(lineToToggle)) {
            lineSet.delete(lineToToggle);
        } else {
            lineSet.add(lineToToggle);
        }

        if (lineSet.size === 0) {
            this.markers.delete(docUri);
        }

        this.saveMarkers();
        this.updateDecorations(editor);
    }

    public getMarkedLines(editor: vscode.TextEditor): number[] {
        const docUri = editor.document.uri.toString();
        const lineSet = this.markers.get(docUri);
        return lineSet ? Array.from(lineSet) : [];
    }

    public clearAll(editor: vscode.TextEditor) {
        const docUri = editor.document.uri.toString();
        this.markers.delete(docUri);
        this.saveMarkers();
        this.updateDecorations(editor);
    }

    public updateDecorations(editor: vscode.TextEditor) {
        const docUri = editor.document.uri.toString();
        const lineSet = this.markers.get(docUri);
        if (!lineSet || lineSet.size === 0) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const ranges: vscode.Range[] = [];
        for (const line of lineSet) {
            if (line < editor.document.lineCount) {
                ranges.push(new vscode.Range(line, 0, line, 0));
            }
        }
        editor.setDecorations(this.decorationType, ranges);
    }

    public dispose() {
        this.decorationType.dispose();
    }
}

