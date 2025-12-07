"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetAllState = exports.resetPreviewState = exports.setPreviewLocked = exports.setLastActiveKind = exports.setCurrentPreviewUri = exports.getPreviewState = void 0;
const defaultState = {
    currentPreviewUri: undefined,
    lastActiveKind: 'non-markdown',
    isPreviewLocked: false,
};
let state = { ...defaultState };
const getPreviewState = () => state;
exports.getPreviewState = getPreviewState;
const setCurrentPreviewUri = (uri) => {
    state = { ...state, currentPreviewUri: uri };
};
exports.setCurrentPreviewUri = setCurrentPreviewUri;
const setLastActiveKind = (kind) => {
    state = { ...state, lastActiveKind: kind };
};
exports.setLastActiveKind = setLastActiveKind;
const setPreviewLocked = (locked) => {
    state = { ...state, isPreviewLocked: locked };
};
exports.setPreviewLocked = setPreviewLocked;
const resetPreviewState = () => {
    state = { ...state, currentPreviewUri: undefined, isPreviewLocked: false };
};
exports.resetPreviewState = resetPreviewState;
const resetAllState = () => {
    state = { ...defaultState };
};
exports.resetAllState = resetAllState;
//# sourceMappingURL=state.js.map