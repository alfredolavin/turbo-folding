"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoldingRanges = getFoldingRanges;
exports.computeFoldingDepths = computeFoldingDepths;
exports.getTagNameAndIndentAt = getTagNameAndIndentAt;
exports.findSameTagLinesAtSameLevel = findSameTagLinesAtSameLevel;
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
/**
 * Returns the tag name (or first identifier) and indentation column of a given line.
 * Works for HTML/XML tags (<tagName), TypeScript/JS function/class declarations,
 * and falls back to the first word on the line.
 */
function getTagNameAndIndentAt(document, line) {
    if (line < 0 || line >= document.lineCount) {
        return { tagName: null, indent: 0 };
    }
    const lineText = document.lineAt(line).text;
    // Indentation = number of leading spaces/tabs
    const indent = lineText.length - lineText.trimStart().length;
    const trimmed = lineText.trimStart();
    // HTML/XML opening tag: <tagName or </tagName
    const htmlMatch = trimmed.match(/^<\/?([A-Za-z][A-Za-z0-9._:-]*)/);
    if (htmlMatch) {
        return { tagName: htmlMatch[1].toLowerCase(), indent };
    }
    // Generic: first word token (handles function names, class names, etc.)
    const wordMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$-]*)/);
    if (wordMatch) {
        return { tagName: wordMatch[1], indent };
    }
    return { tagName: null, indent };
}
/**
 * Scans the document and returns all line numbers where the same tag name
 * appears at the same indentation depth as the reference line.
 */
function findSameTagLinesAtSameLevel(document, referenceLine) {
    const { tagName, indent } = getTagNameAndIndentAt(document, referenceLine);
    if (tagName === null) {
        return [referenceLine];
    }
    const matches = [];
    for (let i = 0; i < document.lineCount; i++) {
        const info = getTagNameAndIndentAt(document, i);
        if (info.tagName === tagName && info.indent === indent) {
            matches.push(i);
        }
    }
    return matches;
}
//# sourceMappingURL=foldingManager.js.map