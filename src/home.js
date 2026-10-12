// 梦想家 · 家的数据与生成
import { uid, now, parseJsonLoose, asText, hexOr, clip } from './util.js?mxj=0.2.0';
import { generate } from './api.js?mxj=0.2.0';
import { gatherContext, contextBlock } from './character.js?mxj=0.2.0';
import { getHome, setHome, getSettings } from './settings.js?mxj=0.2.0';
import { CATALOG, CATALOG_PROMPT, DEFAULT_PALETTE } from './furniture.js?mxj=0.2.0';

export const NOTE_KINDS = ['道歉', '纪念', '日常', '想你', '谢谢', '生气了'];
export const NOTE_PLACES = ['门边', '冰箱', '枕边', '书桌'];
export const HOUSE_SIZES = [
    { id: 'studio', name: '一间小屋', sub: '开间', rooms: '1 个房间' },
    { id: 'flat', name: '小公寓', sub: '1 室 + 阳台', rooms: '2 到 3 个房间' },
    { id: 'yard', name: '带院子', sub: '两层 + 小院', rooms: '4 到 5 个房间（含院子）' },
];

// ---------------- 盖房子 ----------------

const HOUSE_SYSTEM = `你是一位很会讲故事的室内设计师。你要根据角色设定，为这个角色和用户设计一个两人共同生活的家。
房子要像这个角色会住的地方：从他的职业、习惯、喜好、世界观里找细节，而不是千篇一律的样板间。
只输出一个 JSON 对象，不要输出其他文字。`;

function houseUserPrompt(info, size, extra, emptyWall) {
    const sizeDef = HOUSE_SIZES.find(s => s.id === size) || HOUSE_SIZES[1];
    return `${contextBlock(info, { withRecent: false })}

# 设计要求
- 房子大小：${sizeDef.name}（${sizeDef.rooms}）
${extra ? `- 用户补充：${extra}\n` : ''}${emptyWall ? '- 每个房间少放一点东西，留出空位，等两人以后一起布置。\n' : ''}- 家具只能从这些类型里选（type 用英文 id）：${CATALOG_PROMPT}
- 每个房间放 3 到 7 件家具；x 是家具在房间正面图里从左到右的位置，0–100。
- 颜色用 #RRGGBB。

# 输出格式
{
  "name": "这个家的名字（短）",
  "story": "两三句话，用第二人称讲这个家给你的感觉和来历",
  "palette": { "wall": "#…", "floor": "#…", "accent": "#…", "trim": "#…" },
  "rooms": [ { "id": "r1", "name": "起居室", "note": "一句话特点", "wall": "#…(可选)" } ],
  "furniture": [ { "type": "sofa", "name": "墨绿旧沙发", "room": "r1", "x": 45, "color": "#…" } ]
}`;
}

export function normalizeHouse(parsed, raw, size) {
    const p = parsed && typeof parsed === 'object' ? parsed : {};
    const palette = {
        wall: hexOr(p.palette?.wall, DEFAULT_PALETTE.wall),
        floor: hexOr(p.palette?.floor, DEFAULT_PALETTE.floor),
        accent: hexOr(p.palette?.accent, DEFAULT_PALETTE.accent),
        trim: hexOr(p.palette?.trim, DEFAULT_PALETTE.trim),
    };
    let rooms = Array.isArray(p.rooms) ? p.rooms : [];
    rooms = rooms
        .filter(r => r && typeof r === 'object')
        .slice(0, 6)
        .map((r, i) => ({
            id: asText(r.id) || `r${i + 1}`,
            name: asText(r.name, 12) || `房间 ${i + 1}`,
            note: asText(r.note, 40),
            wall: hexOr(r.wall, ''),
        }));
    // 去重 id
    const seen = new Set();
    for (const r of rooms) {
        while (seen.has(r.id)) r.id = `${r.id}_`;
        seen.add(r.id);
    }
    if (!rooms.length) rooms = [{ id: 'r1', name: '起居室', note: '', wall: '' }];
    const roomIds = new Set(rooms.map(r => r.id));
    const furniture = (Array.isArray(p.furniture) ? p.furniture : [])
        .filter(f => f && typeof f === 'object')
        .map(f => {
            const type = String(f.type || '').trim().toLowerCase();
            if (!CATALOG[type]) return null;
            return {
                id: uid('f'),
                type,
                name: asText(f.name, 16) || CATALOG[type].label,
                room: roomIds.has(String(f.room)) ? String(f.room) : rooms[0].id,
                x: Math.min(100, Math.max(0, Number(f.x) || 50)),
                color: hexOr(f.color, ''),
                by: 'ai',
            };
        })
        .filter(Boolean)
        .slice(0, 48);
    // 房间是空的就放几件基础家具，不让生成白费
    for (const r of rooms) {
        if (furniture.some(f => f.room === r.id)) continue;
        for (const [type, x] of [['window', 70], ['sofa', 45], ['plant', 85], ['lamp', 12]]) {
            furniture.push({ id: uid('f'), type, name: CATALOG[type].label, room: r.id, x, color: '', by: 'ai' });
        }
    }
    return {
        name: asText(p.name, 20) || '我们的家',
        story: asText(p.story, 400) || (parsed ? '' : clip(String(raw || ''), 400)),
        size,
        palette,
        rooms,
        furniture,
    };
}

