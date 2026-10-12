// 梦想家 · 家具图库与房间绘制
// 房间是正面剖面图：viewBox 360×300，墙 0–210，地板 210–300。
import { esc, shade, hexOr, luminance } from './util.js?mxj=0.2.0';

export const SCENE_W = 360;
export const SCENE_H = 300;
const WALL_BOTTOM = 210;
const BACK_BASE = 230;
const FRONT_BASE = 270;

export const DEFAULT_PALETTE = Object.freeze({
    wall: '#C9D3C0',
    floor: '#A87B55',
    accent: '#2F5D4E',
    trim: '#6E4B30',
});

// layer: wall 挂墙 / back 靠墙立 / front 前排 / rug 地毯；group 是布置抽屉里的分类
export const CATALOG = {
    window: { label: '窗', layer: 'wall', w: 112, group: '墙面' },
    painting: { label: '挂画', layer: 'wall', w: 62, group: '墙面' },
    clock: { label: '挂钟', layer: 'wall', w: 40, group: '墙面' },
    wallshelf: { label: '墙上置物架', layer: 'wall', w: 92, group: '墙面' },
    photo: { label: '相框', layer: 'wall', w: 58, group: '墙面' },
    mirror: { label: '镜子', layer: 'wall', w: 46, group: '墙面' },
    stringlights: { label: '串灯', layer: 'wall', w: 168, group: '灯光' },
    bookshelf: { tall: true, label: '书架', layer: 'back', w: 80, group: '家具' },
    wardrobe: { tall: true, label: '衣柜', layer: 'back', w: 84, group: '家具' },
    cabinet: { label: '矮柜', layer: 'back', w: 84, group: '家具' },
    piano: { label: '钢琴', layer: 'back', w: 98, group: '家具' },
    tv: { label: '电视', layer: 'back', w: 86, group: '家具' },
    fridge: { tall: true, label: '冰箱', layer: 'back', w: 56, group: '家具' },
    stove: { label: '灶台', layer: 'back', w: 84, group: '家具' },
    aquarium: { label: '鱼缸', layer: 'back', w: 72, group: '小物' },
    sofa: { label: '沙发', layer: 'front', w: 150, group: '家具' },
    bed: { label: '床', layer: 'front', w: 170, group: '家具' },
    desk: { label: '书桌', layer: 'front', w: 112, group: '家具' },
    chair: { label: '椅子', layer: 'front', w: 42, group: '家具' },
    table: { label: '茶几', layer: 'front', w: 92, group: '家具' },
    diningtable: { label: '餐桌', layer: 'front', w: 122, group: '家具' },
    bathtub: { label: '浴缸', layer: 'front', w: 142, group: '家具' },
    coatrack: { label: '衣帽架', layer: 'front', w: 40, group: '家具' },
    lamp: { label: '落地灯', layer: 'front', w: 40, group: '灯光' },
    plant: { label: '绿植', layer: 'front', w: 42, group: '小物' },
    recordplayer: { label: '唱片机', layer: 'front', w: 62, group: '小物' },
    petbed: { label: '宠物窝', layer: 'front', w: 52, group: '小物' },
    cushion: { label: '坐垫', layer: 'front', w: 48, group: '小物' },
    guitar: { label: '吉他', layer: 'front', w: 34, group: '小物' },
    bookstack: { label: '一摞书', layer: 'front', w: 40, group: '小物' },
    rug: { label: '地毯', layer: 'rug', w: 220, group: '小物' },
};

export const GROUPS = ['家具', '小物', '墙面', '灯光'];

export const CATALOG_PROMPT = Object.entries(CATALOG)
    .map(([type, def]) => `${type}（${def.label}）`)
    .join('、');

const DEFAULT_COLORS = {
    window: '#6E4B30', painting: '#B2584A', clock: '#3B3B3B', wallshelf: '#8A6040', photo: '#4A3220', mirror: '#C9A35A',
    stringlights: '#F2C46D', bookshelf: '#6E4B30', wardrobe: '#8A6040', cabinet: '#8A6040', piano: '#2A2A2A', tv: '#2A2A2A',
    fridge: '#E8E4DA', stove: '#D9D4C8', aquarium: '#7FB3C8', sofa: '#2F5D4E', bed: '#E9E1CF', desk: '#8A6040', chair: '#8A6040',
    table: '#8A6040', diningtable: '#8A6040', bathtub: '#F4F1EA', coatrack: '#B2584A', lamp: '#F2C46D', plant: '#4F8360',
    recordplayer: '#4A3220', petbed: '#B2584A', cushion: '#D99A4E', guitar: '#B87333', bookstack: '#2F5D4E', rug: '#B2584A',
};

