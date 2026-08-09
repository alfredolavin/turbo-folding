"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoldingRanges = getFoldingRanges;
exports.computeFoldingDepths = computeFoldingDepths;
const vscode = require("vscode");
async function getFoldingRanges(document) {
    try {
        const ranges = await vscode.commands.executeCommand('vscode.executeFoldingRangeProvider', document.uri);
        return ranges || [];
    }
    catch {
        return [];
    }
}
function computeFoldingDepths(ranges) {
    const sorted = [...ranges].sort((a, b) => {
        if (a.start !== b.start) {
            return a.start - b.start;
        }
        return b.end - a.end;
    });
    const result = [];
    const stack = [];
    for (const r of sorted) {
        while (stack.length > 0 && stack[stack.length - 1].endLine < r.start) {
            stack.pop();
        }
        const depth = stack.length + 1;
        result.push({
            range: r,
            startLine: r.start,
            endLine: r.end,
            depth
        });
        stack.push({ endLine: r.end, depth });
    }
    return result;
}
//# sourceMappingURL=foldingManager.js.map