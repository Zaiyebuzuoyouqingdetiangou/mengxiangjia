// 梦想家 · Q 版像素小人
// 16×24 的像素格，插件自己画：发型、发色、肤色、眼睛、衣服、配饰都来自「形象」数据，
// 姿势（站 / 坐）、手里的东西（书 / 杯子）、闭眼按他正在做的事来定。
import { hexOr, shade, esc } from './util.js?mxj=0.3.0';

export const GRID_W = 16;
export const GRID_H = 24;

export const HAIR_STYLES = [
    { id: 'short', label: '短发' },
    { id: 'messy', label: '乱翘' },
    { id: 'swept', label: '侧分' },
    { id: 'bob', label: '齐耳' },
    { id: 'long', label: '长发' },
    { id: 'ponytail', label: '马尾' },
];

export const ACCESSORIES = [
    { id: 'none', label: '没有' },
    { id: 'glasses', label: '眼镜' },
    { id: 'hat', label: '帽子' },
    { id: 'scarf', label: '围巾' },
    { id: 'earring', label: '耳钉' },
];

export const LOOK_COLORS = {
    hair: ['#2B2420', '#4A3220', '#6E4B30', '#C9A35A', '#E8E2D6', '#1F2B3A', '#8E8E8E', '#B2584A'],
    skin: ['#FBE3CF', '#F6D7BE', '#EEC4A2', '#D9A27E', '#B57B57', '#8A5A3C'],
    eyes: ['#2B2420', '#4A3220', '#2F5D4E', '#3B5566', '#9C3B2E', '#C9A35A', '#6B4F8E'],
    outfit: ['#2F5D4E', '#24343C', '#B2584A', '#E9E1CF', '#8FA9B8', '#6B4F8E', '#2A2A2A', '#D99A4E'],
};

const OUTLINE = '#2A211C';

function hashOf(text) {
    let h = 2166136261;
    for (const ch of String(text || '')) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// 没有生成过形象时，按名字定一个稳定的默认样子
export function defaultLook(seedText) {
    const h = hashOf(seedText);
    const pick = (list, shift) => list[(h >>> shift) % list.length];
    return {
        hairStyle: pick(HAIR_STYLES, 0).id,
        hair: pick(LOOK_COLORS.hair.slice(0, 3), 3),
        skin: LOOK_COLORS.skin[1],
        eyes: pick(LOOK_COLORS.eyes.slice(0, 4), 7),
        outfit: pick(LOOK_COLORS.outfit, 11),
        accent: '#E9E1CF',
        pants: '#3B3B44',
        shoes: '#4A3220',
        accessory: 'none',
    };
}

export function normalizeLook(raw, seedText) {
    const base = defaultLook(seedText);
    const r = raw && typeof raw === 'object' ? raw : {};
    const style = String(r.hairStyle || r.hair_style || '').trim().toLowerCase();
    const acc = String(r.accessory || '').trim().toLowerCase();
    return {
        hairStyle: HAIR_STYLES.some(s => s.id === style) ? style : base.hairStyle,
        hair: hexOr(r.hair, base.hair),
        skin: hexOr(r.skin, base.skin),
        eyes: hexOr(r.eyes, base.eyes),
        outfit: hexOr(r.outfit, base.outfit),
        accent: hexOr(r.accent, base.accent),
        pants: hexOr(r.pants, base.pants),
        shoes: hexOr(r.shoes, base.shoes),
        accessory: ACCESSORIES.some(a => a.id === acc) ? acc : base.accessory,
    };
}

export const LOOK_PROMPT = `"look": { "hairStyle": "${HAIR_STYLES.map(s => s.id).join('/')} 之一", "hair": "#发色", "skin": "#肤色", "eyes": "#瞳色", "outfit": "#上衣主色", "accent": "#领口或点缀色", "pants": "#裤子颜色", "shoes": "#鞋子颜色", "accessory": "${ACCESSORIES.map(a => a.id).join('/')} 之一" }`;

// ---------------- 姿势 ----------------

const SEAT_OFFSET = { sofa: 22, bed: 42, chair: 36, cushion: 10, bathtub: 20 };
const SIT_NEAR = ['desk', 'diningtable', 'table'];

export function poseFor({ spotType = '', activity = '', night = false } = {}) {
    const a = String(activity || '');
    const sleepy = /睡|打盹|困|眯/.test(a) || (night && spotType === 'bed');
    const sit = !!SEAT_OFFSET[spotType] || /坐|躺|窝|靠/.test(a);
    let prop = '';
    if (!sleepy) {
        if (/书|读|看|翻/.test(a)) prop = 'book';
        else if (/茶|咖啡|喝|杯|水/.test(a)) prop = 'mug';
    }
    return { sit, prop, closed: sleepy, sleepy, seatOffset: SEAT_OFFSET[spotType] || 0, nearTable: SIT_NEAR.includes(spotType) };
}

// ---------------- 画 ----------------

function grid() {
    const map = new Map();
    const set = (x, y, c) => {
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
        map.set(`${x},${y}`, c);
    };
    const fill = (x0, y0, w, h, c) => {
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
    };
    const row = (y, xs, c) => xs.forEach(x => set(x, y, c));
    return { map, set, fill, row };
}

function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
}

