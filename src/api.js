// 梦想家 · 生成通道
// 跟随当前 API：用酒馆的 generateRaw。
// 副 API：和兔子镜一样全部经过酒馆后端转发，不从浏览器直连接口，也不会悄悄退回主 API。
import { ctx, stripThinking } from './util.js?mxj=0.3.0';
import { getSettings } from './settings.js?mxj=0.3.0';

const ST_STATUS = '/api/backends/chat-completions/status';
const ST_GENERATE = '/api/backends/chat-completions/generate';
const ENDPOINT_RE = /\/(?:chat\/completions|completions|responses|messages|embeddings|models)\/?$/i;

export class GenerationError extends Error {
    constructor(message, detail = '') {
        super(message);
        this.name = 'GenerationError';
        this.detail = detail;
    }
}

async function requestHeaders() {
    const c = ctx();
    let fn = c.getRequestHeaders;
    if (typeof fn !== 'function') {
        try {
            const mod = await import('../../../../../script.js');
            fn = mod.getRequestHeaders;
        } catch { /* 忽略 */ }
    }
    const base = typeof fn === 'function' ? fn() : {};
    return { ...base, 'Content-Type': 'application/json' };
}

export function normalizeBase(url) {
    let u = String(url || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) {
        u = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/.test(u) || /^localhost(?::\d+)?(?:\/|$)/i.test(u) ? `http://${u}` : `https://${u}`;
    }
    u = u.replace(/#.*$/, '');
    for (let i = 0; i < 3; i++) {
        const [path, query = ''] = u.split('?');
        const next = path.replace(/\/+$/, '').replace(ENDPOINT_RE, '');
        u = query ? `${next}?${query}` : next;
    }
    return u.replace(/\/+$/, '');
}

function customHeaders(key) {
    const k = String(key || '').trim();
    return k ? JSON.stringify({ Authorization: `Bearer ${k}` }) : '';
}

function redact(text) {
    return String(text || '')
        .replace(/https?:\/\/[^\s"'<>]+/gi, '[地址]')
        .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [已隐藏]')
        .replace(/\bsk-[A-Za-z0-9_\-]{6,}/g, '[已隐藏]')
        .replace(/\bAIza[0-9A-Za-z_\-]{10,}/g, '[已隐藏]')
        .replace(/api[_-]?key=[^&\s]+/gi, 'api_key=[已隐藏]');
}

function compactError(status, text) {
    const body = String(text || '');
    if (status === 429) return '接口说请求太频繁（429），稍等一会儿再试。';
    if (status === 524 || status === 504) return '接口等太久没有回应（超时），可以再试一次。';
    if (/<html|<!doctype/i.test(body)) return `接口返回了一个网页而不是结果（HTTP ${status}），请检查地址。`;
    let msg = body;
    try {
        const j = JSON.parse(body);
        msg = j?.error?.message || j?.message || j?.error || body;
    } catch { /* 原文 */ }
    return `接口出错（HTTP ${status}）：${redact(String(msg)).slice(0, 300)}`;
}

function textFromContent(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(textFromContent).filter(Boolean).join('\n');
    if (value && typeof value === 'object') {
        if (value.thought === true || /^(?:reasoning|reasoning_text|analysis|thinking|thought)$/i.test(String(value.type || ''))) return '';
        return String(value.text ?? value.content ?? value.output_text ?? value.value ?? '');
    }
    return '';
}

export function extractResponseText(payload) {
    if (typeof payload === 'string') return payload;
    const choice = payload?.choices?.[0] || null;
    const candidates = [
        choice?.message?.content, choice?.text, choice?.delta?.content,
        payload?.output_text, payload?.response, payload?.text, payload?.content,
        payload?.message?.content, payload?.data?.output_text, payload?.data?.content,
        payload?.candidates?.[0]?.content?.parts, payload?.candidates?.[0]?.output,
    ];
    for (const c of candidates) {
        const t = textFromContent(c).trim();
        if (t) return t;
    }
    return '';
}

// 有些中转即使 stream:false 也回 SSE，这里一并兼容
function parseSse(raw) {
    let out = '';
    for (const line of String(raw).split(/\r?\n/)) {
        const m = line.match(/^data:\s*(.*)$/);
        if (!m) continue;
        const data = m[1].trim();
        if (!data || data === '[DONE]') continue;
        try {
            const j = JSON.parse(data);
            const delta = j?.choices?.[0]?.delta;
            if (delta && typeof delta.content === 'string') out += delta.content;
            else out += extractResponseText(j);
        } catch { /* 跳过坏帧 */ }
    }
    return out;
}

async function readBody(response) {
    const raw = await response.text();
    const trimmed = raw.trim();
    if (/^data:/m.test(trimmed) && !trimmed.startsWith('{')) return { text: parseSse(trimmed), raw };
    let payload = null;
    try {
        payload = JSON.parse(trimmed);
    } catch {
        return { text: trimmed, raw };
    }
    if (payload?.error) {
        const msg = payload.error?.message || payload.error;
        throw new GenerationError(`接口返回错误：${redact(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 300)}`);
    }
    return { text: extractResponseText(payload), raw };
}

function linkSignal(signal, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms);
    if (signal) {
        if (signal.aborted) controller.abort(signal.reason);
        else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return { signal: controller.signal, done: () => clearTimeout(timer) };
}

// ---------------- 对外：生成一次 ----------------

/**
 * @param {{system:string,user:string,signal?:AbortSignal,maxTokens?:number}} req
 * @returns {Promise<string>}
 */
export async function generate(req) {
    const s = getSettings();
    const messages = [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
    ];
    let text = '';
    if (s.generationSource === 'independent') {
        if (String(s.independentConnectionProfileId || '').trim()) text = await viaProfile(s, messages, req);
        else text = await viaManual(s, messages, req);
    } else {
        text = await viaMainApi(messages, req);
    }
    text = stripThinking(text);
    if (!text.trim()) throw new GenerationError('接口有回应，但没有拿到正文，可以再试一次。');
    return text;
}

async function viaMainApi(messages, req) {
    const c = ctx();
    const fn = c.generateRaw;
    if (typeof fn !== 'function') throw new GenerationError('当前酒馆不支持直接调用主 API，请在设置里改用副 API。');
    const isChat = c.mainApi === 'openai';
    try {
        const raw = isChat
            ? await fn({ prompt: messages, api: c.mainApi, quietToLoud: false, trimNames: false })
            : await fn({ prompt: messages[1].content, systemPrompt: messages[0].content, api: c.mainApi, quietToLoud: false, trimNames: false });
        return String(raw ?? '');
    } catch (error) {
        if (req.signal?.aborted) throw error;
        throw new GenerationError(`主 API 生成失败：${redact(error?.message || error)}`);
    }
}

async function viaManual(s, messages, req) {
    const base = normalizeBase(s.independentApiBaseUrl);
    if (!base) throw new GenerationError('副 API 还没有填写接口地址，或在设置里选一个酒馆连接配置。');
    if (!String(s.independentApiModel || '').trim()) throw new GenerationError('副 API 还没有选择模型。');
    const body = {
        model: s.independentApiModel,
        messages,
        temperature: Number(s.independentApiTemperature),
        max_tokens: Number(req.maxTokens || s.independentApiMaxTokens),
        stream: false,
        chat_completion_source: 'custom',
        custom_url: base,
        custom_include_headers: customHeaders(s.independentApiKey),
        custom_include_body: '',
        custom_exclude_body: '',
    };
    const linked = linkSignal(req.signal, 5 * 60 * 1000);
    try {
        const response = await fetch(ST_GENERATE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: await requestHeaders(),
            body: JSON.stringify(body),
            signal: linked.signal,
        });
        if (!response.ok) throw new GenerationError(compactError(response.status, await response.text().catch(() => '')));
        const { text } = await readBody(response);
        if (/^\s*\[API (?:错误|error)\]/i.test(text)) throw new GenerationError(redact(text).slice(0, 300));
        return text;
    } catch (error) {
        if (error instanceof GenerationError) throw error;
        if (req.signal?.aborted) throw error;
        if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new GenerationError('副 API 等了 5 分钟还没有回应，已停止。');
        throw new GenerationError(`副 API 请求失败：${redact(error?.message || error)}`);
    } finally {
        linked.done();
    }
}

async function viaProfile(s, messages, req) {
    const c = ctx();
    const service = c.ConnectionManagerRequestService;
    if (!service || typeof service.sendRequest !== 'function') {
        throw new GenerationError('这个酒馆版本没有「连接配置」请求接口，请改填手动接口。');
    }
    const profileId = s.independentConnectionProfileId;
    const overrides = { temperature: Number(s.independentApiTemperature) };
    const model = String(s.independentApiModel || '').trim();
    if (model) overrides.model = model;
    const maxTokens = Number(req.maxTokens || s.independentApiMaxTokens);
    try {
        const result = await service.sendRequest(
            profileId,
            messages,
            maxTokens,
            { stream: false, signal: req.signal || null, extractData: true, includePreset: false, includeInstruct: false },
            overrides,
        );
        const text = typeof result === 'string' ? result : (result?.content ?? extractResponseText(result));
        return String(text ?? '');
    } catch (error) {
        if (req.signal?.aborted) throw error;
        throw new GenerationError(`连接配置生成失败：${redact(error?.message || error)}`);
    }
}

// ---------------- 设置页用 ----------------

export function listConnectionProfiles() {
    const c = ctx();
    const manager = c.extensionSettings?.connectionManager;
    const profiles = Array.isArray(manager?.profiles) ? manager.profiles : [];
    const service = c.ConnectionManagerRequestService;
    return profiles
        .filter(p => {
            if (!p?.id) return false;
            if (p.mode && p.mode !== 'cc') return false;
            if (service?.validateProfile) {
                try {
                    const map = service.validateProfile(p);
                    return map?.selected === 'openai';
                } catch {
                    return false;
                }
            }
            return true;
        })
        .map(p => ({ id: p.id, name: p.name || p.id, model: p.model || '' }));
}

export async function fetchManualModels(baseUrl, key) {
    const base = normalizeBase(baseUrl);
    if (!base) throw new GenerationError('请先填写接口地址。');
    const linked = linkSignal(null, 30000);
    try {
        const response = await fetch(ST_STATUS, {
            method: 'POST',
            credentials: 'same-origin',
            headers: await requestHeaders(),
            cache: 'no-cache',
            signal: linked.signal,
            body: JSON.stringify({ chat_completion_source: 'custom', custom_url: base, custom_include_headers: customHeaders(key) }),
        });
        if (!response.ok) throw new GenerationError(compactError(response.status, await response.text().catch(() => '')));
        const data = await response.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []));
        const ids = list.map(m => (typeof m === 'string' ? m : (m?.id || m?.name || ''))).filter(Boolean);
        if (!ids.length) throw new GenerationError('接口没有返回模型列表，可以直接手动填写模型 ID。');
        return [...new Set(ids)].sort();
    } catch (error) {
        if (error instanceof GenerationError) throw error;
        if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new GenerationError('拉取模型超过 30 秒，已停止。');
        throw new GenerationError(`拉取模型失败：${redact(error?.message || error)}`);
    } finally {
        linked.done();
    }
}

export async function testConnection() {
    const text = await generate({
        system: '你是连接测试。',
        user: '请只回复两个字：收到',
        maxTokens: 512,
    });
    return text.slice(0, 60);
}
