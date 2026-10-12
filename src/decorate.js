// 梦想家 · 布置模式
import { esc, uid, clip } from './util.js?mxj=0.2.0';
import { getHome, setHome } from './settings.js?mxj=0.2.0';
import { renderRoom, renderPreview, CATALOG, GROUPS, SCALES, SNAP, SCENE_W, SCENE_H, effectiveRow, sceneMetrics, itemColor } from './furniture.js?mxj=0.2.0';
import { recordChanges, suggestFurniture, furnitureFromText } from './home.js?mxj=0.2.0';
import { characterView } from './character.js?mxj=0.2.0';

const ITEM_COLORS = ['#2F5D4E', '#B2584A', '#E2C38A', '#8FA9B8', '#6E4B30', '#F4F1EA', '#2A2A2A', '#D99A4E', '#9C7BB0', '#E8A0A8'];
const WALL_COLORS = ['#C9D3C0', '#E9E1CF', '#DDE7EA', '#F3E3E0', '#D8D2E6', '#F2E6C8', '#3E5A4C', '#2F3E4E'];
const FLOOR_COLORS = ['#A87B55', '#C9A27A', '#7A5638', '#D9D4C8', '#8E8E8E', '#B9C4B4'];
const SCALE_NAMES = { 0.8: '小', 1: '中', 1.25: '大' };
const TABS = [...GROUPS, '仓库', '他挑的'];

