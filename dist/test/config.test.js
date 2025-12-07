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
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const withMockConfiguration = (values, fn) => {
    const original = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = () => ({
        get: (key) => values[key],
    });
    try {
        fn();
    }
    finally {
        vscode.workspace.getConfiguration = original;
    }
};
suite('config getAutoMdPreviewConfig', () => {
    test('returns defaults when config is empty', () => {
        withMockConfiguration({}, () => {
            const config = (0, config_1.getAutoMdPreviewConfig)();
            assert.deepStrictEqual(config, config_1.DEFAULT_CONFIG);
        });
    });
    test('respects boolean overrides', () => {
        withMockConfiguration({
            enableAutoPreview: false,
            closePreviewOnNonMarkdown: false,
            alwaysOpenInPrimaryEditor: false,
        }, () => {
            const config = (0, config_1.getAutoMdPreviewConfig)();
            assert.deepStrictEqual(config, {
                enableAutoPreview: false,
                closePreviewOnNonMarkdown: false,
                alwaysOpenInPrimaryEditor: false,
            });
        });
    });
    test('falls back to defaults on invalid values', () => {
        withMockConfiguration({
            enableAutoPreview: 'yes',
            alwaysOpenInPrimaryEditor: 'no',
        }, () => {
            const config = (0, config_1.getAutoMdPreviewConfig)();
            assert.deepStrictEqual(config, {
                enableAutoPreview: true,
                closePreviewOnNonMarkdown: true,
                alwaysOpenInPrimaryEditor: true,
            });
        });
    });
});
//# sourceMappingURL=config.test.js.map