export function itemColor(item) {
    return hexOr(item?.color, DEFAULT_COLORS[item?.type] || '#8A6040');
}

function rect(x, y, w, h, fill, extra = '') {
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" ${extra}/>`;
}

// 每种家具：cx = 中心 x；返回 { svg, top }，top 用于摆放角色头像
const DRAW = {
    window(cx, c, pal, opt) {
        const w = 112, h = 100, x = cx - w / 2, y = 34;
        const sky = opt.night ? '#2C3A55' : '#9DB7C6';
        let s = rect(x, y, w, h, sky, `rx="4" stroke="${c}" stroke-width="6"`);
        s += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + h}" stroke="${c}" stroke-width="4"/>`;
        s += `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${c}" stroke-width="4"/>`;
        if (opt.night) s += `<circle cx="${x + 26}" cy="${y + 22}" r="8" fill="#F2E3B0"/>`;
        else s += `<circle cx="${x + w - 24}" cy="${y + 20}" r="9" fill="#F7E7A6" opacity="0.8"/>`;
        s += rect(x - 6, y + h + 2, w + 12, 6, shade(c, 0.1), 'rx="2"');
        return { svg: s, top: y + h };
    },
    painting(cx, c) {
        const w = 62, h = 46, x = cx - w / 2, y = 58;
        let s = rect(x, y, w, h, c, 'rx="2"');
        s += rect(x + 5, y + 5, w - 10, h - 10, '#EFE6D2');
        s += `<path d="M${x + 7} ${y + h - 7} L${x + 22} ${y + 18} L${x + 34} ${y + h - 14} L${x + 42} ${y + 24} L${x + w - 7} ${y + h - 7} Z" fill="${shade(c, 0.25)}"/>`;
        return { svg: s, top: y + h };
    },
    clock(cx, c) {
        const y = 70;
        let s = `<circle cx="${cx}" cy="${y}" r="19" fill="#F6F1E6" stroke="${c}" stroke-width="4"/>`;
        s += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y - 11}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`;
        s += `<line x1="${cx}" y1="${y}" x2="${cx + 8}" y2="${y + 4}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`;
        return { svg: s, top: y + 20 };
    },
    wallshelf(cx, c, pal) {
        const w = 92, x = cx - w / 2, y = 116;
        let s = rect(x, y, w, 6, c, 'rx="2"');
        s += rect(x + 8, y - 18, 10, 18, pal.accent, 'rx="2"');
        s += rect(x + 20, y - 22, 8, 22, shade(pal.accent, 0.4), 'rx="2"');
        s += `<circle cx="${x + 50}" cy="${y - 8}" r="8" fill="#4F8360"/>` + rect(x + 44, y - 6, 12, 6, '#B2584A');
        s += rect(x + 66, y - 14, 18, 14, '#EFE6D2', 'rx="2"');
        return { svg: s, top: y };
    },
    bookshelf(cx, c, pal) {
        const w = 80, h = 156, x = cx - w / 2, y = BACK_BASE - h;
        let s = rect(x, y, w, h, c, 'rx="3"');
        const inner = shade(c, -0.35);
        const books = [pal.accent, '#E2C38A', '#B2584A', '#B7B0A0', shade(pal.accent, 0.35)];
        for (let r = 0; r < 3; r++) {
            const sy = y + 6 + r * 50;
            s += rect(x + 6, sy, w - 12, 44, inner);
            let bx = x + 9;
            for (let b = 0; b < 6 && bx < x + w - 14; b++) {
                const bw = 6 + ((r * 7 + b * 3) % 5);
                const bh = 30 + ((r * 5 + b * 7) % 12);
                s += rect(bx, sy + 44 - bh, bw, bh, books[(r + b) % books.length]);
                bx += bw + 2;
            }
        }
        return { svg: s, top: y };
    },
    wardrobe(cx, c) {
        const w = 84, h = 160, x = cx - w / 2, y = BACK_BASE - h;
        let s = rect(x, y, w, h, c, 'rx="3"');
        s += rect(x + 5, y + 6, w / 2 - 7, h - 16, shade(c, 0.12), 'rx="2"');
        s += rect(cx + 2, y + 6, w / 2 - 7, h - 16, shade(c, 0.12), 'rx="2"');
        s += `<circle cx="${cx - 6}" cy="${y + h / 2}" r="3" fill="#E2C38A"/><circle cx="${cx + 6}" cy="${y + h / 2}" r="3" fill="#E2C38A"/>`;
        return { svg: s, top: y };
    },
    cabinet(cx, c, pal) {
        const w = 84, h = 58, x = cx - w / 2, y = BACK_BASE - h;
        let s = rect(x, y, w, h, c, 'rx="3"');
        s += rect(x + 5, y + 6, w - 10, 20, shade(c, 0.12), 'rx="2"') + rect(x + 5, y + 30, w - 10, 20, shade(c, 0.12), 'rx="2"');
        s += `<circle cx="${cx}" cy="${y + 16}" r="2.5" fill="#E2C38A"/><circle cx="${cx}" cy="${y + 40}" r="2.5" fill="#E2C38A"/>`;
        s += rect(x + 10, y - 18, 14, 18, '#EFE6D2', 'rx="3"') + `<circle cx="${x + 62}" cy="${y - 10}" r="9" fill="${shade(pal.accent, 0.3)}"/>`;
        return { svg: s, top: y - 18 };
    },
    piano(cx, c) {
        const w = 98, h = 86, x = cx - w / 2, y = BACK_BASE - h;
        let s = rect(x, y, w, h, c, 'rx="4"');
        s += rect(x + 6, y + 46, w - 12, 10, '#F6F1E6');
        for (let k = 0; k < 9; k++) s += rect(x + 12 + k * 9, y + 46, 4, 6, '#1E1E1E');
        s += rect(x + 30, y + 10, 38, 24, shade(c, 0.2), 'rx="2"');
        return { svg: s, top: y };
    },
    tv(cx, c) {
        const x = cx - 43;
        let s = rect(x, BACK_BASE - 30, 86, 30, '#8A6040', 'rx="3"');
        s += rect(x + 6, BACK_BASE - 80, 74, 46, c, 'rx="4"') + rect(x + 10, BACK_BASE - 76, 66, 38, '#3D4F5C', 'rx="2"');
        return { svg: s, top: BACK_BASE - 80 };
    },
    fridge(cx, c) {
        const w = 56, h = 146, x = cx - w / 2, y = BACK_BASE - h;
        let s = rect(x, y, w, h, c, 'rx="6"');
        s += `<line x1="${x}" y1="${y + 52}" x2="${x + w}" y2="${y + 52}" stroke="${shade(c, -0.2)}" stroke-width="2"/>`;
        s += rect(x + w - 10, y + 20, 4, 22, shade(c, -0.3), 'rx="2"') + rect(x + w - 10, y + 64, 4, 30, shade(c, -0.3), 'rx="2"');
        return { svg: s, top: y };
    },
    stove(cx, c) {
        const w = 84, h = 62, x = cx - w / 2, y = BACK_BASE - h;
        let s = rect(x, y, w, h, c, 'rx="3"') + rect(x - 2, y - 4, w + 4, 6, shade(c, -0.25), 'rx="2"');
        s += `<circle cx="${x + 24}" cy="${y - 1}" r="7" fill="none" stroke="#3B3B3B" stroke-width="2"/><circle cx="${x + 58}" cy="${y - 1}" r="7" fill="none" stroke="#3B3B3B" stroke-width="2"/>`;
        s += rect(x + 10, y + 16, w - 20, 34, shade(c, -0.15), 'rx="3"');
        return { svg: s, top: y - 6 };
    },
    sofa(cx, c) {
        const w = 150, x = cx - w / 2, base = FRONT_BASE;
        let s = rect(x + 10, base - 62, w - 20, 34, shade(c, 0.12), 'rx="12"');
        s += rect(x, base - 40, w, 30, c, 'rx="10"');
        s += rect(x - 4, base - 50, 18, 40, shade(c, -0.1), 'rx="8"') + rect(x + w - 14, base - 50, 18, 40, shade(c, -0.1), 'rx="8"');
        s += rect(x + 8, base - 10, 7, 10, '#4A3220') + rect(x + w - 15, base - 10, 7, 10, '#4A3220');
        return { svg: s, top: base - 62 };
    },
    bed(cx, c, pal) {
        const w = 170, x = cx - w / 2, base = FRONT_BASE;
        let s = rect(x, base - 76, 14, 76, pal.trim, 'rx="4"');
        s += rect(x + 6, base - 34, w - 6, 22, '#F4EEE2', 'rx="6"');
        s += rect(x + 50, base - 40, w - 50, 26, c, 'rx="8"');
        s += rect(x + 16, base - 44, 34, 14, '#FFFFFF', 'rx="6"');
        s += rect(x + 8, base - 12, 8, 12, '#4A3220') + rect(x + w - 10, base - 12, 8, 12, '#4A3220');
        return { svg: s, top: base - 76 };
    },
    desk(cx, c, pal) {
        const w = 112, x = cx - w / 2, base = FRONT_BASE;
        let s = rect(x, base - 58, w, 8, c, 'rx="2"');
        s += rect(x + 4, base - 50, 6, 50, shade(c, -0.2)) + rect(x + w - 34, base - 50, 30, 36, shade(c, -0.1), 'rx="2"');
        s += rect(x + 16, base - 74, 30, 16, '#EFE6D2', 'rx="2"');
        s += `<path d="M${x + 70} ${base - 58} L${x + 74} ${base - 80} L${x + 86} ${base - 80}" stroke="#3B3B3B" stroke-width="2" fill="none"/>`;
        s += `<path d="M${x + 80} ${base - 86} L${x + 96} ${base - 86} L${x + 92} ${base - 76} L${x + 84} ${base - 76} Z" fill="${hexOr(pal.lamp, '#F2C46D')}"/>`;
        return { svg: s, top: base - 86 };
    },
    chair(cx, c) {
        const x = cx - 21, base = FRONT_BASE;
        let s = rect(x + 2, base - 66, 6, 40, shade(c, -0.15));
        s += rect(x, base - 30, 40, 7, c, 'rx="2"');
        s += rect(x + 2, base - 23, 5, 23, shade(c, -0.2)) + rect(x + 33, base - 23, 5, 23, shade(c, -0.2));
        return { svg: s, top: base - 66 };
    },
    table(cx, c) {
        const x = cx - 46, base = FRONT_BASE;
        let s = rect(x, base - 26, 92, 7, c, 'rx="3"');
        s += rect(x + 8, base - 19, 6, 19, shade(c, -0.2)) + rect(x + 78, base - 19, 6, 19, shade(c, -0.2));
        s += rect(x + 30, base - 36, 12, 10, '#EFE6D2', 'rx="2"') + rect(x + 48, base - 34, 12, 8, '#C2452D', 'rx="2"');
        return { svg: s, top: base - 36 };
    },
    diningtable(cx, c) {
        const x = cx - 61, base = FRONT_BASE;
        let s = rect(x, base - 46, 122, 8, c, 'rx="2"');
        s += rect(x + 8, base - 38, 7, 38, shade(c, -0.2)) + rect(x + 107, base - 38, 7, 38, shade(c, -0.2));
        s += `<ellipse cx="${cx}" cy="${base - 50}" rx="16" ry="5" fill="#F6F1E6"/>`;
        return { svg: s, top: base - 52 };
    },
    lamp(cx, c, pal, opt) {
        const base = FRONT_BASE;
        let s = '';
        if (opt.night) s += `<circle cx="${cx}" cy="${base - 128}" r="46" fill="${c}" opacity="0.22"/>`;
        s += `<line x1="${cx}" y1="${base - 124}" x2="${cx}" y2="${base - 4}" stroke="#4A3220" stroke-width="4"/>`;
        s += rect(cx - 12, base - 6, 24, 6, '#4A3220', 'rx="2"');
        s += `<path d="M${cx - 18} ${base - 124} L${cx + 18} ${base - 124} L${cx + 11} ${base - 148} L${cx - 11} ${base - 148} Z" fill="${c}"/>`;
        return { svg: s, top: base - 148 };
    },
    plant(cx, c) {
        const base = FRONT_BASE;
        let s = `<path d="M${cx - 14} ${base - 24} L${cx + 14} ${base - 24} L${cx + 10} ${base} L${cx - 10} ${base} Z" fill="#B2584A"/>`;
        s += `<ellipse cx="${cx - 9}" cy="${base - 42}" rx="9" ry="17" fill="${c}" transform="rotate(-24 ${cx - 9} ${base - 42})"/>`;
        s += `<ellipse cx="${cx + 9}" cy="${base - 44}" rx="9" ry="18" fill="${shade(c, -0.12)}" transform="rotate(22 ${cx + 9} ${base - 44})"/>`;
        s += `<ellipse cx="${cx}" cy="${base - 54}" rx="8" ry="18" fill="${shade(c, 0.12)}"/>`;
        return { svg: s, top: base - 72 };
    },
    recordplayer(cx, c) {
        const x = cx - 31, base = FRONT_BASE;
        let s = rect(x + 6, base - 40, 50, 40, '#8A6040', 'rx="3"');
        s += rect(x, base - 52, 62, 12, c, 'rx="3"');
        s += `<ellipse cx="${cx - 4}" cy="${base - 53}" rx="20" ry="4" fill="#1E1E1E"/><circle cx="${cx - 4}" cy="${base - 53}" r="2" fill="#C2452D"/>`;
        return { svg: s, top: base - 58 };
    },
    bathtub(cx, c) {
        const x = cx - 71, base = FRONT_BASE;
        let s = rect(x, base - 48, 142, 40, c, 'rx="16" stroke="#C9C3B6" stroke-width="2"');
        s += `<path d="M${x + 14} ${base - 8} l-4 8 M${x + 128} ${base - 8} l4 8" stroke="#8A8577" stroke-width="4"/>`;
        s += `<circle cx="${x + 30}" cy="${base - 52}" r="5" fill="#FFFFFF" opacity="0.9"/><circle cx="${x + 42}" cy="${base - 56}" r="4" fill="#FFFFFF" opacity="0.8"/>`;
        return { svg: s, top: base - 56 };
    },
    petbed(cx, c) {
        const base = FRONT_BASE;
        let s = `<ellipse cx="${cx}" cy="${base - 8}" rx="26" ry="10" fill="${c}"/>`;
        s += `<ellipse cx="${cx}" cy="${base - 10}" rx="18" ry="6" fill="${shade(c, 0.3)}"/>`;
        return { svg: s, top: base - 18 };
    },
    photo(cx, c) {
        let s = rect(cx - 29, 64, 26, 32, c, 'rx="2"') + rect(cx - 26, 67, 20, 26, '#EFE6D2');
        s += `<circle cx="${cx - 16}" cy="${76}" r="5" fill="#B7B0A0"/>` + rect(cx - 23, 84, 14, 8, '#B7B0A0', 'rx="3"');
        s += rect(cx + 3, 56, 26, 22, c, 'rx="2"') + rect(cx + 6, 59, 20, 16, '#DCE6EA');
        s += `<path d="M${cx + 6} ${75} L${cx + 13} ${66} L${cx + 19} ${72} L${cx + 26} ${64} L${cx + 26} ${75} Z" fill="#7FA0B2"/>`;
        return { svg: s, top: 96 };
    },
    mirror(cx, c) {
        let s = `<ellipse cx="${cx}" cy="86" rx="22" ry="36" fill="${c}"/>`;
        s += `<ellipse cx="${cx}" cy="86" rx="17" ry="30" fill="#DDE7EA"/>`;
        s += `<path d="M${cx - 8} ${70} L${cx + 2} ${60}" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`;
        return { svg: s, top: 122 };
    },
    stringlights(cx, c, pal, opt) {
        const x0 = cx - 84, x1 = cx + 84;
        let s = `<path d="M${x0} 30 Q${cx - 42} 52 ${cx} 34 Q${cx + 42} 52 ${x1} 30" stroke="#4A3220" stroke-width="1.5" fill="none"/>`;
        for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const x = x0 + (x1 - x0) * t;
            const local = (t < 0.5 ? t * 2 : (t - 0.5) * 2);
            const y = 30 + Math.sin(local * Math.PI) * 14;
            if (opt.night) s += `<circle cx="${x.toFixed(1)}" cy="${(y + 5).toFixed(1)}" r="8" fill="${c}" opacity="0.25"/>`;
            s += `<circle cx="${x.toFixed(1)}" cy="${(y + 5).toFixed(1)}" r="3.2" fill="${c}"/>`;
        }
        return { svg: s, top: 50 };
    },
    aquarium(cx, c) {
        const x = cx - 36;
        let s = rect(x + 4, BACK_BASE - 38, 64, 38, '#6E4B30', 'rx="3"');
        s += rect(x, BACK_BASE - 86, 72, 48, c, 'rx="4" stroke="#E7F1F4" stroke-width="2" opacity="0.92"');
        s += `<path d="M${x + 14} ${BACK_BASE - 44} q4 -14 0 -26 M${x + 58} ${BACK_BASE - 44} q-5 -10 0 -20" stroke="#4F8360" stroke-width="3" fill="none"/>`;
        s += `<ellipse cx="${x + 34}" cy="${BACK_BASE - 64}" rx="7" ry="4" fill="#E8834F"/><path d="M${x + 41} ${BACK_BASE - 64} l5 -4 v8 z" fill="#E8834F"/>`;
        return { svg: s, top: BACK_BASE - 86 };
    },
    coatrack(cx, c) {
        const base = FRONT_BASE;
        let s = `<line x1="${cx}" y1="${base - 128}" x2="${cx}" y2="${base - 4}" stroke="#4A3220" stroke-width="4"/>`;
        s += `<path d="M${cx - 16} ${base} L${cx} ${base - 10} L${cx + 16} ${base}" stroke="#4A3220" stroke-width="4" fill="none"/>`;
        s += `<path d="M${cx - 12} ${base - 122} L${cx} ${base - 116} L${cx + 12} ${base - 122}" stroke="#4A3220" stroke-width="3" fill="none"/>`;
        s += `<path d="M${cx - 4} ${base - 116} L${cx - 18} ${base - 104} L${cx - 16} ${base - 60} L${cx + 2} ${base - 60} L${cx + 2} ${base - 112} Z" fill="${c}"/>`;
        return { svg: s, top: base - 128 };
    },
    cushion(cx, c) {
        const base = FRONT_BASE;
        let s = `<ellipse cx="${cx}" cy="${base - 9}" rx="24" ry="10" fill="${c}"/>`;
        s += `<ellipse cx="${cx}" cy="${base - 12}" rx="17" ry="5" fill="${shade(c, 0.2)}"/><circle cx="${cx}" cy="${base - 12}" r="2" fill="${shade(c, -0.3)}"/>`;
        return { svg: s, top: base - 20 };
    },
    guitar(cx, c) {
        const base = FRONT_BASE;
        let s = `<g transform="rotate(-12 ${cx} ${base})">`;
        s += rect(cx - 3, base - 104, 6, 60, '#4A3220');
        s += rect(cx - 5, base - 112, 10, 10, '#2A2A2A', 'rx="2"');
        s += `<ellipse cx="${cx}" cy="${base - 18}" rx="16" ry="18" fill="${c}"/><ellipse cx="${cx}" cy="${base - 42}" rx="12" ry="12" fill="${c}"/>`;
        s += `<circle cx="${cx}" cy="${base - 28}" r="5" fill="#2A2A2A"/></g>`;
        return { svg: s, top: base - 112 };
    },
    bookstack(cx, c, pal) {
        const base = FRONT_BASE;
        const colors = [c, '#E2C38A', '#B2584A', shade(pal.accent, 0.3)];
        let s = '';
        for (let i = 0; i < 4; i++) {
            const w = 36 - (i % 2) * 6;
            s += rect(cx - w / 2 + (i % 2 ? 3 : -2), base - 9 * (i + 1), w, 8, colors[i], 'rx="1.5"');
        }
        return { svg: s, top: base - 36 };
    },
    rug(cx, c) {
        const s = `<ellipse cx="${cx}" cy="${FRONT_BASE - 6}" rx="110" ry="20" fill="${c}" opacity="0.85"/>`
            + `<ellipse cx="${cx}" cy="${FRONT_BASE - 6}" rx="94" ry="14" fill="none" stroke="${shade(c, 0.3)}" stroke-width="2" opacity="0.8"/>`;
        return { svg: s, top: FRONT_BASE - 26 };
    },
};