/**
 * @param {object} look normalizeLook 后的形象
 * @param {{sit?:boolean, prop?:string, closed?:boolean}} pose
 * @returns {string} 一个 <svg> 片段（viewBox 带 1 格描边余量）
 */
export function spriteSvg(look, pose = {}, { width, height, x, y, attrs = '' } = {}) {
    const L = look;
    const hairShade = shade(L.hair, -0.25);
    const skinShade = shade(L.skin, -0.12);
    const outfitShade = shade(L.outfit, -0.22);
    const g = grid();

    // 后面的头发（长发、马尾、齐耳）先画，被身体挡住
    if (L.hairStyle === 'long') {
        g.fill(2, 5, 2, 11, L.hair);
        g.fill(12, 5, 2, 11, L.hair);
        g.fill(2, 15, 2, 1, hairShade);
        g.fill(12, 15, 2, 1, hairShade);
    } else if (L.hairStyle === 'ponytail') {
        g.fill(13, 3, 2, 3, L.hair);
        g.fill(14, 6, 1, 5, L.hair);
        g.set(13, 6, hairShade);
    } else if (L.hairStyle === 'bob') {
        g.fill(2, 5, 2, 6, L.hair);
        g.fill(12, 5, 2, 6, L.hair);
    }

    // 身体
    g.row(12, [7, 8], skinShade);
    g.fill(5, 13, 6, 5, L.outfit);
    g.fill(10, 13, 1, 5, outfitShade);
    g.row(13, [7, 8], L.accent);
    g.fill(4, 13, 1, 4, L.outfit);
    g.fill(11, 13, 1, 4, outfitShade);
    if (pose.prop === 'book') {
        g.fill(5, 14, 6, 3, '#B2584A');
        g.fill(5, 14, 6, 1, '#F4EEE2');
        g.set(7, 15, '#8A3B30');
        g.set(8, 15, '#8A3B30');
        g.set(4, 16, L.skin);
        g.set(11, 16, L.skin);
    } else if (pose.prop === 'mug') {
        g.set(4, 17, L.skin);
        g.fill(11, 15, 2, 2, '#F4F1EA');
        g.set(13, 15, '#F4F1EA');
        g.set(11, 17, L.skin);
    } else {
        g.set(4, 17, L.skin);
        g.set(11, 17, L.skin);
    }
    if (pose.sit) {
        g.fill(5, 18, 6, 1, L.pants);
        g.fill(5, 19, 2, 1, L.pants);
        g.fill(9, 19, 2, 1, L.pants);
        g.row(20, [4, 5, 6], L.shoes);
        g.row(20, [9, 10, 11], L.shoes);
    } else {
        g.fill(6, 18, 2, 4, L.pants);
        g.fill(8, 18, 2, 4, shade(L.pants, -0.15));
        g.row(22, [5, 6, 7], L.shoes);
        g.row(22, [8, 9, 10], L.shoes);
    }
    if (L.accessory === 'scarf') {
        g.fill(4, 12, 8, 2, L.accent === '#E9E1CF' ? '#C2452D' : L.accent);
        g.set(9, 14, shade(L.accent === '#E9E1CF' ? '#C2452D' : L.accent, -0.2));
        g.set(9, 15, shade(L.accent === '#E9E1CF' ? '#C2452D' : L.accent, -0.2));
    }

    // 头：圆角方脸
    g.fill(3, 3, 10, 9, L.skin);
    g.fill(4, 2, 8, 1, L.skin);
    g.map.delete('3,11');
    g.map.delete('12,11');
    g.row(11, range(5, 10), skinShade);

    // 眼睛、腮红、嘴
    if (pose.closed) {
        g.row(8, [5, 6], OUTLINE);
        g.row(8, [9, 10], OUTLINE);
    } else {
        g.fill(5, 7, 2, 2, L.eyes);
        g.fill(9, 7, 2, 2, L.eyes);
        g.set(5, 7, '#FFFFFF');
        g.set(9, 7, '#FFFFFF');
    }
    g.set(4, 9, '#F2A0A0');
    g.set(11, 9, '#F2A0A0');
    g.set(7, 10, shade(L.skin, -0.35));
    g.set(8, 10, shade(L.skin, -0.35));

    // 前面的头发
    g.row(1, range(5, 10), L.hair);
    g.row(2, range(4, 11), L.hair);
    g.row(3, range(3, 12), L.hair);
    g.row(4, range(3, 12), L.hair);
    g.row(4, [11, 12], hairShade);
    switch (L.hairStyle) {
        case 'messy':
            g.row(5, range(3, 12), L.hair);
            g.row(6, [3, 5, 8, 10, 12], L.hair);
            g.set(6, 0, L.hair);
            g.set(9, 0, L.hair);
            g.set(4, 1, L.hair);
            g.set(11, 1, L.hair);
            break;
        case 'swept':
            g.row(5, range(3, 9), L.hair);
            g.row(6, range(3, 6), L.hair);
            g.set(3, 7, L.hair);
            g.row(5, [12], L.hair);
            g.row(6, [12], L.hair);
            break;
        case 'bob':
            g.row(5, range(3, 12), L.hair);
            g.row(6, [3, 4, 11, 12], L.hair);
            g.row(7, [3, 12], L.hair);
            break;
        case 'long':
        case 'ponytail':
            g.row(5, [3, 4, 5, 6, 9, 10, 11, 12], L.hair);
            g.row(6, [3, 4, 11, 12], L.hair);
            g.row(7, [3, 12], L.hair);
            break;
        default:
            g.row(5, [3, 4, 5, 6, 8, 9, 10, 11, 12], L.hair);
            g.row(6, [3, 4, 11, 12], L.hair);
            break;
    }

    // 配饰
    if (L.accessory === 'glasses') {
        const frame = '#5A5550';
        g.row(6, range(4, 11), frame);
        for (const x of [4, 7, 8, 11]) {
            g.set(x, 7, frame);
            g.set(x, 8, frame);
        }
    } else if (L.accessory === 'hat') {
        const hat = L.accent === '#E9E1CF' ? '#6E4B30' : L.accent;
        g.fill(4, 0, 8, 3, hat);
        g.row(3, range(2, 13), shade(hat, -0.2));
    } else if (L.accessory === 'earring') {
        g.set(12, 9, '#E2C38A');
    }

    // 描边：每个有颜色的格子，四周空着的地方补一圈深色
    const outline = new Map();
    for (const key of g.map.keys()) {
        const [px, py] = key.split(',').map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = `${px + dx},${py + dy}`;
            if (!g.map.has(k)) outline.set(k, OUTLINE);
        }
    }

    const rects = [];
    const emit = (map) => {
        // 横向合并同色格子，减少元素数量
        const rows = new Map();
        for (const [key, color] of map) {
            if (!color) continue;
            const [px, py] = key.split(',').map(Number);
            if (!rows.has(py)) rows.set(py, []);
            rows.get(py).push([px, color]);
        }
        for (const [py, cells] of rows) {
            cells.sort((a, b) => a[0] - b[0]);
            let start = null;
            let prev = null;
            let color = null;
            for (const [px, c] of cells) {
                if (start !== null && px === prev + 1 && c === color) {
                    prev = px;
                    continue;
                }
                if (start !== null) rects.push(`<rect x="${start}" y="${py}" width="${prev - start + 1}" height="1" fill="${color}"/>`);
                start = px;
                prev = px;
                color = c;
            }
            if (start !== null) rects.push(`<rect x="${start}" y="${py}" width="${prev - start + 1}" height="1" fill="${color}"/>`);
        }
    };
    emit(outline);
    emit(g.map);

    const box = [];
    if (x !== undefined) box.push(`x="${x}"`);
    if (y !== undefined) box.push(`y="${y}"`);
    if (width !== undefined) box.push(`width="${width}"`);
    if (height !== undefined) box.push(`height="${height}"`);
    return `<svg viewBox="-1 -1 ${GRID_W + 2} ${GRID_H + 2}" ${box.join(' ')} shape-rendering="crispEdges" ${attrs}>${rects.join('')}</svg>`;
}

// 放进房间：返回房间 SVG 里的一个可点的小人
export function spriteInRoom(look, pose, anchor, sceneH, { label = '他' } = {}) {
    const unit = 3; // 每个像素格在房间里的大小
    const w = (GRID_W + 2) * unit;
    const h = (GRID_H + 2) * unit;
    let bottom;
    if (pose.sit && pose.seatOffset && anchor) bottom = anchor.y + pose.seatOffset * (anchor.scale || 1) + 4 * unit;
    else bottom = Math.min(sceneH - 6, (anchor?.floor ?? sceneH - 22) + 14);
    const cx = anchor ? anchor.x : 180;
    const x = cx - w / 2;
    const y = bottom - h;
    const z = pose.sleepy
        ? `<text x="${(cx + w / 2 - 2).toFixed(1)}" y="${(y + 10).toFixed(1)}" font-size="11" font-weight="700" fill="#FBFAF6" stroke="${OUTLINE}" stroke-width="0.6" class="mxj-zzz">z</text>`
        : '';
    return `<g class="mxj-sprite" data-act="avatar" role="button" tabindex="0" aria-label="${esc(label)}">${spriteSvg(look, pose, { x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: h.toFixed(1) })}${z}</g>`;
}
