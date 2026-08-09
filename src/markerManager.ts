import * as vscode from 'vscode';

export class MarkerManager {
    private decorationType: vscode.TextEditorDecorationType;
    // Map document URI string -> Set of line numbers (0-indexed)
    private markers: Map<string, Set<number>> = new Map();

    constructor(context: vscode.ExtensionContext) {
        const iconPath = vscode.Uri.file(context.asAbsolutePath('resources/green-dot.svg'));
        this.decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: iconPath,
            gutterIconSize: 'contain'
        });
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