// 同一层里按 x 排好，挤开重叠的
function layoutLayer(items) {
    const sorted = items.slice().sort((a, b) => a._x - b._x);
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            const minGap = (CATALOG[prev.type].w + CATALOG[cur.type].w) / 2 * 0.8;
            if (cur._x - prev._x < minGap) cur._x = prev._x + minGap;
        }
        for (const it of sorted) {
            const half = CATALOG[it.type].w / 2;
            it._x = Math.min(SCENE_W - half - 4, Math.max(half + 4, it._x));
        }
        for (let i = sorted.length - 2; i >= 0; i--) {
            const next = sorted[i + 1];
            const cur = sorted[i];
            const minGap = (CATALOG[next.type].w + CATALOG[cur.type].w) / 2 * 0.8;
            if (next._x - cur._x < minGap) cur._x = next._x - minGap;
        }
        for (const it of sorted) {
            const half = CATALOG[it.type].w / 2;
            it._x = Math.min(SCENE_W - half - 4, Math.max(half + 4, it._x));
        }
    }
    return sorted;
}

export const SCALES = [0.8, 1, 1.25];
export const SNAP = 2.5; // 网格吸附：每格 2.5%

// 缩放和翻转的支点：挂墙的东西绕自身中部，落地的东西绕底边
function pivotY(layer) {
    if (layer === 'wall') return 84;
    if (layer === 'back') return BACK_BASE;
    if (layer === 'rug') return FRONT_BASE - 6;
    return FRONT_BASE;
}