const IC = {
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>',
    flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M8 7L3 12l5 5M16 7l5 5-5 5"/></svg>',
    size: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7"/></svg>',
    front: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="11" height="11" rx="2"/><path d="M19 9v10H9"/></svg>',
    row: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16M12 4v16"/></svg>',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v10l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v10"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

export function createDecorator({ state, render, run, flash, getRoot }) {
    const deco = {
        roomId: '',
        selected: '',
        tab: '家具',
        undo: [],
        redo: [],
        changes: [],
        describe: false,
    };
    state.deco = deco;

    function house(char) {
        return getHome(char)?.house || null;
    }

    function currentRoom(home) {
        const rooms = home.house.rooms;
        return rooms.find(r => r.id === deco.roomId) || rooms.find(r => r.id === home.currentRoom) || rooms[0];
    }

    // 第一次布置某个房间时，把自动排好的位置定下来，之后完全按用户摆的来
    function freezeRoom(home, room) {
        if (room.arranged) return;
        const items = home.house.furniture.filter(f => f.room === room.id);
        const { positions } = renderRoom(room, items, home.house.palette);
        let z = 0;
        for (const f of items) {
            if (positions[f.id] !== undefined) f.x = positions[f.id];
            f.z = z++;
        }
        room.arranged = true;
    }

    function snapshot(home) {
        return JSON.stringify({ furniture: home.house.furniture, storage: home.house.storage || [], rooms: home.house.rooms });
    }

    function restore(home, snap) {
        const data = JSON.parse(snap);
        home.house.furniture = data.furniture;
        home.house.storage = data.storage;
        home.house.rooms = data.rooms;
    }

    function mutate(char, fn, change) {
        const home = getHome(char);
        if (!home?.house) return;
        deco.undo.push(snapshot(home));
        if (deco.undo.length > 40) deco.undo.shift();
        deco.redo = [];
        fn(home);
        if (change) deco.changes.push(change);
        setHome(char, home);
    }

    function selectedItem(home) {
        return home.house.furniture.find(f => f.id === deco.selected) || null;
    }

    function nextZ(home, roomId) {
        return Math.max(0, ...home.house.furniture.filter(f => f.room === roomId).map(f => Number(f.z) || 0)) + 1;
    }

    // 找一个空一点的位置放新家具：按实际宽度算和同一排其他家具的距离
    function freeSpot(home, roomId, type) {
        const row = CATALOG[type].layer;
        const half = CATALOG[type].w / 2;
        const others = home.house.furniture
            .filter(f => f.room === roomId && effectiveRow(f) === row)
            .map(f => ({ x: (Number(f.x) || 50) / 100 * SCENE_W, half: CATALOG[f.type].w * (SCALES.includes(Number(f.scale)) ? Number(f.scale) : 1) / 2 }));
        let best = 50;
        let bestScore = -Infinity;
        for (let p = 5; p <= 95; p += SNAP) {
            const x = p / 100 * SCENE_W;
            if (x - half < 0 || x + half > SCENE_W) continue;
            const room = others.length ? Math.min(...others.map(o => Math.abs(x - o.x) - o.half - half)) : SCENE_W;
            const score = room - Math.abs(p - 50) * 0.05;
            if (score > bestScore) {
                bestScore = score;
                best = p;
            }
        }
        return best;
    }

    function addItem(char, item, fromStorageId = '') {
        const home = getHome(char);
        const room = currentRoom(home);
        let placedId = '';
        mutate(char, h => {
            const r = h.house.rooms.find(x => x.id === room.id);
            freezeRoom(h, r);
            let f;
            if (fromStorageId) {
                const idx = (h.house.storage || []).findIndex(s => s.id === fromStorageId);
                if (idx < 0) return;
                f = h.house.storage.splice(idx, 1)[0];
            } else {
                f = { id: uid('f'), type: item.type, name: item.name || CATALOG[item.type].label, color: item.color || '', by: item.by || 'user' };
            }
            f.room = room.id;
            f.x = freeSpot(h, room.id, f.type);
            f.z = nextZ(h, room.id);
            delete f.row;
            h.house.furniture.push(f);
            placedId = f.id;
        }, `在${room.name}放了「${item?.name || ''}」`);
        deco.selected = placedId;
    }

    // ---------------- 界面 ----------------

    function view(char, home) {
        if (!home?.house) return '';
        const room = currentRoom(home);
        deco.roomId = room.id;
        if (!room.arranged) {
            freezeRoom(home, room);
            setHome(char, home);
        }
        const items = home.house.furniture.filter(f => f.room === room.id);
        if (deco.selected && !items.some(f => f.id === deco.selected)) deco.selected = '';
        const { svg } = renderRoom(room, items, home.house.palette, { selectedId: deco.selected, decorating: true });
        const tabs = home.house.rooms.length > 1
            ? `<div class="mxj-chips" role="tablist">${home.house.rooms.map(r => `<button type="button" role="tab" aria-selected="${r.id === room.id}" class="mxj-chip${r.id === room.id ? ' is-on' : ''}" data-act="deco-room" data-id="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>`
            : '';
        return `
          <div class="mxj-row mxj-deco-bar">
            <button type="button" class="mxj-icon-btn" data-act="deco-undo" aria-label="撤销" ${deco.undo.length ? '' : 'disabled'}>${IC.undo}</button>
            <button type="button" class="mxj-icon-btn" data-act="deco-redo" aria-label="重做" ${deco.redo.length ? '' : 'disabled'}>${IC.redo}</button>
            <span class="mxj-grow mxj-muted mxj-center">拖动摆放，会吸附到网格</span>
            <button type="button" class="mxj-btn is-primary mxj-done" data-act="deco-done">完成</button>
          </div>
          ${tabs}
          <div class="mxj-scene is-decorating">${svg}</div>
          ${deco.selected ? toolCard(home) : roomColorCard(room, home)}
          ${drawer(char, home, room)}`;
    }

    function toolCard(home) {
        const f = selectedItem(home);
        if (!f) return '';
        const layer = CATALOG[f.type].layer;
        const scale = SCALES.includes(Number(f.scale)) ? Number(f.scale) : 1;
        const row = effectiveRow(f);
        const isFloor = layer === 'back' || layer === 'front';
        const color = itemColor(f);
        const swatches = ITEM_COLORS.map(c => `<button type="button" class="mxj-color${c.toLowerCase() === color.toLowerCase() ? ' is-on' : ''}" style="background:${c}" data-act="deco-color" data-color="${c}" aria-label="换成这个颜色" aria-pressed="${c.toLowerCase() === color.toLowerCase()}"></button>`).join('');
        const who = f.by === 'user' ? '你放的' : (f.by === 'char' ? '他挑的' : '搬进来时就有');
        return `<section class="mxj-card">
          <div class="mxj-row mxj-between">
            <div class="mxj-grow"><b>${esc(f.name)}</b><div class="mxj-muted">${f.name === CATALOG[f.type].label ? '' : `${esc(CATALOG[f.type].label)} · `}${who}</div></div>
            <button type="button" class="mxj-link-btn" data-act="deco-unselect">取消选中</button>
          </div>
          <div class="mxj-tools">
            <button type="button" class="mxj-tool" data-act="deco-nudge" data-dx="-1">${IC.left}<span>左移</span></button>
            <button type="button" class="mxj-tool" data-act="deco-nudge" data-dx="1">${IC.right}<span>右移</span></button>
            ${layer === 'wall'
                ? `<button type="button" class="mxj-tool" data-act="deco-lift" data-dy="-10">${IC.up}<span>挂高点</span></button>
                   <button type="button" class="mxj-tool" data-act="deco-lift" data-dy="10">${IC.down}<span>挂低点</span></button>`
                : `<button type="button" class="mxj-tool" data-act="deco-z" data-dz="1">${IC.front}<span>放前面</span></button>
                   <button type="button" class="mxj-tool" data-act="deco-z" data-dz="-1">${IC.back}<span>放后面</span></button>`}
            <button type="button" class="mxj-tool" data-act="deco-flip">${IC.flip}<span>翻转</span></button>
            <button type="button" class="mxj-tool" data-act="deco-scale">${IC.size}<span>大小：${SCALE_NAMES[scale]}</span></button>
            ${isFloor ? `<button type="button" class="mxj-tool" data-act="deco-row">${IC.row}<span>${row === 'back' ? '挪到前排' : '靠墙放'}</span></button>` : `<button type="button" class="mxj-tool" data-act="deco-z" data-dz="1">${IC.front}<span>放前面</span></button>`}
            <button type="button" class="mxj-tool is-danger" data-act="deco-store">${IC.store}<span>收进仓库</span></button>
          </div>
          <div class="mxj-field"><span>颜色</span><div class="mxj-colors">${swatches}</div></div>
          <label class="mxj-field"><span>名字</span>
            <input type="text" class="mxj-input" data-field="decoName" value="${esc(f.name)}" maxlength="16" autocomplete="off">
          </label>
        </section>`;
    }

    function roomColorCard(room, home) {
        const wall = (room.wall || home.house.palette.wall || '').toLowerCase();
        const floor = (room.floor || home.house.palette.floor || '').toLowerCase();
        const sw = (list, cur, act) => list.map(c => `<button type="button" class="mxj-color${c.toLowerCase() === cur ? ' is-on' : ''}" style="background:${c}" data-act="${act}" data-color="${c}" aria-label="换成这个颜色" aria-pressed="${c.toLowerCase() === cur}"></button>`).join('');
        return `<section class="mxj-card">
          <h3>${esc(room.name)}的墙和地板</h3>
          <div class="mxj-field"><span>墙面</span><div class="mxj-colors">${sw(WALL_COLORS, wall, 'deco-wall')}</div></div>
          <div class="mxj-field"><span>地板</span><div class="mxj-colors">${sw(FLOOR_COLORS, floor, 'deco-floor')}</div></div>
          <p class="mxj-muted">点房间里的家具可以挪动、翻转、换颜色。</p>
        </section>`;
    }

    function tile(home, { act, type, name, color, id = '', badge = '', why = '' }) {
        return `<button type="button" class="mxj-tile" data-act="${act}" data-type="${esc(type)}" data-name="${esc(name)}" data-color="${esc(color || '')}" data-id="${esc(id)}">
          ${badge ? `<i class="mxj-tile-badge">${esc(badge)}</i>` : ''}
          <span class="mxj-tile-pic">${renderPreview(type, color, home.house.palette)}</span>
          <span class="mxj-tile-name">${esc(name)}</span>
          ${why ? `<span class="mxj-tile-why">${esc(why)}</span>` : ''}
        </button>`;
    }

    function drawer(char, home, room) {
        const storage = home.house.storage || [];
        const tabs = TABS.map(t => {
            const count = t === '仓库' && storage.length ? `（${storage.length}）` : '';
            return `<button type="button" role="tab" aria-selected="${deco.tab === t}" class="mxj-tab${deco.tab === t ? ' is-on' : ''}" data-act="deco-tab" data-id="${esc(t)}">${esc(t)}${count}</button>`;
        }).join('');
        let body = '';
        if (GROUPS.includes(deco.tab)) {
            const tiles = Object.entries(CATALOG)
                .filter(([, d]) => d.group === deco.tab)
                .map(([type, d]) => tile(home, { act: 'deco-add', type, name: d.label, color: '' }))
                .join('');
            body = `<div class="mxj-tiles">${tiles}
              <button type="button" class="mxj-tile is-make" data-act="deco-describe">${IC.plus}<span class="mxj-tile-name">描述一件<br>让 AI 做</span></button>
            </div>
            ${deco.describe ? `<form class="mxj-say" data-form="deco-describe">
              <label class="mxj-sr" for="mxj-describe-input">想要什么样的东西</label>
              <input id="mxj-describe-input" type="text" class="mxj-input" placeholder="比如：一张能两个人窝着的旧藤椅" autocomplete="off" enterkeyhint="done">
              <button type="submit" class="mxj-icon-btn is-solid" aria-label="做出来">${IC.plus}</button>
            </form>` : ''}`;
        } else if (deco.tab === '仓库') {
            body = storage.length
                ? `<div class="mxj-tiles">${storage.map(s => tile(home, { act: 'deco-restore', type: s.type, name: s.name, color: s.color, id: s.id })).join('')}</div>`
                : '<p class="mxj-muted mxj-center">仓库是空的。收起来的家具会放在这里。</p>';
        } else {
            const sug = home.suggestions && home.suggestions.roomId === room.id ? home.suggestions.items : [];
            const name = characterView(char).name;
            body = `${sug.length ? `<div class="mxj-tiles">${sug.map((s, i) => tile(home, { act: 'deco-add-suggested', type: s.type, name: s.name, color: s.color, id: String(i), badge: '他挑的', why: s.why })).join('')}</div>` : `<p class="mxj-muted mxj-center">让${esc(name)}按自己的喜好，给${esc(room.name)}挑几件东西。</p>`}
              <button type="button" class="mxj-btn" data-act="deco-suggest" ${state.busy ? 'disabled' : ''}>${sug.length ? '让他再挑几件' : '让他挑几件'}</button>`;
        }
        return `<section class="mxj-drawer-card">
          <div class="mxj-tabs" role="tablist">${tabs}</div>
          ${body}
        </section>`;
    }

    // ---------------- 拖动 ----------------

    function attach(char) {
        const root = getRoot();
        const svg = root?.querySelector('.mxj-scene.is-decorating svg');
        if (!svg) return;
        let drag = null;
        svg.addEventListener('pointerdown', event => {
            const g = event.target?.closest?.('g.is-draggable');
            if (!g || (event.pointerType === 'mouse' && event.button !== 0)) return;
            const home = getHome(char);
            const f = home?.house?.furniture.find(x => x.id === g.dataset.id);
            if (!f) return;
            const rect = svg.getBoundingClientRect();
            drag = {
                id: f.id, g, rect,
                startX: event.clientX, startY: event.clientY,
                x0: Number(f.x) || 50, dy0: Number(f.dy) || 0,
                layer: CATALOG[f.type].layer, row0: effectiveRow(f),
                base: g.getAttribute('transform') || '',
                moved: false,
            };
            try {
                svg.setPointerCapture(event.pointerId);
            } catch { /* 忽略 */ }
            event.preventDefault();
        });
        svg.addEventListener('pointermove', event => {
            if (!drag) return;
            const dxPx = event.clientX - drag.startX;
            const dyPx = event.clientY - drag.startY;
            if (!drag.moved && Math.hypot(dxPx, dyPx) < 5) return;
            drag.moved = true;
            const sx = SCENE_W / drag.rect.width;
            const sy = SCENE_H / drag.rect.height;
            const nx = snapX(drag.x0 + dxPx * sx / SCENE_W * 100);
            const shiftX = (nx - drag.x0) / 100 * SCENE_W;
            let shiftY = 0;
            if (drag.layer === 'wall') {
                const ndy = clampDy(Math.round((drag.dy0 + dyPx * sy) / 5) * 5);
                shiftY = ndy - drag.dy0;
                drag.dy = ndy;
            } else if (drag.layer === 'back' || drag.layer === 'front') {
                const yScene = (event.clientY - drag.rect.top) * sy;
                drag.row = Math.abs(dyPx) > 12 ? (yScene < sceneMetrics().rowSplit ? 'back' : 'front') : drag.row0;
                if (drag.row !== drag.row0) shiftY = drag.row === 'back' ? -40 : 40;
            }
            drag.x = nx;
            drag.g.setAttribute('transform', `translate(${shiftX.toFixed(1)} ${shiftY}) ${drag.base}`);
            drag.g.classList.add('is-dragging');
        });
        const end = event => {
            if (!drag) return;
            const d = drag;
            drag = null;
            try {
                svg.releasePointerCapture(event.pointerId);
            } catch { /* 忽略 */ }
            if (!d.moved) {
                deco.selected = d.id;
                state.keepScroll = true;
                render();
                return;
            }
            mutate(char, h => {
                const f = h.house.furniture.find(x => x.id === d.id);
                if (!f) return;
                f.x = d.x;
                if (d.layer === 'wall' && d.dy !== undefined) f.dy = d.dy;
                if (d.row && d.row !== d.row0) {
                    f.row = d.row;
                    f.z = nextZ(h, f.room);
                }
            }, `挪动了${currentRoom(getHome(char)).name}的家具`);
            deco.selected = d.id;
            state.keepScroll = true;
            render();
        };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', event => {
            if (!drag) return;
            drag.moved = false;
            drag.g.setAttribute('transform', drag.base);
            drag = null;
            try {
                svg.releasePointerCapture(event.pointerId);
            } catch { /* 忽略 */ }
        });
    }

    function snapX(x) {
        return Math.min(100, Math.max(0, Math.round(x / SNAP) * SNAP));
    }

    function clampDy(dy) {
        return Math.max(-30, Math.min(60, dy));
    }

    // ---------------- 点击 ----------------

    function onAct(act, el, char) {
        const home = getHome(char);
        if (!home?.house) return false;
        const f = selectedItem(home);
        const rerender = () => {
            state.keepScroll = true;
            render();
        };
        switch (act) {
            case 'deco-room':
                deco.roomId = el.dataset.id;
                deco.selected = '';
                home.currentRoom = el.dataset.id;
                setHome(char, home);
                rerender();
                return true;
            case 'deco-tab':
                deco.tab = el.dataset.id;
                deco.describe = false;
                rerender();
                return true;
            case 'deco-unselect':
                deco.selected = '';
                rerender();
                return true;
            case 'deco-undo':
            case 'deco-redo': {
                const from = act === 'deco-undo' ? deco.undo : deco.redo;
                const to = act === 'deco-undo' ? deco.redo : deco.undo;
                if (!from.length) return true;
                to.push(snapshot(home));
                restore(home, from.pop());
                setHome(char, home);
                rerender();
                return true;
            }
            case 'deco-nudge':
                if (f) mutate(char, h => {
                    const it = h.house.furniture.find(x => x.id === f.id);
                    it.x = snapX((Number(it.x) || 50) + Number(el.dataset.dx) * SNAP);
                }, `挪动了${currentRoom(home).name}的家具`);
                rerender();
                return true;
            case 'deco-lift':
                if (f) mutate(char, h => {
                    const it = h.house.furniture.find(x => x.id === f.id);
                    it.dy = clampDy((Number(it.dy) || 0) + Number(el.dataset.dy));
                }, `挪动了${currentRoom(home).name}的家具`);
                rerender();
                return true;
            case 'deco-z':
                if (f) mutate(char, h => {
                    const it = h.house.furniture.find(x => x.id === f.id);
                    const same = h.house.furniture.filter(x => x.room === it.room && effectiveRow(x) === effectiveRow(it));
                    const zs = same.map(x => Number(x.z) || 0);
                    it.z = Number(el.dataset.dz) > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
                });
                rerender();
                return true;
            case 'deco-flip':
                if (f) mutate(char, h => {
                    const it = h.house.furniture.find(x => x.id === f.id);
                    it.flip = !it.flip;
                });
                rerender();
                return true;
            case 'deco-scale':
                if (f) mutate(char, h => {
                    const it = h.house.furniture.find(x => x.id === f.id);
                    const cur = SCALES.includes(Number(it.scale)) ? Number(it.scale) : 1;
                    it.scale = SCALES[(SCALES.indexOf(cur) + 1) % SCALES.length];
                });
                rerender();
                return true;
            case 'deco-row':
                if (f) mutate(char, h => {
                    const it = h.house.furniture.find(x => x.id === f.id);
                    it.row = effectiveRow(it) === 'back' ? 'front' : 'back';
                    it.z = nextZ(h, it.room);
                }, `挪动了${currentRoom(home).name}的家具`);
                rerender();
                return true;
            case 'deco-color':
                if (f) mutate(char, h => {
                    h.house.furniture.find(x => x.id === f.id).color = el.dataset.color;
                }, `给「${f.name}」换了颜色`);
                rerender();
                return true;
            case 'deco-store':
                if (f) mutate(char, h => {
                    const idx = h.house.furniture.findIndex(x => x.id === f.id);
                    const [it] = h.house.furniture.splice(idx, 1);
                    h.house.storage ||= [];
                    h.house.storage.push({ id: it.id, type: it.type, name: it.name, color: it.color, by: it.by, flip: it.flip, scale: it.scale });
                }, `把「${f.name}」收进了仓库`);
                deco.selected = '';
                rerender();
                return true;
            case 'deco-wall':
            case 'deco-floor': {
                const room = currentRoom(home);
                const key = act === 'deco-wall' ? 'wall' : 'floor';
                mutate(char, h => {
                    h.house.rooms.find(r => r.id === room.id)[key] = el.dataset.color;
                }, `给${room.name}换了${key === 'wall' ? '墙面' : '地板'}颜色`);
                rerender();
                return true;
            }
            case 'deco-add':
                addItem(char, { type: el.dataset.type, name: el.dataset.name, color: el.dataset.color, by: 'user' });
                rerender();
                return true;
            case 'deco-restore': {
                const s = (home.house.storage || []).find(x => x.id === el.dataset.id);
                if (s) addItem(char, s, s.id);
                rerender();
                return true;
            }
            case 'deco-add-suggested': {
                const s = home.suggestions?.items?.[Number(el.dataset.id)];
                if (s) {
                    addItem(char, { ...s, by: 'char' });
                    const h = getHome(char);
                    h.suggestions.items.splice(Number(el.dataset.id), 1);
                    setHome(char, h);
                }
                rerender();
                return true;
            }
            case 'deco-suggest':
                void run('他在挑东西…', signal => suggestFurniture(char, currentRoom(home).id, { signal }));
                return true;
            case 'deco-describe':
                deco.describe = !deco.describe;
                rerender();
                if (deco.describe) getRoot()?.querySelector('#mxj-describe-input')?.focus({ preventScroll: true });
                return true;
            case 'deco-done':
                leave(char);
                return true;
            default:
                return false;
        }
    }

    async function describe(char, text) {
        const desc = String(text || '').trim();
        if (!desc) return;
        let item = null;
        await run('正在做这件东西…', async signal => {
            item = await furnitureFromText(char, desc, { signal });
        });
        if (item) {
            deco.describe = false;
            addItem(char, { ...item, by: 'user' });
            state.keepScroll = true;
            render();
            flash(`做好了：${item.name}`);
        }
    }

    function rename(char, value) {
        const home = getHome(char);
        const f = home && selectedItem(home);
        const name = clip(String(value || '').trim(), 16);
        if (!f || !name || name === f.name) return;
        mutate(char, h => {
            h.house.furniture.find(x => x.id === f.id).name = name;
        });
    }

    function enter(char) {
        const home = getHome(char);
        deco.roomId = home?.currentRoom || '';
        deco.selected = '';
        deco.undo = [];
        deco.redo = [];
        deco.changes = [];
        deco.describe = false;
    }

    // 离开布置：把这次的改动记下来，他回家时会注意到
    function leave(char) {
        const changes = [...new Set(deco.changes)];
        if (changes.length) {
            recordChanges(char, changes);
            state.newLayout = changes.slice(0, 4).join('；');
        }
        deco.selected = '';
        deco.changes = [];
        state.view = 'home';
        state.keepScroll = false;
        render();
        if (changes.length) flash('布置好了');
    }

    return { view, attach, onAct, describe, rename, enter, leave };
}
