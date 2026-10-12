// 梦想家 · 读取角色卡、用户人设、角色世界书和最近聊天
import { ctx, clip } from './util.js?mxj=0.2.0';
import { getSettings } from './settings.js?mxj=0.2.0';

function first(...values) {
    return values.map(v => String(v ?? '').trim()).find(Boolean) || '';
}

export function characterView(char) {
    const data = char?.data && typeof char.data === 'object' ? char.data : {};
    return {
        name: first(char?.name, data.name) || '他',
        description: clip(first(char?.description, data.description), 2400),
        personality: clip(first(char?.personality, data.personality), 1200),
        scenario: clip(first(char?.scenario, data.scenario), 900),
        firstMes: clip(first(char?.first_mes, data.first_mes), 600),
    };
}

export function personaView() {
    const c = ctx();
    const name = first(c.name1, globalThis.name1) || '你';
    const description = clip(first(
        c.powerUserSettings?.persona_description,
        globalThis.power_user?.persona_description,
        c.personaDescription,
    ), 1200);
    return { name, description };
}

export function avatarUrl(char) {
    const avatar = String(char?.avatar || '').trim();
    if (!avatar || avatar === 'none') return '';
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

async function requestHeaders() {
    const c = ctx();
    let fn = c.getRequestHeaders;
    if (typeof fn !== 'function') {
        try {
            fn = (await import('../../../../../script.js')).getRequestHeaders;
        } catch { /* 忽略 */ }
    }
    return { ...(typeof fn === 'function' ? fn() : {}), 'Content-Type': 'application/json' };
}

/**
 * 角色世界书（卡内嵌的 + 绑定的那本），只取启用且有内容的条目，按字数截断。
 * 读不到时返回空字符串，不阻止生成。
 */
export async function characterWorldBookText(char, budget = 5000) {
    if (!getSettings().readCharacterWorldBook) return '';
    const rows = [];
    const pushEntries = (book) => {
        const entries = book?.entries;
        if (!entries) return;
        const list = Array.isArray(entries) ? entries : Object.values(entries);
        for (const entry of list) {
            if (!entry || entry.enabled === false || entry.disable === true) continue;
            const content = String(entry.content || '').trim();
            if (!content) continue;
            const title = String(entry.comment || entry.name || entry.title || '').trim();
            rows.push(title ? `【${title}】${content}` : content);
        }
    };
    try {
        const embedded = char?.data?.character_book ?? char?.character_book;
        const linkedName = String(char?.data?.extensions?.world || '').trim();
        if (linkedName) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: await requestHeaders(),
                    body: JSON.stringify({ name: linkedName }),
                    signal: controller.signal,
                });
                if (response.ok) pushEntries(await response.json());
            } finally {
                clearTimeout(timer);
            }
        } else if (embedded) {
            pushEntries(embedded);
        }
    } catch (error) {
        console.debug('[梦想家] 读取角色世界书失败，跳过', error);
        return '';
    }
    let out = '';
    for (const row of rows) {
        if (out.length + row.length > budget) {
            out += `${row.slice(0, Math.max(0, budget - out.length))}…`;
            break;
        }
        out += `${row}\n`;
    }
    return out.trim();
}

export function recentChatText() {
    const s = getSettings();
    if (!s.readRecentChat || !s.recentChatCount) return '';
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    const picked = [];
    for (let i = chat.length - 1; i >= 0 && picked.length < s.recentChatCount; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        const text = String(m.mes || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        picked.unshift(`${m.is_user ? (m.name || '用户') : (m.name || '角色')}：${clip(text, 400)}`);
    }
    return picked.join('\n');
}

export async function gatherContext(char) {
    const view = characterView(char);
    const persona = personaView();
    const worldBook = await characterWorldBookText(char);
    const recent = recentChatText();
    return { char: view, persona, worldBook, recent };
}

export function contextBlock(info, { withRecent = true } = {}) {
    const parts = [];
    parts.push(`# 角色：${info.char.name}`);
    if (info.char.description) parts.push(`## 角色描述\n${info.char.description}`);
    if (info.char.personality) parts.push(`## 性格\n${info.char.personality}`);
    if (info.char.scenario) parts.push(`## 场景\n${info.char.scenario}`);
    if (info.worldBook) parts.push(`## 角色世界书摘录\n${info.worldBook}`);
    parts.push(`# 用户：${info.persona.name}`);
    if (info.persona.description) parts.push(`## 用户人设\n${info.persona.description}`);
    if (withRecent && info.recent) parts.push(`# 最近的聊天（只作为两人近况参考）\n${info.recent}`);
    return parts.join('\n\n');
}