export function effectiveRow(item) {
    const layer = CATALOG[item.type]?.layer;
    if (layer !== 'back' && layer !== 'front') return layer;
    return item.row === 'back' || item.row === 'front' ? item.row : layer;
}

function itemScale(item) {
    const s = Number(item.scale);
    return SCALES.includes(s) ? s : 1;
}

/**
 * 画一个房间。
 * room.arranged 为真时完全按用户摆的位置画；否则自动排开，避免重叠。
 * @returns {{svg:string, anchors:Record<string,{x:number,y:number}>, positions:Record<string,number>}}
 */
export function renderRoom(room, furniture, palette, { night = false, selectedId = '', decorating = false } = {}) {
    const pal = {
        wall: hexOr(room?.wall, hexOr(palette?.wall, DEFAULT_PALETTE.wall)),
        floor: hexOr(room?.floor, hexOr(palette?.floor, DEFAULT_PALETTE.floor)),
        accent: hexOr(palette?.accent, DEFAULT_PALETTE.accent),
        trim: hexOr(palette?.trim, DEFAULT_PALETTE.trim),
    };
    const items = (furniture || [])
        .filter(f => CATALOG[f.type])
        .map(f => ({ ...f, _x: (Math.min(100, Math.max(0, Number(f.x) || 50)) / 100) * SCENE_W }));

    const wallShade = night ? shade(pal.wall, -0.35) : pal.wall;
    const floorShade = night ? shade(pal.floor, -0.3) : pal.floor;
    let svg = `<svg class="mxj-room-svg" viewBox="0 0 ${SCENE_W} ${SCENE_H}" role="img" aria-label="${esc(room?.name || '房间')}" preserveAspectRatio="xMidYMid slice">`;
    svg += rect(0, 0, SCENE_W, WALL_BOTTOM, wallShade);
    svg += rect(0, WALL_BOTTOM, SCENE_W, SCENE_H - WALL_BOTTOM, floorShade);
    for (let i = 1; i <= 3; i++) {
        const y = WALL_BOTTOM + i * 22;
        svg += `<line x1="0" y1="${y}" x2="${SCENE_W}" y2="${y}" stroke="${shade(floorShade, -0.15)}" stroke-width="1" opacity="0.6"/>`;
    }
    svg += rect(0, WALL_BOTTOM - 6, SCENE_W, 8, pal.trim);
    if (decorating) {
        for (let p = 5; p < 100; p += 5) {
            const x = (p / 100 * SCENE_W).toFixed(1);
            svg += `<line x1="${x}" y1="0" x2="${x}" y2="${SCENE_H}" stroke="#FFFFFF" stroke-width="${p % 25 ? 0.5 : 1}" opacity="0.35" pointer-events="none"/>`;
        }
        svg += `<line x1="0" y1="${(BACK_BASE + FRONT_BASE) / 2}" x2="${SCENE_W}" y2="${(BACK_BASE + FRONT_BASE) / 2}" stroke="#FFFFFF" stroke-dasharray="4 4" opacity="0.45" pointer-events="none"/>`;
    }

    // 分组：地毯 → 墙 → 靠墙一排 → 前排
    const groups = { rug: [], wall: [], back: [], front: [] };
    for (const it of items) groups[effectiveRow(it)].push(it);

    if (room?.arranged) {
        for (const key of Object.keys(groups)) {
            for (const it of groups[key]) {
                const half = CATALOG[it.type].w * itemScale(it) / 2;
                it._x = Math.min(SCENE_W - Math.min(half, SCENE_W / 2) , Math.max(Math.min(half, SCENE_W / 2), it._x));
            }
            groups[key].sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));
        }
    } else {
        for (const key of Object.keys(groups)) groups[key] = layoutLayer(groups[key]);
        // 挂墙的东西避开高柜子
        const obstacles = groups.back.filter(it => CATALOG[it.type].tall)
            .map(it => [it._x - CATALOG[it.type].w / 2, it._x + CATALOG[it.type].w / 2]);
        for (const it of groups.wall) {
            const half = CATALOG[it.type].w / 2;
            const hits = (x) => obstacles.some(([l, r]) => x + half > l + 2 && x - half < r - 2);
            if (!hits(it._x)) continue;
            const candidates = [];
            for (const [l, r] of obstacles) candidates.push(l - half - 6, r + half + 6);
            const ok = candidates
                .filter(x => x - half >= 4 && x + half <= SCENE_W - 4 && !hits(x))
                .sort((a, b) => Math.abs(a - it._x) - Math.abs(b - it._x));
            if (ok.length) it._x = ok[0];
        }
        // 前排：大件先画，小件叠在上面
        groups.front.sort((a, b) => (CATALOG[b.type].w >= 100) - (CATALOG[a.type].w >= 100) || a._x - b._x);
    }

    const anchors = {};
    const positions = {};
    for (const key of ['rug', 'wall', 'back', 'front']) {
        for (const it of groups[key]) {
            const layer = CATALOG[it.type].layer;
            const color = itemColor(it);
            const drawn = DRAW[it.type](it._x, color, pal, { night });
            const scale = itemScale(it);
            const flip = it.flip ? -1 : 1;
            const pivot = pivotY(layer);
            let dy = 0;
            if (key !== layer && (key === 'back' || key === 'front')) dy = pivotY(key) - pivot;
            if (layer === 'wall') dy = Math.max(-30, Math.min(60, Number(it.dy) || 0));
            const parts = [];
            if (dy) parts.push(`translate(0 ${dy})`);
            if (scale !== 1 || flip === -1) parts.push(`translate(${it._x.toFixed(1)} ${pivot}) scale(${(scale * flip).toFixed(2)} ${scale}) translate(${(-it._x).toFixed(1)} ${-pivot})`);
            const transform = parts.length ? ` transform="${parts.join(' ')}"` : '';
            const label = `${it.name || CATALOG[it.type].label}`;
            const cls = `mxj-furniture${it.id === selectedId ? ' mxj-selected' : ''}${decorating ? ' is-draggable' : ''}`;
            svg += `<g class="${cls}" data-act="furniture" data-id="${esc(it.id)}" role="button" tabindex="0" aria-label="${esc(label)}"${transform}>${drawn.svg}</g>`;
            anchors[it.id] = { x: it._x, y: pivot + (drawn.top - pivot) * scale + dy };
            positions[it.id] = Math.round(it._x / SCENE_W * 1000) / 10;
        }
    }
    if (night) svg += rect(0, 0, SCENE_W, SCENE_H, '#0B1530', 'opacity="0.18" pointer-events="none"');
    svg += '</svg>';
    return { svg, anchors, positions };
}

