// 梦想家 · 设置与存档（存在酒馆的扩展设置里，换设备也在）
import { ctx, clamp } from './util.js?mxj=0.3.1';

export const MODULE_NAME = 'mengxiangjia';

const DEFAULTS = Object.freeze({
    // 生成通道：follow = 跟随当前 API；independent = 副 API
    generationSource: 'follow',
    independentConnectionProfileId: '',
    independentApiBaseUrl: '',
    independentApiKey: '',
    independentApiModel: '',
    independentApiTemperature: 0.9,
    independentApiMaxTokens: 4096,
    // 读哪些上下文
    readCharacterWorldBook: true,
    readRecentChat: true,
    recentChatCount: 8,
    // 他什么时候回家：open = 打开小屋时（隔一段时间才算一次），manual = 只在我点「等他回家」时
    visitMode: 'open',
    visitGapMinutes: 60,
});

const NUMERIC = {
    independentApiTemperature: [0, 2],
    independentApiMaxTokens: [256, 64000],
    recentChatCount: [0, 40],
    visitGapMinutes: [0, 10080],
};

function root() {
    const c = ctx();
    const store = c.extensionSettings || globalThis.extension_settings;
    if (!store) return null;
    if (!store[MODULE_NAME] || typeof store[MODULE_NAME] !== 'object') store[MODULE_NAME] = {};
    return store[MODULE_NAME];
}

export function getSettings() {
    const r = root() || {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (r[key] === undefined) r[key] = value;
    }
    for (const [key, [min, max]] of Object.entries(NUMERIC)) {
        r[key] = clamp(r[key], min, max);
    }
    if (!['follow', 'independent'].includes(r.generationSource)) r.generationSource = 'follow';
    if (!['open', 'manual'].includes(r.visitMode)) r.visitMode = 'open';
    if (!r.homes || typeof r.homes !== 'object') r.homes = {};
    return r;
}

export function save() {
    const c = ctx();
    const fn = c.saveSettingsDebounced || globalThis.saveSettingsDebounced;
    try {
        if (typeof fn === 'function') fn();
    } catch (error) {
        console.warn('[梦想家] 保存设置失败', error);
    }
}

export function updateSettings(patch) {
    const s = getSettings();
    Object.assign(s, patch);
    // 选了酒馆连接配置时，不再保留手动填写的 Key
    if (String(s.independentConnectionProfileId || '').trim()) s.independentApiKey = '';
    getSettings();
    save();
    return s;
}

// ---------- 每个角色一个家 ----------

export function currentCharacter() {
    const c = ctx();
    if (c.groupId) return null;
    const id = c.characterId;
    if (id === undefined || id === null || id === '') return null;
    const char = c.characters?.[id];
    if (!char) return null;
    return char;
}

export function characterKey(char) {
    return String(char?.avatar || char?.name || '').trim();
}

export function getHome(char) {
    const key = characterKey(char);
    if (!key) return null;
    const s = getSettings();
    return s.homes[key] || null;
}

export function setHome(char, home) {
    const key = characterKey(char);
    if (!key) return null;
    const s = getSettings();
    home.updatedAt = Date.now();
    s.homes[key] = home;
    trimHome(home);
    save();
    return home;
}

export function removeHome(char) {
    const key = characterKey(char);
    const s = getSettings();
    if (key && s.homes[key]) {
        delete s.homes[key];
        save();
    }
}

// 控制存档体积：纸条留最近 300 张，回家记录留最近 40 次
function trimHome(home) {
    if (Array.isArray(home.notes) && home.notes.length > 300) home.notes = home.notes.slice(-300);
    if (Array.isArray(home.visits) && home.visits.length > 40) home.visits = home.visits.slice(-40);
}
