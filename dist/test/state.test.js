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
const assert = __importStar(require("assert"));
const state_1 = require("../state");
const vscode = __importStar(require("vscode"));
suite('state management', () => {
    setup(() => {
        (0, state_1.resetAllState)();
    });
    test('initial state is defaults', () => {
        const state = (0, state_1.getPreviewState)();
        assert.strictEqual(state.currentPreviewUri, undefined);
        assert.strictEqual(state.lastActiveKind, 'non-markdown');
        assert.strictEqual(state.isPreviewLocked, false);
    });
    test('sets preview uri and locked flag', () => {
        const uri = vscode.Uri.file('/tmp/example.md');
        (0, state_1.setCurrentPreviewUri)(uri);
        (0, state_1.setPreviewLocked)(true);
        const state = (0, state_1.getPreviewState)();
        assert.strictEqual(state.currentPreviewUri?.fsPath, uri.fsPath);
        assert.strictEqual(state.isPreviewLocked, true);
    });
    test('resetPreviewState clears preview but keeps lastActiveKind', () => {
        (0, state_1.setLastActiveKind)('markdown');
        (0, state_1.setCurrentPreviewUri)(vscode.Uri.file('/tmp/example.md'));
        (0, state_1.setPreviewLocked)(true);
        (0, state_1.resetPreviewState)();
        const state = (0, state_1.getPreviewState)();
        assert.strictEqual(state.currentPreviewUri, undefined);
        assert.strictEqual(state.isPreviewLocked, false);
        assert.strictEqual(state.lastActiveKind, 'markdown');
    });
    test('resetAllState resets everything', () => {
        (0, state_1.setLastActiveKind)('markdown');
        (0, state_1.setCurrentPreviewUri)(vscode.Uri.file('/tmp/example.md'));
        (0, state_1.setPreviewLocked)(true);
        (0, state_1.resetAllState)();
        const state = (0, state_1.getPreviewState)();
        assert.strictEqual(state.currentPreviewUri, undefined);
        assert.strictEqual(state.isPreviewLocked, false);
        assert.strictEqual(state.lastActiveKind, 'non-markdown');
    });
});
//# sourceMappingURL=state.test.js.map