export function sceneMetrics() {
    return { W: SCENE_W, H: SCENE_H, wallBottom: WALL_BOTTOM, rowSplit: (BACK_BASE + FRONT_BASE) / 2 };
}

// 平面图：按房间数量切格子
export function renderFloorPlan(rooms, palette) {
    const list = (rooms || []).slice(0, 6);
    if (!list.length) return '';
    const cols = list.length <= 2 ? list.length : (list.length <= 4 ? 2 : 3);
    const wall = hexOr(palette?.wall, DEFAULT_PALETTE.wall);
    const trim = hexOr(palette?.trim, DEFAULT_PALETTE.trim);
    const fills = [wall, shade(wall, 0.25), shade(hexOr(palette?.floor, DEFAULT_PALETTE.floor), 0.45), shade(wall, -0.08), shade(wall, 0.4), shade(hexOr(palette?.accent, DEFAULT_PALETTE.accent), 0.6)];
    const spanLast = list.length % cols;
    const cells = list.map((r, i) => {
        const fill = hexOr(r.wall, fills[i % fills.length]);
        const ink = luminance(fill) < 0.35 ? '#FBFAF6' : '#1F2B25';
        const span = spanLast && i === list.length - 1 ? `grid-column:span ${cols - spanLast + 1};` : '';
        return `<div class="mxj-plan-cell" style="${span}background:${fill};color:${ink}"><b>${esc(r.name || '房间')}</b>${r.note ? `<span>${esc(r.note)}</span>` : ''}</div>`;
    }).join('');
    return `<div class="mxj-plan" style="grid-template-columns:repeat(${cols},minmax(0,1fr));background:${trim}">${cells}</div>`;
}

