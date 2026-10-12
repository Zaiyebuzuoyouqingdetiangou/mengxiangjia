// 梦想家 · 通用小工具

export const LOG_PREFIX = '[梦想家]';

export function ctx() {
    try {
        return globalThis.SillyTavern?.getContext?.() || {};
    } catch {
        return {};
    }
}

export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function clip(value, max) {
    const text = String(value ?? '').trim();
    if (!max || text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}

export function uid(prefix = 'id') {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function now() {
    return Date.now();
}

export function clamp(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, v));
}

export function isHexColor(value) {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
}

export function hexOr(value, fallback) {
    const v = String(value || '').trim();
    return isHexColor(v) ? v : fallback;
}

// 颜色明暗调整：amount 为 -1..1
export function shade(hex, amount) {
    let h = hexOr(hex, '#888888').slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    const t = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function luminance(hex) {
    let h = hexOr(hex, '#888888').slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    const ch = [(num >> 16) & 255, (num >> 8) & 255, num & 255].map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function formatTime(ts) {
    const d = new Date(Number(ts) || Date.now());
    const pad = n => String(n).padStart(2, '0');
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString();
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (sameDay) return `今天 ${hm}`;
    if (yesterday) return `昨天 ${hm}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export function daysSince(ts) {
    const start = new Date(Number(ts) || Date.now());
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((today - start) / 86400000) + 1);
}

/**
 * 宽松解析模型返回的 JSON：去掉代码块、思考段，截取第一个完整对象，
 * 修掉常见的尾逗号与中文引号。解析不了时返回 null，由调用方兜底。
 */
export function parseJsonLoose(raw) {
    if (raw && typeof raw === 'object') return raw;
    let text = String(raw ?? '');
    text = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1].includes('{')) text = fence[1];
    const start = text.indexOf('{');
    if (start < 0) return null;
    const body = sliceBalanced(text, start);
    const candidates = [body, repairJson(body)];
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch { /* 下一种 */ }
    }
    return null;
}

function sliceBalanced(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    // 没闭合：尝试补齐
    let tail = text.slice(start);
    if (inString) tail += '"';
    return tail + '}'.repeat(Math.max(0, depth));
}

function repairJson(text) {
    if (!text) return '';
    return text
        .replace(/[“”]/g, '"')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\n/g, ' ');
}

export function stripThinking(text) {
    return String(text ?? '')
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .trim();
}

export function asText(value, max = 0) {
    if (value == null) return '';
    if (typeof value === 'string') return max ? clip(value, max) : value.trim();
    if (typeof value === 'number') return String(value);
    return '';
}
