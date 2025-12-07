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
const previewToSide = async (uri) => {
    try {
        await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
        // Return focus to the active editor group to avoid stealing focus to the preview.
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    }
    catch (error) {
        console.error('[auto-markdown-preview-lock] failed to open preview:', error);
    }
};
const isMarkdownEditor = (editor) => {
    return !!editor && editor.document.languageId === MARKDOWN_LANGUAGE_ID;
};
const handleActiveEditorChange = async (editor) => {
    if (!isMarkdownEditor(editor)) {
        return;
    }
    await previewToSide(editor.document.uri);
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