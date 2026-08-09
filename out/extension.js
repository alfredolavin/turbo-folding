"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const foldingManager_1 = require("./foldingManager");
const markerManager_1 = require("./markerManager");
function activate(context) {
    const markerManager = new markerManager_1.MarkerManager(context);
    context.subscriptions.push(markerManager);
    let isAutoModeProcessing = false;
    // Toggle Auto Mode
    const toggleAutoModeCmd = vscode.commands.registerCommand('turboFolding.toggleAutoMode', async () => {
        const config = vscode.workspace.getConfiguration('turboFolding');
        const currentVal = config.get('autoMode.enabled', false);
        await config.update('autoMode.enabled', !currentVal, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Turbo Folding Auto Mode: ${!currentVal ? 'ENABLED' : 'DISABLED'}`);
        if (!currentVal && vscode.window.activeTextEditor) {
            await handleAutoFolding(vscode.window.activeTextEditor);
        }
    });
    // Toggle Marker on line
    const toggleMarkerCmd = vscode.commands.registerCommand('turboFolding.toggleMarker', (args) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            let lineNumber;
            if (typeof args === 'number') {
                lineNumber = args;
            }
            else if (args && typeof args.lineNumber === 'number') {
                // VS Code gutter context menu passes 1-indexed lineNumber in args, convert to 0-indexed line
                lineNumber = args.lineNumber - 1;
            }
            else if (args && typeof args.line === 'number') {
                lineNumber = args.line;
            }
            markerManager.toggleMarker(editor, lineNumber);
        }
    });
    // Clear all markers
    const clearAllMarkersCmd = vscode.commands.registerCommand('turboFolding.clearAllMarkers', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            markerManager.clearAll(editor);
        }
    });
    // Fold marked regions except current
    const foldMarkedExceptCurrentCmd = vscode.commands.registerCommand('turboFolding.foldMarkedExceptCurrent', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const markedLines = markerManager.getMarkedLines(editor);
        if (markedLines.length === 0) {
            vscode.window.showInformationMessage('Turbo Folding: No markers placed in current document.');
            return;
        }
        const cursorLine = editor.selection.active.line;
        const rawRanges = await (0, foldingManager_1.getFoldingRanges)(editor.document);
        if (rawRanges.length === 0) {
            return;
        }
        const linesToFold = [];
        for (const markedLine of markedLines) {
            // Find folding ranges starting on or containing markedLine
            const matchingRanges = rawRanges.filter(r => r.start === markedLine || (r.start <= markedLine && r.end >= markedLine));
            for (const r of matchingRanges) {
                // Exclude range if cursor is inside [r.start, r.end]
                if (cursorLine >= r.start && cursorLine <= r.end) {
                    continue;
                }
                linesToFold.push(r.start);
            }
        }
        if (linesToFold.length > 0) {
            await vscode.commands.executeCommand('editor.fold', {
                selectionLines: linesToFold
            });
        }
    });
    // Auto Mode Logic Handler
    async function handleAutoFolding(editor) {
        const config = vscode.workspace.getConfiguration('turboFolding');
        const enabled = config.get('autoMode.enabled', false);
        if (!enabled || isAutoModeProcessing) {
            return;
        }
        isAutoModeProcessing = true;
        try {
            const prevDepth = config.get('autoMode.previousDepth', 1);
            const nextDepth = config.get('autoMode.nextDepth', 1);
            const cursorLine = editor.selection.active.line;
            const rawRanges = await (0, foldingManager_1.getFoldingRanges)(editor.document);
            if (rawRanges.length === 0) {
                return;
            }
            const rangesInfo = (0, foldingManager_1.computeFoldingDepths)(rawRanges);
            const linesToFold = [];
            const linesToUnfold = [];
            for (const info of rangesInfo) {
                const isCurrent = cursorLine >= info.startLine && cursorLine <= info.endLine;
                if (isCurrent) {
                    linesToUnfold.push(info.startLine);
                }
                else if (info.endLine < cursorLine) {
                    // Previous section
                    if (info.depth >= prevDepth) {
                        linesToFold.push(info.startLine);
                    }
                }
                else if (info.startLine > cursorLine) {
                    // Next section
                    if (info.depth >= nextDepth) {
                        linesToFold.push(info.startLine);
                    }
                }
            }
            if (linesToUnfold.length > 0) {
                await vscode.commands.executeCommand('editor.unfold', {
                    selectionLines: linesToUnfold
                });
            }
            if (linesToFold.length > 0) {
                await vscode.commands.executeCommand('editor.fold', {
                    selectionLines: linesToFold
                });
            }
        }
        finally {
            isAutoModeProcessing = false;
        }
    }
    // Event Listeners
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            markerManager.updateDecorations(editor);
            handleAutoFolding(editor);
        }
    }), vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor === vscode.window.activeTextEditor) {
            handleAutoFolding(event.textEditor);
        }
    }), toggleAutoModeCmd, toggleMarkerCmd, clearAllMarkersCmd, foldMarkedExceptCurrentCmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map