// 布置抽屉里的小预览：把一件家具单独裁出来画
export function renderPreview(type, color, palette) {
    const def = CATALOG[type];
    if (!def) return '';
    const pal = {
        wall: hexOr(palette?.wall, DEFAULT_PALETTE.wall),
        floor: hexOr(palette?.floor, DEFAULT_PALETTE.floor),
        accent: hexOr(palette?.accent, DEFAULT_PALETTE.accent),
        trim: hexOr(palette?.trim, DEFAULT_PALETTE.trim),
    };
    const cx = 200;
    const drawn = DRAW[type](cx, hexOr(color, DEFAULT_COLORS[type] || '#8A6040'), pal, { night: false });
    let top;
    let bottom;
    if (def.layer === 'wall') {
        top = type === 'stringlights' ? 22 : 26;
        bottom = { window: 146, painting: 108, clock: 94, wallshelf: 126, photo: 100, mirror: 126, stringlights: 58 }[type] || 140;
    } else if (def.layer === 'rug') {
        top = FRONT_BASE - 30;
        bottom = FRONT_BASE + 18;
    } else {
        top = drawn.top - 6;
        bottom = (def.layer === 'back' ? BACK_BASE : FRONT_BASE) + 4;
    }
    const w = def.w + 16;
    const h = bottom - top;
    const side = Math.max(w, h);
    const vx = cx - side / 2;
    const vy = top - (side - h) / 2;
    return `<svg viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}" aria-hidden="true" focusable="false">${drawn.svg}</svg>`;
}