export async function designHouse(char, { size, extra, emptyWall, signal }) {
    const info = await gatherContext(char);
    const raw = await generate({ system: HOUSE_SYSTEM, user: houseUserPrompt(info, size, extra, emptyWall), signal });
    const parsed = parseJsonLoose(raw);
    return normalizeHouse(parsed, raw, size);
}

export function createHome(char, house) {
    const home = getHome(char) || {
        v: 1,
        createdAt: now(),
        notes: [],
        visits: [],
        presence: { atHome: false, activity: '', mood: '', spot: '', since: 0 },
        lastVisitAt: 0,
    };
    home.charName = char?.name || '';
    home.house = house;
    home.currentRoom = house.rooms[0]?.id || '';
    return setHome(char, home);
}

// ---------------- 家的近况（给模型看） ----------------

function houseSummary(home) {
    const h = home.house;
    if (!h) return '';
    const lines = [`家：${h.name}。${h.story || ''}`];
    for (const r of h.rooms) {
        const items = h.furniture.filter(f => f.room === r.id).map(f => `${f.name}[${f.id}]${f.by === 'user' ? '(用户放的)' : ''}`);
        lines.push(`- ${r.name}：${items.join('、') || '空着'}`);
    }
    return lines.join('\n');
}

function recentLog(home, n = 5) {
    return (home.visits || []).slice(-n).map(v => {
        let line = `[${new Date(v.at).toLocaleString()}] 他：${v.event}`;
        for (const t of v.turns || []) line += `\n  用户：${t.user}\n  他：${t.reply}`;
        return line;
    }).join('\n');
}

function notesForVisit(home) {
    return (home.notes || []).filter(n => n.from === 'user' && !n.readAt);
}

function notesHistory(home, n = 6) {
    return (home.notes || []).slice(-n).map(x => `${x.from === 'user' ? '用户' : '他'}写的${x.kind}纸条（${x.place}）：${x.text}`).join('\n');
}

// ---------------- 他回家 ----------------

const VISIT_SYSTEM = `你在扮演角色，描写他回到和用户共同的家时发生的小事。保持角色的性格和说话方式，像生活片段，不要写成剧情大转折。
叙述用第三人称写他，用「你」称呼用户。只输出一个 JSON 对象，不要输出其他文字。`;

