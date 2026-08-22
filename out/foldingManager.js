"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoldingRanges = getFoldingRanges;
exports.computeFoldingDepths = computeFoldingDepths;
exports.getDocumentSymbols = getDocumentSymbols;
exports.flattenSymbols = flattenSymbols;
exports.getTagNameAndIndentAt = getTagNameAndIndentAt;
exports.getMarkdownHeadingAtLine = getMarkdownHeadingAtLine;
exports.getKeywordSemanticType = getKeywordSemanticType;
exports.resolveSemanticInfo = resolveSemanticInfo;
exports.isSameSemanticType = isSameSemanticType;
exports.findSameTagLinesAtSameLevel = findSameTagLinesAtSameLevel;
exports.findFoldablesAtSameLevel = findFoldablesAtSameLevel;
exports.isCommentText = isCommentText;
exports.getCommentBeforeLine = getCommentBeforeLine;
const vscode = require("vscode");
async function getFoldingRanges(document) {
    try {
        const ranges = await vscode.commands.executeCommand("vscode.executeFoldingRangeProvider", document.uri);
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
async function getDocumentSymbols(document) {
    try {
        const symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri);
        return symbols || [];
    }
    catch {
        return [];
    }
}
function getSymbolSemanticGroup(kind) {
    switch (kind) {
        case vscode.SymbolKind.Function:
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Constructor:
            return "function";
        case vscode.SymbolKind.Class:
        case vscode.SymbolKind.Struct:
            return "class";
        case vscode.SymbolKind.Interface:
        case vscode.SymbolKind.TypeParameter:
            return "interface";
        case vscode.SymbolKind.Enum:
        case vscode.SymbolKind.EnumMember:
            return "enum";
        case vscode.SymbolKind.Property:
        case vscode.SymbolKind.Field:
            return "property";
        case vscode.SymbolKind.Variable:
        case vscode.SymbolKind.Constant:
            return "variable";
        case vscode.SymbolKind.Module:
        case vscode.SymbolKind.Namespace:
        case vscode.SymbolKind.Package:
            return "module";
        case vscode.SymbolKind.Object:
        case vscode.SymbolKind.Array:
        case vscode.SymbolKind.Key:
            return "data_structure";
        default:
            return "other";
    }
}
function flattenSymbols(symbols) {
    const result = [];
    function processItem(item) {
        if ("range" in item && item.range) {
            const group = getSymbolSemanticGroup(item.kind);
            result.push({
                name: item.name,
                kind: item.kind,
                kindName: vscode.SymbolKind[item.kind]?.toLowerCase() || "symbol",
                semanticGroup: group,
                startLine: item.range.start.line,
                endLine: item.range.end.line
            });
            if (item.children && Array.isArray(item.children)) {
                for (const child of item.children) {
                    processItem(child);
                }
            }
        }
        else if ("location" in item && item.location && item.location.range) {
            const group = getSymbolSemanticGroup(item.kind);
            result.push({
                name: item.name,
                kind: item.kind,
                kindName: vscode.SymbolKind[item.kind]?.toLowerCase() || "symbol",
                semanticGroup: group,
                startLine: item.location.range.start.line,
                endLine: item.location.range.end.line
            });
        }
    }
    for (const sym of symbols) {
        processItem(sym);
    }
    return result;
}
function findSymbolStartingAtLine(symbols, line) {
    const exact = symbols.filter(s => s.startLine === line);
    if (exact.length > 0) {
        return exact.sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];
    }
    return null;
}
/**
 * Returns the tag name (or first identifier) and indentation column of a given line.
 */
