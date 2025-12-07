"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const MARKDOWN_LANGUAGE_ID = 'markdown';
let currentPreviewUri;
let isAdjustingFocus = false;
const previewToSide = async (editor) => {
    try {
        await vscode.commands.executeCommand('markdown.showPreviewToSide', editor.document.uri);
        currentPreviewUri = editor.document.uri;
        // Ensure the text editor retains focus after opening preview.
        await vscode.window.showTextDocument(editor.document, {
            viewColumn: editor.viewColumn,
            preserveFocus: false,
            preview: false,
        });
    }
    catch (error) {
        console.error('[auto-markdown-preview-lock] failed to open preview:', error);
    }
};
const isMarkdownEditor = (editor) => {
    return !!editor && editor.document.languageId === MARKDOWN_LANGUAGE_ID;
};
const isMarkdownPreviewTab = (tab) => {
    if (!(tab.input instanceof vscode.TabInputWebview)) {
        return false;
    }
    const viewType = tab.input.viewType.toLowerCase();
    return viewType.includes('markdown.preview');
};
const findMarkdownPreviewTab = () => {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (isMarkdownPreviewTab(tab)) {
                return { tab, group };
            }
        }
    }
    return undefined;
};
const closeMarkdownPreviewIfExists = async () => {
    const target = findMarkdownPreviewTab();
    if (!target) {
        currentPreviewUri = undefined;
        return;
    }
    try {
        await vscode.window.tabGroups.close(target.tab, true);
        currentPreviewUri = undefined;
    }
    catch (error) {
        console.error('[auto-markdown-preview-lock] failed to close markdown preview:', error);
    }
};
const ensureEditorInPrimaryColumn = async (editor) => {
    if (editor.viewColumn === vscode.ViewColumn.One) {
        return editor;
    }
    isAdjustingFocus = true;
    try {
        await vscode.commands.executeCommand('workbench.action.moveEditorToFirstGroup');
        return await vscode.window.showTextDocument(editor.document, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
            preview: false,
        });
    }
    finally {
        isAdjustingFocus = false;
    }
};
const handleActiveEditorChange = async (editor) => {
    if (isAdjustingFocus) {
        return;
    }
    // If focus moves to a webview or nowhere, do nothing to avoid closing the preview we just opened.
    if (!editor) {
        return;
    }
    if (!isMarkdownEditor(editor)) {
        await closeMarkdownPreviewIfExists();
        // Move non-Markdown back to primary column to avoid opening on the right preview side.
        await ensureEditorInPrimaryColumn(editor);
        return;
    }
    // Keep Markdown editing on the primary (left) column to prevent cascading groups on the right.
    const primaryEditor = await ensureEditorInPrimaryColumn(editor);
    // Skip reopening if we are already previewing the same document and the tab is present.
    if (currentPreviewUri?.toString() === primaryEditor.document.uri.toString() && findMarkdownPreviewTab()) {
        return;
    }
    // Close stale preview before opening a new one to avoid cascading groups.
    await closeMarkdownPreviewIfExists();
    await previewToSide(primaryEditor);
};
function activate(context) {
    console.log('Auto Markdown Preview Lock extension activated');
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        void handleActiveEditorChange(editor);
    }));
    // Handle already active editor when the extension activates.
    void handleActiveEditorChange(vscode.window.activeTextEditor);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map