function nowLine() {
    const d = new Date();
    const h = d.getHours();
    const part = h < 5 ? '深夜' : h < 9 ? '清晨' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜';
    return `${d.getMonth() + 1}月${d.getDate()}日 ${part} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function comeHome(char, { signal } = {}) {
    const home = getHome(char);
    if (!home?.house) throw new Error('还没有家');
    const info = await gatherContext(char);
    const unread = notesForVisit(home);
    const user = `${contextBlock(info)}

# 你们的家
${houseSummary(home)}

# 之前在家里发生的事
${recentLog(home) || '（这是第一次回家）'}

# 最近的纸条
${notesHistory(home) || '（还没有纸条）'}
${pendingChanges(home).length ? `\n# 他上次离开后，用户对家里做的改动（他回家会注意到，可以自然地提一句或用一用新东西）\n${pendingChanges(home).map(c => `- ${c.text}`).join('\n')}\n` : ''}
# 现在
${nowLine()}，${info.char.name}回到家。
${unread.length ? `用户留了 ${unread.length} 张他还没看到的纸条，他回家会看到并回信：\n${unread.map(n => `- id=${n.id}｜${n.kind}｜贴在${n.place}｜${n.text}`).join('\n')}` : '没有未读的纸条。'}

# 输出格式
{
  "activity": "他现在在做什么（8 字以内，如：窗边看书）",
  "mood": "他的心情（4 字以内）",
  "spot": "他待在哪件家具旁边，填上面方括号里的家具 id，没有就空",
  "event": "他回家后的一个小场景，1 到 3 句",
  "options": ["你可以做的一件小事", "另一件"],
  "replies": [ { "to": "纸条 id", "text": "他的回信" } ],
  "note": null
}
如果他自己也想留一张纸条给你，就把 note 写成 { "kind": "${NOTE_KINDS.join('/')} 之一", "place": "${NOTE_PLACES.join('/')} 之一", "text": "纸条内容" }；不想留就是 null。`;
    const raw = await generate({ system: VISIT_SYSTEM, user, signal });
    const parsed = parseJsonLoose(raw);
    return applyVisit(char, parsed, raw, unread);
}

function applyVisit(char, parsed, raw, unread) {
    const home = getHome(char);
    const p = parsed && typeof parsed === 'object' ? parsed : {};
    const spotIds = new Set((home.house?.furniture || []).map(f => f.id));
    const spot = spotIds.has(String(p.spot)) ? String(p.spot) : '';
    const visit = {
        id: uid('v'),
        at: now(),
        activity: asText(p.activity, 16),
        mood: asText(p.mood, 8),
        spot,
        event: asText(p.event, 600) || (parsed ? '' : clip(String(raw || ''), 600)) || `${char?.name || '他'}回来了。`,
        options: (Array.isArray(p.options) ? p.options : []).map(o => asText(o, 24)).filter(Boolean).slice(0, 3),
        turns: [],
    };
    home.visits ||= [];
    home.visits.push(visit);
    home.presence = { atHome: true, activity: visit.activity, mood: visit.mood, spot, since: visit.at };
    home.lastVisitAt = visit.at;
    home.changesSeenAt = visit.at;
    if (spot) {
        const f = home.house.furniture.find(x => x.id === spot);
        if (f) home.currentRoom = f.room;
    }

    // 回信：模型漏掉的也标为已读，免得每次回家都重复读
    const replies = Array.isArray(p.replies) ? p.replies : [];
    for (const n of unread) {
        n.readAt = visit.at;
        const r = replies.find(x => String(x?.to) === n.id) || (unread.length === 1 ? replies[0] : null);
        const text = asText(r?.text, 400);
        if (text) {
            const reply = { id: uid('n'), from: 'char', kind: n.kind, place: n.place, text, at: visit.at, replyTo: n.id, readAt: 0 };
            home.notes.push(reply);
            n.replyId = reply.id;
        }
    }
    if (p.note && typeof p.note === 'object') {
        const text = asText(p.note.text, 400);
        if (text) {
            home.notes.push({
                id: uid('n'),
                from: 'char',
                kind: NOTE_KINDS.includes(p.note.kind) ? p.note.kind : '日常',
                place: NOTE_PLACES.includes(p.note.place) ? p.note.place : '门边',
                text,
                at: visit.at,
                readAt: 0,
            });
        }
    }
    setHome(char, home);
    return visit;
}

// ---------------- 回应他 ----------------

const RESPOND_SYSTEM = `你在扮演角色，和用户在共同的家里相处。根据用户刚做的事，写出角色的反应。保持他的性格，短而具体。
叙述用第三人称写他，用「你」称呼用户。只输出一个 JSON 对象。`;

export async function respond(char, userAction, { signal, furnitureId = '' } = {}) {
    const home = getHome(char);
    const visit = home?.visits?.[home.visits.length - 1];
    if (!home?.house || !visit) throw new Error('他还没回家');
    const info = await gatherContext(char);
    const furniture = furnitureId ? home.house.furniture.find(f => f.id === furnitureId) : null;
    const user = `${contextBlock(info)}

# 你们的家
${houseSummary(home)}

# 刚才
${recentLog(home, 3)}

# 现在
他在：${home.presence?.activity || '家里'}
用户：${userAction}${furniture ? `（在「${furniture.name}」旁边）` : ''}

# 输出格式
{ "reply": "他的反应，1 到 3 句", "activity": "他接下来在做什么（8 字以内，可沿用）", "spot": "家具 id 或空", "options": ["你接下来可以做的事", "另一件"] }`;
    const raw = await generate({ system: RESPOND_SYSTEM, user, signal });
    const parsed = parseJsonLoose(raw);
    const p = parsed && typeof parsed === 'object' ? parsed : {};
    const fresh = getHome(char);
    const last = fresh.visits[fresh.visits.length - 1];
    const reply = asText(p.reply, 600) || (parsed ? '' : clip(String(raw || ''), 600)) || '……';
    last.turns ||= [];
    last.turns.push({ user: userAction, reply, at: now() });
    last.options = (Array.isArray(p.options) ? p.options : []).map(o => asText(o, 24)).filter(Boolean).slice(0, 3);
    const activity = asText(p.activity, 16);
    if (activity) fresh.presence.activity = activity;
    const ids = new Set(fresh.house.furniture.map(f => f.id));
    if (ids.has(String(p.spot))) fresh.presence.spot = String(p.spot);
    else if (furnitureId && ids.has(furnitureId)) fresh.presence.spot = furnitureId;
    setHome(char, fresh);
    return last;
}

// ---------------- 纸条 ----------------

export function postNote(char, { kind, place, text, deferred }) {
    const home = getHome(char);
    const note = {
        id: uid('n'),
        from: 'user',
        kind: NOTE_KINDS.includes(kind) ? kind : '日常',
        place: NOTE_PLACES.includes(place) ? place : '门边',
        text: String(text || '').trim(),
        at: now(),
        deferred: !!deferred,
        readAt: 0,
    };
    home.notes ||= [];
    home.notes.push(note);
    setHome(char, home);
    return note;
}

const NOTE_SYSTEM = `你在扮演角色。用户在你们共同的家里给你留了一张手写纸条。写一张回信纸条：符合角色性格和说话方式，像真的手写纸条，简短、具体、有温度。
只输出纸条正文，不要加引号、标题或说明。`;

export async function replyToNote(char, noteId, { signal } = {}) {
    const home = getHome(char);
    const note = home?.notes?.find(n => n.id === noteId);
    if (!note) throw new Error('找不到这张纸条');
    const info = await gatherContext(char);
    const user = `${contextBlock(info)}

# 你们的家
${home.house ? `${home.house.name}。${home.house.story || ''}` : ''}

# 最近的纸条
${notesHistory(home)}

# 用户刚留下的纸条
类型：${note.kind}
贴在：${note.place}
内容：${note.text}

请写你的回信。`;
    const raw = await generate({ system: NOTE_SYSTEM, user, signal, maxTokens: 1024 });
    const parsed = parseJsonLoose(raw);
    const text = asText(parsed?.text || parsed?.reply, 400) || clip(String(raw || '').replace(/^["“]|["”]$/g, ''), 400);
    const fresh = getHome(char);
    const target = fresh.notes.find(n => n.id === noteId);
    const reply = { id: uid('n'), from: 'char', kind: target.kind, place: target.place, text, at: now(), replyTo: target.id, readAt: 0 };
    target.readAt = reply.at;
    target.replyId = reply.id;
    fresh.notes.push(reply);
    setHome(char, fresh);
    return reply;
}

export function markCharNotesRead(char) {
    const home = getHome(char);
    if (!home) return;
    let changed = false;
    for (const n of home.notes || []) {
        if (n.from === 'char' && !n.readAt) {
            n.readAt = now();
            changed = true;
        }
    }
    if (changed) setHome(char, home);
}

export function unreadFromChar(home) {
    return (home?.notes || []).filter(n => n.from === 'char' && !n.readAt).length;
}

// ---------------- 回家时机 ----------------

export function shouldAutoVisit(home) {
    const s = getSettings();
    if (s.visitMode !== 'open' || !home?.house) return false;
    if (!home.lastVisitAt) return true;
    return Date.now() - home.lastVisitAt >= s.visitGapMinutes * 60000;
}

export function isAway(home) {
    if (!home?.lastVisitAt) return true;
    const s = getSettings();
    // 隔了很久没回家，就当他出门了
    const gap = Math.max(60, s.visitGapMinutes) * 60000;
    return Date.now() - home.lastVisitAt >= gap;
}

// ---------------- 布置 ----------------

export function pendingChanges(home) {
    const seen = Number(home?.changesSeenAt) || 0;
    return (home?.changes || []).filter(c => c.at > seen).slice(-12);
}

export function recordChanges(char, texts) {
    const list = [...new Set((texts || []).map(t => String(t || '').trim()).filter(Boolean))];
    if (!list.length) return;
    const home = getHome(char);
    if (!home) return;
    home.changes ||= [];
    const at = now();
    for (const text of list) home.changes.push({ at, text });
    if (home.changes.length > 30) home.changes = home.changes.slice(-30);
    setHome(char, home);
}

function normalizeItem(raw, fallbackName = '') {
    const r = raw && typeof raw === 'object' ? raw : {};
    let type = String(r.type || '').trim().toLowerCase();
    if (!CATALOG[type]) type = guessType(`${r.name || ''} ${fallbackName}`);
    if (!type) return null;
    return {
        type,
        name: asText(r.name, 16) || clip(fallbackName, 16) || CATALOG[type].label,
        color: hexOr(r.color, ''),
        why: asText(r.why || r.reason, 60),
    };
}

// 模型没按格式给类型时，用中文名猜一个最接近的
export function guessType(text) {
    const s = String(text || '');
    const hints = [
        ['bed', /床/], ['sofa', /沙发|躺椅|长椅/], ['bookshelf', /书架|书柜/], ['bookstack', /书/], ['wardrobe', /衣柜|衣橱/],
        ['desk', /书桌|写字台|工作台|桌子/], ['diningtable', /餐桌|饭桌/], ['table', /茶几|小桌|边桌/], ['chair', /椅|凳/],
        ['lamp', /落地灯|台灯|灯/], ['stringlights', /串灯|灯串|星星灯/], ['plant', /植|花|草|树|盆栽|多肉/], ['rug', /地毯|毯/],
        ['window', /窗/], ['painting', /画|海报/], ['photo', /相框|照片|合照/], ['mirror', /镜/], ['clock', /钟|表/],
        ['wallshelf', /置物架|搁板|墙架/], ['tv', /电视|屏幕|投影/], ['piano', /钢琴|琴/], ['guitar', /吉他|贝斯|尤克里里/],
        ['recordplayer', /唱片|音响|留声机/], ['fridge', /冰箱/], ['stove', /灶|炉|厨房/], ['bathtub', /浴缸|浴盆/],
        ['aquarium', /鱼缸|鱼/], ['petbed', /猫窝|狗窝|宠物/], ['cushion', /坐垫|靠垫|抱枕|垫/], ['coatrack', /衣帽架|挂衣/],
        ['cabinet', /柜/],
    ];
    for (const [type, re] of hints) if (re.test(s)) return type;
    return '';
}

const SUGGEST_SYSTEM = `你在扮演角色，和用户一起布置你们共同的家。按你的性格、习惯和喜好，挑几件你想放进这个房间的东西，并用你自己的口吻说一句为什么。
只输出一个 JSON 对象。`;

export async function suggestFurniture(char, roomId, { signal } = {}) {
    const home = getHome(char);
    const room = home?.house?.rooms.find(r => r.id === roomId);
    if (!room) throw new Error('找不到这个房间');
    const info = await gatherContext(char);
    const user = `${contextBlock(info, { withRecent: false })}

# 你们的家
${houseSummary(home)}

# 现在布置的房间
${room.name}${room.note ? `（${room.note}）` : ''}

# 要求
挑 3 到 4 件，类型只能从这些里选（type 用英文 id）：${CATALOG_PROMPT}
颜色用 #RRGGBB；name 是你给它起的具体名字；why 是你说的一句话（15 字以内，第一人称）。

# 输出格式
{ "items": [ { "type": "plant", "name": "窗台上的薄荷", "color": "#4F8360", "why": "泡茶的时候能掐两片" } ] }`;
    const raw = await generate({ system: SUGGEST_SYSTEM, user, signal, maxTokens: 1500 });
    const parsed = parseJsonLoose(raw);
    const list = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
    const items = list.map(x => normalizeItem(x)).filter(Boolean).slice(0, 4);
    const fresh = getHome(char);
    fresh.suggestions = { roomId, at: now(), items };
    setHome(char, fresh);
    return items;
}

const DESCRIBE_SYSTEM = `你是家具设计师。把用户描述的一件家具或摆设，对应到给定的类型里最接近的一种，并起一个具体的名字、选一个颜色。只输出一个 JSON 对象。`;

export async function furnitureFromText(char, text, { signal } = {}) {
    const desc = String(text || '').trim();
    const user = `用户想要：${desc}

类型只能从这些里选（type 用英文 id）：${CATALOG_PROMPT}
输出格式：{ "type": "…", "name": "具体名字（12 字以内）", "color": "#RRGGBB" }`;
    let parsed = null;
    try {
        const raw = await generate({ system: DESCRIBE_SYSTEM, user, signal, maxTokens: 600 });
        parsed = parseJsonLoose(raw);
    } catch (error) {
        if (signal?.aborted) throw error;
        // 生成失败时直接按描述猜，不让这一步卡住
        console.warn('[梦想家] 按描述生成家具失败，改用名称推断', error);
    }
    return normalizeItem(parsed, desc) || { type: guessType(desc) || 'cabinet', name: clip(desc, 16), color: '', why: '' };
}