function getTagNameAndIndentAt(document, line) {
    if (line < 0 || line >= document.lineCount) {
        return { tagName: null, indent: 0, isClosingTag: false };
    }
    const lineText = document.lineAt(line).text;
    const indent = lineText.length - lineText.trimStart().length;
    const trimmed = lineText.trimStart();
    // HTML/XML closing tag: </tagName
    const closingMatch = trimmed.match(/^<\/([A-Za-z][A-Za-z0-9._:-]*)/);
    if (closingMatch) {
        const raw = closingMatch[1];
        const normalized = /^[A-Z]/.test(raw) ? raw : raw.toLowerCase();
        return { tagName: normalized, indent, isClosingTag: true };
    }
    // HTML/XML opening or self-closing tag: <tagName
    const htmlMatch = trimmed.match(/^<([A-Za-z][A-Za-z0-9._:-]*)/);
    if (htmlMatch) {
        const raw = htmlMatch[1];
        const normalized = /^[A-Z]/.test(raw) ? raw : raw.toLowerCase();
        return { tagName: normalized, indent, isClosingTag: false };
    }
    // JSX fragment: <>
    if (trimmed.startsWith("<>")) {
        return { tagName: "<fragment>", indent, isClosingTag: false };
    }
    // JSX inline return / assignment / wrapper
    const inlineJsxMatch = trimmed.match(/(?:return\s*\(?|\=\s*\(?|\(\s*)<([A-Za-z][A-Za-z0-9._:-]*)/);
    if (inlineJsxMatch) {
        const raw = inlineJsxMatch[1];
        const normalized = /^[A-Z]/.test(raw) ? raw : raw.toLowerCase();
        return { tagName: normalized, indent, isClosingTag: false };
    }
    // Generic: first word token (handles function names, class names, etc.)
    const wordMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$-]*)/);
    if (wordMatch) {
        return { tagName: wordMatch[1], indent, isClosingTag: false };
    }
    return { tagName: null, indent, isClosingTag: false };
}
function getMarkdownHeadingAtLine(document, line) {
    if (line < 0 || line >= document.lineCount) {
        return null;
    }
    const text = document.lineAt(line).text.trimStart();
    const match = text.match(/^(#{1,6})\s+/);
    if (match) {
        return `h${match[1].length}`;
    }
    return null;
}
function getKeywordSemanticType(text) {
    const trimmed = text.trimStart();
    // Markdown heading
    const md = trimmed.match(/^(#{1,6})\s+/);
    if (md) {
        return `md:h${md[1].length}`;
    }
    // Function declarations & definitions
    if (/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/.test(trimmed) ||
        /^(?:pub\s+|public\s+|private\s+|protected\s+|static\s+|override\s+|async\s+)*(?:def|fn|func|function|sub|procedure)\b/.test(trimmed) ||
        /^(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/.test(trimmed) ||
        /^(?:public|private|protected|static|async|get|set|\*|\s)*[A-Za-z0-9_$]+\s*\([^)]*\)\s*(?::\s*[^={]+)?\s*\{/.test(trimmed)) {
        return "kw:function";
    }
    // Class / Struct / Interface / Type / Enum
    if (/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\b/.test(trimmed)) {
        return "kw:class";
    }
    if (/^(?:export\s+)?interface\b/.test(trimmed)) {
        return "kw:interface";
    }
    if (/^(?:export\s+)?type\s+[A-Za-z0-9_$]+\s*=/.test(trimmed)) {
        return "kw:interface";
    }
    if (/^(?:pub\s+)?struct\b/.test(trimmed)) {
        return "kw:class";
    }
    if (/^(?:pub\s+)?enum\b/.test(trimmed)) {
        return "kw:enum";
    }
    if (/^(?:pub\s+)?trait\b|^impl\b/.test(trimmed)) {
        return "kw:class";
    }
    // Imports / Exports
    if (/^(?:import\b|from\b|require\b|include\b|use\b)/.test(trimmed)) {
        return "kw:import";
    }
    if (/^export\b/.test(trimmed)) {
        return "kw:export";
    }
    // Control flow
    if (/^(?:if\b|elif\b|else\b|else\s+if\b)/.test(trimmed)) {
        return "kw:if_branch";
    }
    if (/^(?:for\b|while\b|loop\b|do\b)/.test(trimmed)) {
        return "kw:loop";
    }
    if (/^(?:switch\b|match\b|case\b)/.test(trimmed)) {
        return "kw:switch_match";
    }
    if (/^(?:try\b|catch\b|except\b|finally\b)/.test(trimmed)) {
        return "kw:try_catch";
    }
    // Property / Object / JSON key
    if (/^(?:"[^"]+"|'[^']+'|[A-Za-z0-9_$]+)\s*:\s*[{[]/.test(trimmed)) {
        return "kw:prop_container";
    }
    if (/^(?:"[^"]+"|'[^']+'|[A-Za-z0-9_$]+)\s*:/.test(trimmed)) {
        return "kw:property";
    }
    // Array / List items (YAML, Markdown)
    if (/^-\s+/.test(trimmed)) {
        return "kw:list_item";
    }
    return null;
}
function resolveSemanticInfo(document, line, symbols = []) {
    if (line < 0 || line >= document.lineCount) {
        return null;
    }
    const lineText = document.lineAt(line).text;
    const trimmed = lineText.trim();
    if (!trimmed) {
        return null;
    }
    // 1. Check HTML/XML/JSX Tag
    const tagInfo = getTagNameAndIndentAt(document, line);
    if (tagInfo && tagInfo.tagName && !tagInfo.isClosingTag) {
        const trimmedStart = lineText.trimStart();
        if (trimmedStart.startsWith("<") || /(?:return\s*\(?|\=\s*\(?|\(\s*)<[A-Za-z]/.test(trimmedStart)) {
            return {
                typeId: `tag:${tagInfo.tagName}`,
                displayName: `<${tagInfo.tagName}>`,
                category: "tag"
            };
        }
    }
    // 2. Check Markdown Heading
    const mdHeading = getMarkdownHeadingAtLine(document, line);
    if (mdHeading) {
        const levelNum = parseInt(mdHeading.slice(1), 10);
        return {
            typeId: `md:${mdHeading}`,
            displayName: `${"#".repeat(levelNum)} Heading`,
            category: "heading"
        };
    }
    // 3. Check VS Code Document Symbols
    const sym = findSymbolStartingAtLine(symbols, line);
    if (sym) {
        return {
            typeId: `sym:${sym.semanticGroup}`,
            displayName: sym.semanticGroup,
            category: sym.semanticGroup
        };
    }
    // 4. Check Regex Keyword patterns
    const kwType = getKeywordSemanticType(lineText);
    if (kwType) {
        if (kwType.startsWith("md:")) {
            const level = kwType.split(":")[1];
            const levelNum = parseInt(level.slice(1), 10);
            return {
                typeId: kwType,
                displayName: `${"#".repeat(levelNum)} Heading`,
                category: "heading"
            };
        }
        const group = kwType.replace("kw:", "");
        return {
            typeId: kwType,
            displayName: group,
            category: group
        };
    }
    return null;
}
function isSameSemanticType(refInfo, candInfo) {
    if (!refInfo) {
        return true;
    }
    if (!candInfo) {
        return false;
    }
    if (refInfo.typeId === candInfo.typeId) {
        return true;
    }
    if (refInfo.category && candInfo.category && refInfo.category === candInfo.category) {
        if (refInfo.category === "tag") {
            return refInfo.typeId === candInfo.typeId;
        }
        if (refInfo.category === "heading") {
            return refInfo.typeId === candInfo.typeId;
        }
        return true;
    }
    return false;
}
/**
 * Scans the document and returns all line numbers where the same tag name
 * appears at the same indentation depth as the reference line.
 */
function findSameTagLinesAtSameLevel(document, referenceLine) {
    const refInfo = getTagNameAndIndentAt(document, referenceLine);
    const { tagName, indent } = refInfo;
    if (tagName === null) {
        return [referenceLine];
    }
    const matches = [];
    for (let i = 0; i < document.lineCount; i++) {
        const info = getTagNameAndIndentAt(document, i);
        if (info.tagName === tagName && info.indent === indent && !info.isClosingTag) {
            matches.push(i);
        }
    }
    return matches;
}
/**
 * Returns all line numbers that start a foldable block at the same
 * indentation level as the reference line.
 * If sameTypeOnly is true and semantic info is available, filters to only items
 * with the same tag name, function, class, or semantic type.
 */
async function findFoldablesAtSameLevel(document, referenceLine, sameTypeOnly = true) {
    const refLineText = document.lineAt(referenceLine).text;
    const refIndent = refLineText.length - refLineText.trimStart().length;
    const ranges = await getFoldingRanges(document);
    if (ranges.length === 0) {
        return [referenceLine];
    }
    const rangeInfo = computeFoldingDepths(ranges);
    const refRangeInfo = rangeInfo.find(r => r.startLine === referenceLine)
        ?? rangeInfo
            .filter(r => r.startLine <= referenceLine && r.endLine >= referenceLine)
            .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];
    const refDepth = refRangeInfo ? refRangeInfo.depth : 1;
    // Collect all folding-range starts that share depth AND indentation
    const candidateLines = [];
    for (const info of rangeInfo) {
        if (info.depth !== refDepth) {
            continue;
        }
        const lineText = document.lineAt(info.startLine).text;
        const lineIndent = lineText.length - lineText.trimStart().length;
        if (lineIndent === refIndent) {
            candidateLines.push(info.startLine);
        }
    }
    let matches = candidateLines;
    // If semantic filtering is enabled, check tag name / function / class / etc.
    if (sameTypeOnly) {
        const rawSymbols = await getDocumentSymbols(document);
        const symbols = flattenSymbols(rawSymbols);
        const refSemantic = resolveSemanticInfo(document, referenceLine, symbols);
        if (refSemantic !== null) {
            const filtered = candidateLines.filter(line => {
                const candSemantic = resolveSemanticInfo(document, line, symbols);
                return isSameSemanticType(refSemantic, candSemantic);
            });
            if (filtered.length > 0) {
                matches = filtered;
            }
        }
    }
    // Always include the reference line even if it has no own fold range
    if (!matches.includes(referenceLine)) {
        matches.push(referenceLine);
        matches.sort((a, b) => a - b);
    }
    return matches;
}
/**
 * Checks if a trimmed line is a comment in common programming or markup languages.
 */
function isCommentText(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }
    return (trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('<!--') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('--') ||
        trimmed.startsWith(';') ||
        trimmed.startsWith('{-') ||
        trimmed.startsWith('(*') ||
        trimmed.startsWith('%') ||
        trimmed.startsWith("'") ||
        /^rem\b/i.test(trimmed) ||
        (trimmed.startsWith('"""') && trimmed.endsWith('"""') && trimmed.length >= 6) ||
        (trimmed.startsWith("'''") && trimmed.endsWith("'''") && trimmed.length >= 6));
}
/**
 * If the line immediately preceding the given line in the document is a comment
 * and its trimmed length is smaller than 40 characters, returns the trimmed comment.
 * Otherwise returns null.
 */
function getCommentBeforeLine(document, line) {
    if (line <= 0 || line >= document.lineCount) {
        return null;
    }
    const prevLineText = document.lineAt(line - 1).text;
    const trimmed = prevLineText.trim();
    if (trimmed.length > 0 && trimmed.length < 40 && isCommentText(trimmed)) {
        return trimmed;
    }
    return null;
}
//# sourceMappingURL=foldingManager.js.map