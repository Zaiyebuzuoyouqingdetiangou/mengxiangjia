// 梦想家 · 界面
import { esc, formatTime, daysSince, LOG_PREFIX, ctx, clip } from './util.js?mxj=0.3.1';
import { getSettings, updateSettings, currentCharacter, getHome, setHome, removeHome } from './settings.js?mxj=0.3.1';
import { renderRoom, renderFloorPlan, SCENE_W, SCENE_H, CATALOG } from './furniture.js?mxj=0.3.1';
import { characterView, avatarUrl } from './character.js?mxj=0.3.1';
import { spriteInRoom, spriteSvg, poseFor, HAIR_STYLES, ACCESSORIES, LOOK_COLORS } from './sprite.js?mxj=0.3.1';
import {
    HOUSE_SIZES, NOTE_KINDS, NOTE_PLACES,
    designHouse, createHome, comeHome, respond, postNote, replyToNote,
    markCharNotesRead, unreadFromChar, shouldAutoVisit, isAway,
    getLook, setLook, generateLook,
    WEATHERS, DIARY_MODES, getDiary, charTurn, unreadDiary, markDiaryRead, setDiaryMode, addUserEntry, writeCharDiary, shouldAutoDiary,
} from './home.js?mxj=0.3.1';
import { listConnectionProfiles, fetchManualModels, testConnection } from './api.js?mxj=0.3.1';
import { createDecorator } from './decorate.js?mxj=0.3.1';

const ROOT_ID = 'mxj-root';

const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h6"/></svg>',
    house: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    sofa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11V8a3 3 0 013-3h8a3 3 0 013 3v3"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2"/></svg>',
    diary: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h11a2 2 0 012 2v16H8a2 2 0 01-2-2z"/><path d="M6 19a2 2 0 012-2h11M10 7h6M10 11h4"/></svg>',
    log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5M9 8h6M9 12h6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
    pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/></svg>',
};

const state = {
    view: 'home',
    busy: '',
    error: '',
    toast: '',
    abort: null,
    selectedFurniture: '',
    draft: { size: 'flat', extra: '', emptyWall: true, proposal: null },
    composer: { kind: '日常', place: '门边', text: '', deferred: true },
    models: [],
    changelog: null,
    diaryDraft: { weather: '晴', text: '', quote: null, picking: false },
    diaryAll: false,
};

let root = null;
let viewportCleanup = null;
let originFocus = null;
const decorator = createDecorator({ state, render, run, flash, getRoot: () => root });

// ---------------- 打开 / 关闭 ----------------

function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.createElement('dialog');
    root.id = ROOT_ID;
    root.className = 'mxj-root';
    root.setAttribute('aria-label', '梦想家');
    root.innerHTML = `
      <div class="mxj-window" role="document">
        <header class="mxj-top">
          <button type="button" class="mxj-icon-btn mxj-back" data-act="close" aria-label="关闭梦想家"></button>
          <div class="mxj-titles"><div class="mxj-title"></div><div class="mxj-subtitle"></div></div>
          <button type="button" class="mxj-icon-btn" data-act="settings" aria-label="设置">${ICON.gear}</button>
        </header>
        <div class="mxj-status" hidden></div>
        <main class="mxj-main"></main>
      </div>`;
    if (globalThis.__TAURITAVERN__?.api?.layout) {
        root.setAttribute('data-tt-mobile-surface', 'backdrop');
        root.firstElementChild.setAttribute('data-tt-mobile-surface', 'fullscreen-window');
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('cancel', event => {
        event.preventDefault();
        close();
    });
    document.body.append(root);
    return root;
}

function syncViewport() {
    if (!root) return;
    const vv = globalThis.visualViewport;
    const width = vv?.width || innerWidth;
    const height = vv?.height || innerHeight;
    root.style.setProperty('--mxj-vw', `${width}px`);
    root.style.setProperty('--mxj-vh', `${height}px`);
    root.style.setProperty('--mxj-vl', `${vv?.offsetLeft || 0}px`);
    root.style.setProperty('--mxj-vt', `${vv?.offsetTop || 0}px`);
}

function watchViewport() {
    syncViewport();
    const vv = globalThis.visualViewport;
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    viewportCleanup = () => {
        vv?.removeEventListener('resize', syncViewport);
        vv?.removeEventListener('scroll', syncViewport);
        window.removeEventListener('resize', syncViewport);
    };
}

export function open() {
    ensureRoot();
    originFocus = document.activeElement;
    const char = currentCharacter();
    const home = char ? getHome(char) : null;
    state.error = '';
    state.selectedFurniture = '';
    state.view = !char ? 'nochar' : (home?.house ? 'home' : 'build');
    state.draft.proposal = null;
    root.hidden = false;
    if (typeof root.showModal === 'function') {
        if (!root.open) root.showModal();
    } else {
        root.setAttribute('open', '');
    }
    watchViewport();
    render();
    if (char && home?.house && shouldAutoVisit(home) && !state.busy) void doVisit();
}

export function close() {
    if (!root) return;
    if (state.view === 'decorate') {
        const c = currentCharacter();
        if (c) decorator.leave(c);
    }
    state.abort?.abort();
    if (root.open && typeof root.close === 'function') root.close();
    root.removeAttribute('open');
    root.hidden = true;
    viewportCleanup?.();
    viewportCleanup = null;
    try {
        originFocus?.focus?.({ preventScroll: true });
    } catch { /* 忽略 */ }
}

export function destroy() {
    close();
    root?.remove();
    root = null;
}

// ---------------- 渲染 ----------------

function render() {
    if (!root) return;
    const char = currentCharacter();
    const home = char ? getHome(char) : null;
    const back = root.querySelector('.mxj-back');
    const isTop = state.view === 'home' || state.view === 'nochar' || (state.view === 'build' && !home?.house);
    back.innerHTML = isTop ? ICON.close : ICON.back;
    back.setAttribute('aria-label', isTop ? '关闭梦想家' : '返回小屋');
    back.dataset.act = isTop ? 'close' : 'back';

    const [title, subtitle] = titles(char, home);
    root.querySelector('.mxj-title').textContent = title;
    root.querySelector('.mxj-subtitle').textContent = subtitle;

    renderStatus();
    const main = root.querySelector('.mxj-main');
    const scrollTop = main.scrollTop;
    const views = { home: viewHome, build: viewBuild, notes: viewNotes, log: viewLog, settings: viewSettings, nochar: viewNoChar, decorate: decorator.view, diary: viewDiary, look: viewLook };
    main.innerHTML = (views[state.view] || viewHome)(char, home);
    if (state.view === 'decorate' && char) decorator.attach(char);
    main.scrollTop = state.keepScroll ? scrollTop : 0;
    state.keepScroll = false;
    if (state.view === 'notes' && char && home) markCharNotesRead(char);
    if (state.view === 'diary' && char && home) markDiaryRead(char);
}

function titles(char, home) {
    const name = char ? characterView(char).name : '';
    switch (state.view) {
        case 'build': return [home?.house ? '房子档案' : `给${name}盖一间房`, home?.house ? home.house.name : '按人设设计'];
        case 'notes': return ['小纸条', `${(home?.notes || []).length} 张`];
        case 'log': return ['回家记录', `${(home?.visits || []).length} 次`];
        case 'settings': return ['梦想家设置', '生成 · 读取 · 回家'];
        case 'decorate': return ['布置', home?.house?.name || ''];
        case 'diary': {
            const n = getDiary(home).entries.length;
            return ['交换日记', n ? `第 ${Math.floor((n - 1) / 2) + 1} 页` : '新本子'];
        }
        case 'look': return [`${name}的样子`, '像素小人'];
        case 'nochar': return ['梦想家', ''];
        default: return [home?.house ? `${name}的家` : '梦想家', home?.house ? `${home.house.name} · 住了 ${daysSince(home.createdAt)} 天` : ''];
    }
}

function renderStatus() {
    const el = root.querySelector('.mxj-status');
    if (state.busy) {
        el.hidden = false;
        el.className = 'mxj-status is-busy';
        el.innerHTML = `<span class="mxj-spinner" aria-hidden="true"></span><span>${esc(state.busy)}</span><button type="button" class="mxj-link-btn" data-act="cancel">取消</button>`;
    } else if (state.error) {
        el.hidden = false;
        el.className = 'mxj-status is-error';
        el.innerHTML = `<span>${esc(state.error)}</span><button type="button" class="mxj-link-btn" data-act="dismiss">知道了</button>`;
    } else if (state.toast) {
        el.hidden = false;
        el.className = 'mxj-status is-toast';
        el.innerHTML = `<span>${esc(state.toast)}</span>`;
    } else {
        el.hidden = true;
        el.innerHTML = '';
    }
}

function isNight() {
    const h = new Date().getHours();
    return h >= 19 || h < 6;
}

function viewNoChar() {
    return `<section class="mxj-card mxj-empty">
      <p>先打开一个角色的单人聊天，再从魔法棒进入梦想家。</p>
      <p class="mxj-muted">每个角色都有自己的家，群聊暂时不支持。</p>
    </section>`;
}

function viewHome(char, home) {
    if (!home?.house) return viewBuild(char, home);
    const house = home.house;
    const roomId = house.rooms.some(r => r.id === home.currentRoom) ? home.currentRoom : house.rooms[0].id;
    const room = house.rooms.find(r => r.id === roomId);
    const furniture = house.furniture.filter(f => f.room === roomId);
    const night = isNight();
    const presence0 = home.presence || {};
    const awayNow = isAway(home) && !state.busy;
    const spotItem = house.furniture.find(f => f.id === presence0.spot);
    const showFigure = !awayNow && presence0.atHome !== false && (!spotItem || spotItem.room === roomId);
    const look = getLook(home, char);
    const pose = poseFor({ spotType: spotItem?.type || '', activity: presence0.activity, night });
    const figure = showFigure
        ? (anchors) => spriteInRoom(look, pose, spotItem ? anchors[spotItem.id] : null, SCENE_H, { label: `${characterView(char).name}（点一下看他的样子）` })
        : null;
    const { svg } = renderRoom(room, furniture, house.palette, { night, selectedId: state.selectedFurniture, figure });
    const away = isAway(home) && !state.busy;
    const presence = home.presence || {};
    const name = characterView(char).name;
    const unread = unreadFromChar(home);
    const diaryBadge = unreadDiary(home);

    const tabs = house.rooms.length > 1
        ? `<div class="mxj-chips" role="tablist">${house.rooms.map(r => `<button type="button" role="tab" aria-selected="${r.id === roomId}" class="mxj-chip${r.id === roomId ? ' is-on' : ''}" data-act="room" data-id="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>`
        : '';

    const statusLine = away
        ? `<span class="mxj-dot is-away"></span><span class="mxj-grow">他还没回来</span>`
        : `<span class="mxj-dot"></span><span class="mxj-grow">他在家${presence.activity ? ` · ${esc(presence.activity)}` : ''}</span>`;

    return `
      <div class="mxj-strip">${statusLine}<span class="mxj-muted">${night ? '夜里' : '白天'} · ${esc(formatTime(Date.now()).replace('今天 ', ''))}</span></div>
      ${tabs}
      <div class="mxj-scene">
        ${svg}
        ${unread ? `<button type="button" class="mxj-badge-btn" data-act="go" data-view="notes">${ICON.mail}<span>${unread} 张新纸条</span></button>` : ''}
        <div class="mxj-scene-hint">点家具可以互动</div>
      </div>
      ${state.selectedFurniture ? furnitureCard(home, away) : eventCard(char, home, away)}
      <nav class="mxj-entries" aria-label="小屋功能">
        <button type="button" class="mxj-entry" data-act="decorate">${ICON.sofa}<span>布置</span></button>
        <button type="button" class="mxj-entry" data-act="go" data-view="notes">${ICON.note}<span>小纸条</span>${unread ? `<i class="mxj-badge">${unread}</i>` : ''}</button>
        <button type="button" class="mxj-entry" data-act="go" data-view="diary">${ICON.diary}<span>交换日记</span>${diaryBadge ? `<i class="mxj-badge">${diaryBadge}</i>` : ''}</button>
        <button type="button" class="mxj-entry" data-act="go" data-view="log">${ICON.log}<span>回家记录</span></button>
        <button type="button" class="mxj-entry" data-act="go" data-view="build">${ICON.house}<span>房子档案</span></button>
      </nav>`;
}

function eventCard(char, home, away) {
    const name = characterView(char).name;
    if (away) {
        return `<section class="mxj-card">
          <p class="mxj-event">家里静悄悄的，${esc(name)}还没回来。</p>
          <div class="mxj-row"><button type="button" class="mxj-btn is-primary mxj-grow" data-act="visit">等他回家</button></div>
        </section>`;
    }
    const visit = home.visits?.[home.visits.length - 1];
    if (!visit) {
        return `<section class="mxj-card">
          <p class="mxj-event">新家刚布置好，${esc(name)}还没回来过。</p>
          <div class="mxj-row"><button type="button" class="mxj-btn is-primary mxj-grow" data-act="visit">等他回家</button></div>
        </section>`;
    }
    const url = avatarUrl(char);
    const turns = (visit.turns || []).slice(-4).map(t => `
        <div class="mxj-turn is-user">${esc(t.user)}</div>
        <div class="mxj-turn">${esc(t.reply)}</div>`).join('');
    let options = (visit.options || []).map(o => `<button type="button" class="mxj-btn" data-act="option" data-text="${esc(o)}">${esc(o)}</button>`).join('');
    if (state.newLayout) options = `<button type="button" class="mxj-btn is-primary" data-act="show-layout">叫他来看看新布置</button>${options}`;
    return `<section class="mxj-card">
      <div class="mxj-event-head">
        <span class="mxj-avatar">${url ? `<img src="${esc(url)}" alt="">` : esc(name.slice(0, 1))}</span>
        <p class="mxj-event">${esc(visit.event)}</p>
      </div>
      ${turns ? `<div class="mxj-turns">${turns}</div>` : ''}
      ${options ? `<div class="mxj-options">${options}</div>` : ''}
      <form class="mxj-say" data-form="say">
        <label class="mxj-sr" for="mxj-say-input">自己写一句</label>
        <input id="mxj-say-input" type="text" class="mxj-input" placeholder="做点什么，或者对他说…" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="mxj-icon-btn is-solid" aria-label="发送">${ICON.pen}</button>
      </form>
    </section>`;
}

function furnitureCard(home, away) {
    const f = home.house.furniture.find(x => x.id === state.selectedFurniture);
    if (!f) {
        state.selectedFurniture = '';
        return '';
    }
    const who = f.by === 'user' ? '你放的' : (f.by === 'char' ? '他放的' : '搬进来时就有');
    return `<section class="mxj-card">
      <div class="mxj-row mxj-between">
        <div><b>${esc(f.name)}</b><div class="mxj-muted">${f.name === CATALOG[f.type]?.label ? '' : `${esc(CATALOG[f.type]?.label || '')} · `}${who}</div></div>
        <button type="button" class="mxj-link-btn" data-act="unselect">收起</button>
      </div>
      ${away ? '<p class="mxj-muted">他不在家。等他回来再一起用吧。</p>' : `
      <div class="mxj-options">
        <button type="button" class="mxj-btn" data-act="furniture-act" data-text="叫他到${esc(f.name)}这边来">叫他过来</button>
        <button type="button" class="mxj-btn" data-act="furniture-act" data-text="坐到${esc(f.name)}旁边，陪着他">在这儿陪他</button>
      </div>
      <form class="mxj-say" data-form="furniture-say">
        <label class="mxj-sr" for="mxj-furniture-input">在${esc(f.name)}旁边做点什么</label>
        <input id="mxj-furniture-input" type="text" class="mxj-input" placeholder="在${esc(f.name)}旁边做点什么…" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="mxj-icon-btn is-solid" aria-label="发送">${ICON.pen}</button>
      </form>`}
    </section>`;
}

function viewBuild(char, home) {
    if (!char) return viewNoChar();
    const d = state.draft;
    const s = getSettings();
    const name = characterView(char).name;
    const sizes = HOUSE_SIZES.map(z => `
      <button type="button" class="mxj-size${d.size === z.id ? ' is-on' : ''}" data-act="size" data-id="${z.id}" aria-pressed="${d.size === z.id}">
        <b>${esc(z.name)}</b><span>${esc(z.sub)}</span>
      </button>`).join('');
    const showing = d.proposal || (home?.house && !d.proposal ? home.house : null);
    const isCurrent = showing && !d.proposal;
    return `
      ${showing ? proposalCard(showing, isCurrent) : ''}
      <section class="mxj-card">
        <h3>${showing ? '再设计一版' : '① 从人设里读'}</h3>
        <p class="mxj-muted">会读取 ${esc(name)} 的角色卡和你的用户人设${s.readCharacterWorldBook ? '，以及角色世界书' : ''}。</p>
        <label class="mxj-field">
          <span>补充给 AI 的要求（可空）</span>
          <input type="text" class="mxj-input" data-field="extra" value="${esc(d.extra)}" placeholder="比如：想要一个能看到海的阳台">
        </label>
      </section>
      <section class="mxj-card">
        <h3>${showing ? '房子大小' : '② 房子大小'}</h3>
        <div class="mxj-sizes">${sizes}</div>
        <label class="mxj-check">
          <span>留些空位，等我们一起布置</span>
          <input type="checkbox" data-field="emptyWall" ${d.emptyWall ? 'checked' : ''}>
        </label>
      </section>
      ${home?.house ? '<p class="mxj-muted mxj-pad">换房子只会换掉房子本身，纸条和回家记录都会留着。</p>' : ''}
      <div class="mxj-row">
        <button type="button" class="mxj-btn is-primary mxj-grow" data-act="design" ${state.busy ? 'disabled' : ''}>${showing ? '按人设重新设计' : '开始设计'}</button>
      </div>`;
}

function proposalCard(house, isCurrent) {
    const swatches = ['wall', 'floor', 'accent', 'trim'].map(k => `<span class="mxj-swatch"><i style="background:${esc(house.palette[k])}"></i>${{ wall: '墙', floor: '地板', accent: '主色', trim: '木作' }[k]}</span>`).join('');
    const rooms = house.rooms.map(r => {
        const items = house.furniture.filter(f => f.room === r.id).map(f => esc(f.name)).join('、');
        return `<li><b>${esc(r.name)}</b>：${items || '空着'}</li>`;
    }).join('');
    return `<section class="mxj-card mxj-proposal">
      <div class="mxj-row mxj-between">
        <h3>${isCurrent ? '现在的家' : 'AI 的设计提案'}</h3>
      </div>
      <div class="mxj-house-name">${esc(house.name)}</div>
      ${house.story ? `<p>${esc(house.story)}</p>` : ''}
      ${renderFloorPlan(house.rooms, house.palette)}
      <div class="mxj-swatches">${swatches}</div>
      <ul class="mxj-room-list">${rooms}</ul>
      ${isCurrent ? '<button type="button" class="mxj-btn" data-act="go" data-view="look">他的样子（像素小人）</button>' : ''}
      ${isCurrent ? '' : `<div class="mxj-row">
        <button type="button" class="mxj-btn mxj-grow" data-act="design">${ICON.refresh}换一版</button>
        <button type="button" class="mxj-btn is-primary mxj-grow" data-act="accept">就住这里</button>
      </div>`}
    </section>`;
}

function noteCard(n, home, name) {
    const from = n.from === 'user' ? '我写的' : name;
    const isNew = n.from === 'char' && !n.readAt;
    let status = '';
    if (n.from === 'user') {
        if (n.replyId) status = '<span class="mxj-note-status is-ok">他回了</span>';
        else if (n.readAt) status = '<span class="mxj-note-status">他看过了</span>';
        else status = '<span class="mxj-note-status">他还没看到</span>';
    }
    let replyTo = '';
    if (n.replyTo) {
        const orig = home.notes.find(x => x.id === n.replyTo);
        if (orig) replyTo = `<div class="mxj-note-quote">回你的「${esc(orig.text.slice(0, 18))}${orig.text.length > 18 ? '…' : ''}」</div>`;
    }
    const tilt = ((n.id.charCodeAt(n.id.length - 1) % 5) - 2) * 0.6;
    return `<article class="mxj-note kind-${NOTE_KINDS.indexOf(n.kind)}${n.from === 'user' ? ' is-mine' : ''}" style="transform:rotate(${tilt}deg)">
      <div class="mxj-note-meta"><span class="mxj-note-kind">${esc(n.kind)}</span><span>${esc(from)} · ${esc(n.place)} · ${esc(formatTime(n.at))}${isNew ? ' · 新' : ''}</span></div>
      ${replyTo}
      <div class="mxj-note-text">${esc(n.text)}</div>
      <div class="mxj-row mxj-between">${status || '<span></span>'}${n.from === 'char' ? `<button type="button" class="mxj-link-btn" data-act="reply-note" data-kind="${esc(n.kind)}">回他一张</button>` : ''}</div>
    </article>`;
}

function viewNotes(char, home) {
    if (!home) return viewNoChar();
    const name = characterView(char).name;
    const notes = (home.notes || []).slice().reverse();
    const c = state.composer;
    const kinds = NOTE_KINDS.map(k => `<button type="button" class="mxj-chip${c.kind === k ? ' is-on is-red' : ''}" data-act="kind" data-id="${esc(k)}" aria-pressed="${c.kind === k}">${esc(k)}</button>`).join('');
    const places = NOTE_PLACES.map(p => `<button type="button" class="mxj-place${c.place === p ? ' is-on' : ''}" data-act="place" data-id="${esc(p)}" aria-pressed="${c.place === p}">${esc(p)}</button>`).join('');
    return `
      <section class="mxj-board">
        ${notes.length ? notes.map(n => noteCard(n, home, name)).join('') : '<p class="mxj-board-empty">门边的软木板还空着。</p>'}
      </section>
      <section class="mxj-card" id="mxj-composer">
        <h3>写一张</h3>
        <div class="mxj-chips is-wrap">${kinds}</div>
        <label class="mxj-field">
          <span>写给${esc(name)}</span>
          <textarea class="mxj-input mxj-paper" rows="3" data-field="noteText" placeholder="想说的话…">${esc(c.text)}</textarea>
        </label>
        <div class="mxj-field"><span>贴在哪里</span><div class="mxj-places">${places}</div></div>
        <label class="mxj-check">
          <span>他回家时再读（不马上回复）</span>
          <input type="checkbox" data-field="deferred" ${c.deferred ? 'checked' : ''}>
        </label>
        <button type="button" class="mxj-btn is-red" data-act="post-note" ${state.busy ? 'disabled' : ''}>贴上去</button>
      </section>`;
}

function viewLog(char, home) {
    if (!home) return viewNoChar();
    const visits = (home.visits || []).slice().reverse();
    if (!visits.length) return '<section class="mxj-card mxj-empty"><p>他还没回过家。</p></section>';
    return visits.map(v => `<section class="mxj-card">
        <div class="mxj-muted">${esc(formatTime(v.at))}${v.activity ? ` · ${esc(v.activity)}` : ''}${v.mood ? ` · ${esc(v.mood)}` : ''}</div>
        <p class="mxj-event">${esc(v.event)}</p>
        ${(v.turns || []).map(t => `<div class="mxj-turn is-user">${esc(t.user)}</div><div class="mxj-turn">${esc(t.reply)}</div>`).join('')}
      </section>`).join('');
}

function viewLook(char, home) {
    if (!home) return viewNoChar();
    const look = getLook(home, char);
    const poses = [
        { label: '站着', pose: {} },
        { label: '坐着看书', pose: { sit: true, prop: 'book' } },
        { label: '拿着杯子', pose: { prop: 'mug' } },
        { label: '睡着了', pose: { sit: true, closed: true } },
    ];
    const preview = poses.map(p => `<figure class="mxj-look-pose">${spriteSvg(look, p.pose, { attrs: 'class="mxj-pixel" aria-hidden="true"' })}<figcaption>${p.label}</figcaption></figure>`).join('');
    const chips = (list, cur, act) => list.map(x => `<button type="button" class="mxj-chip${x.id === cur ? ' is-on' : ''}" data-act="${act}" data-id="${x.id}" aria-pressed="${x.id === cur}">${esc(x.label)}</button>`).join('');
    const colors = (key, label) => `<div class="mxj-field"><span>${label}</span><div class="mxj-colors">${LOOK_COLORS[key].map(c => `<button type="button" class="mxj-color${c.toLowerCase() === String(look[key]).toLowerCase() ? ' is-on' : ''}" style="background:${c}" data-act="look-color" data-key="${key}" data-color="${c}" aria-label="${label}换成这个颜色" aria-pressed="${c.toLowerCase() === String(look[key]).toLowerCase()}"></button>`).join('')}</div></div>`;
    return `
      <section class="mxj-card">
        <div class="mxj-look-preview">${preview}</div>
        <p class="mxj-muted">他回家时会以这个样子出现在房间里，姿势跟着他在做的事变。</p>
        <button type="button" class="mxj-btn" data-act="look-gen" ${state.busy ? 'disabled' : ''}>按人设重新生成</button>
      </section>
      <section class="mxj-card">
        <h3>发型</h3>
        <div class="mxj-chips is-wrap">${chips(HAIR_STYLES, look.hairStyle, 'look-style')}</div>
        <h3>配饰</h3>
        <div class="mxj-chips is-wrap">${chips(ACCESSORIES, look.accessory, 'look-acc')}</div>
      </section>
      <section class="mxj-card">
        ${colors('hair', '发色')}
        ${colors('eyes', '瞳色')}
        ${colors('skin', '肤色')}
        ${colors('outfit', '衣服')}
      </section>`;
}

function recentChatForQuote() {
    const chat = Array.isArray(ctx().chat) ? ctx().chat : [];
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < 8; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        const text = String(m.mes || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text) out.push({ name: m.name || (m.is_user ? '我' : '他'), text: clip(text, 200) });
    }
    return out;
}

function diaryEntryHtml(e, name) {
    const mine = e.author === 'user';
    const [y, m, d] = String(e.date || '').split('-');
    const dateText = m ? `${Number(m)} 月 ${Number(d)} 日` : '';
    return `<article class="mxj-diary-entry${mine ? ' is-mine' : ''}">
      <div class="mxj-diary-meta"><span>${esc(dateText)}${e.weather ? ` · ${esc(e.weather)}` : ''}</span><span>${mine ? '你写的' : `${esc(name)}写的`}</span></div>
      ${e.quote ? `<blockquote class="mxj-diary-quote">${esc(e.quote.name)}：${esc(e.quote.text)}</blockquote>` : ''}
      <div class="mxj-diary-text">${esc(e.text)}</div>
      ${e.stamp ? `<div class="mxj-stamp" aria-label="印章">${esc(e.stamp)}</div>` : ''}
    </article>`;
}

function viewDiary(char, home) {
    if (!home) return viewNoChar();
    const name = characterView(char).name;
    const diary = getDiary(home);
    const entries = diary.entries;
    const shown = state.diaryAll ? entries : entries.slice(-8);
    const hisTurn = charTurn(home);
    const dr = state.diaryDraft;
    const modeText = { visit: `${name}下次回家时会接着写。`, daily: `${name}每天会写一篇，今天写过就等明天。`, manual: `等你叫${name}写。` }[diary.mode];
    let writer = '';
    if (hisTurn) {
        writer = `<section class="mxj-card">
          <p><b>轮到${esc(name)}写了。</b>${esc(modeText)}</p>
          <button type="button" class="mxj-btn" data-act="diary-ask" ${state.busy ? 'disabled' : ''}>叫他现在写</button>
        </section>`;
    } else {
        const weathers = WEATHERS.map(w => `<button type="button" class="mxj-chip${dr.weather === w ? ' is-on' : ''}" data-act="diary-weather" data-id="${esc(w)}" aria-pressed="${dr.weather === w}">${esc(w)}</button>`).join('');
        const quotes = dr.picking ? recentChatForQuote() : [];
        writer = `<section class="mxj-diary-page is-writing">
          <div class="mxj-diary-meta"><span>${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日 · 轮到你写</span></div>
          <div class="mxj-chips">${weathers}</div>
          ${dr.quote ? `<blockquote class="mxj-diary-quote">${esc(dr.quote.name)}：${esc(dr.quote.text)} <button type="button" class="mxj-link-btn" data-act="diary-unquote">去掉</button></blockquote>` : ''}
          <label class="mxj-sr" for="mxj-diary-text">今天的日记</label>
          <textarea id="mxj-diary-text" class="mxj-input mxj-diary-input" rows="6" data-field="diaryText" placeholder="写点今天发生的事…">${esc(dr.text)}</textarea>
          <button type="button" class="mxj-btn" data-act="diary-pick">${dr.picking ? '收起聊天' : '引用一段聊天'}</button>
          ${dr.picking ? `<div class="mxj-quote-list">${quotes.length ? quotes.map((q, i) => `<button type="button" class="mxj-quote-item" data-act="diary-quote" data-idx="${i}"><b>${esc(q.name)}</b>${esc(q.text)}</button>`).join('') : '<p class="mxj-muted">当前聊天里还没有可以引用的话。</p>'}</div>` : ''}
        </section>`;
    }
    const modes = DIARY_MODES.map(m => `<button type="button" class="mxj-place${diary.mode === m.id ? ' is-on' : ''}" data-act="diary-mode" data-id="${m.id}" aria-pressed="${diary.mode === m.id}">${esc(m.label)}</button>`).join('');
    return `
      <div class="mxj-strip"><span class="mxj-dot${hisTurn ? ' is-away' : ' is-red'}"></span><span class="mxj-grow">${hisTurn ? `轮到${esc(name)}写` : '轮到你写'}</span><span class="mxj-muted">共 ${entries.length} 篇</span></div>
      <section class="mxj-notebook">
        ${entries.length > shown.length ? `<button type="button" class="mxj-link-btn" data-act="diary-more">看更早的 ${entries.length - shown.length} 篇</button>` : ''}
        ${shown.length ? shown.map(e => diaryEntryHtml(e, name)).join('') : `<p class="mxj-diary-empty">新本子。你先写第一篇，${esc(name)}会接着写。</p>`}
      </section>
      ${writer}
      <section class="mxj-card">
        <h3>${esc(name)}什么时候接着写</h3>
        <div class="mxj-places is-three">${modes}</div>
      </section>
      ${hisTurn ? '' : '<button type="button" class="mxj-btn is-primary" data-act="diary-save">合上本子，放回书桌</button>'}`;
}

function viewSettings(char, home) {
    const s = getSettings();
    const profiles = listConnectionProfiles();
    const independent = s.generationSource === 'independent';
    const profileOptions = [`<option value="">不用连接配置（手动填写接口）</option>`]
        .concat(profiles.map(p => `<option value="${esc(p.id)}" ${p.id === s.independentConnectionProfileId ? 'selected' : ''}>${esc(p.name)}</option>`))
        .join('');
    const modelOptions = state.models.length
        ? `<select class="mxj-input" data-field="modelSelect"><option value="">从列表里选一个</option>${state.models.map(m => `<option value="${esc(m)}" ${m === s.independentApiModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`
        : '';
    const usingProfile = !!s.independentConnectionProfileId;
    return `
      <section class="mxj-card">
        <h3>生成用哪个 API</h3>
        <div class="mxj-places is-two" role="radiogroup" aria-label="生成用哪个 API">
          <button type="button" role="radio" class="mxj-place${!independent ? ' is-on' : ''}" data-act="source" data-id="follow" aria-checked="${!independent}">跟随当前 API</button>
          <button type="button" role="radio" class="mxj-place${independent ? ' is-on' : ''}" data-act="source" data-id="independent" aria-checked="${independent}">使用副 API</button>
        </div>
        <p class="mxj-muted">${independent ? '现在用的是下面配置的副 API。' : '现在跟着酒馆当前的 API 生成。想单独用一个 API，选「使用副 API」，再填下面的设置。'}</p>
        <button type="button" class="mxj-btn" data-act="test" ${state.busy ? 'disabled' : ''}>测试连接</button>
      </section>
      <section class="mxj-card${independent ? '' : ' is-dim'}">
        <h3>副 API 设置</h3>
        <label class="mxj-field"><span>酒馆连接配置（可选）</span>
          <div class="mxj-row"><select class="mxj-input mxj-grow" data-field="independentConnectionProfileId">${profileOptions}</select>
          <button type="button" class="mxj-icon-btn" data-act="refresh-profiles" aria-label="刷新连接配置">${ICON.refresh}</button></div>
        </label>
        ${usingProfile ? '' : `
        <label class="mxj-field"><span>API 地址</span>
          <input type="text" class="mxj-input" data-field="independentApiBaseUrl" value="${esc(s.independentApiBaseUrl)}" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="API 地址">
        </label>
        <label class="mxj-field"><span>API Key</span>
          <input type="password" class="mxj-input" data-field="independentApiKey" value="${esc(s.independentApiKey)}" autocomplete="off" placeholder="API Key">
        </label>
        <button type="button" class="mxj-btn" data-act="fetch-models" ${state.busy ? 'disabled' : ''}>拉取模型列表</button>`}
        <label class="mxj-field"><span>模型 ID${usingProfile ? '（空着就用连接配置里的模型）' : ''}</span>
          ${modelOptions}
          <input type="text" class="mxj-input" data-field="independentApiModel" value="${esc(s.independentApiModel)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="模型 ID">
        </label>
        <div class="mxj-two">
          <label class="mxj-field"><span>温度</span><input type="number" class="mxj-input" data-field="independentApiTemperature" value="${esc(s.independentApiTemperature)}" min="0" max="2" step="0.05" inputmode="decimal"></label>
          <label class="mxj-field"><span>最大输出</span><input type="number" class="mxj-input" data-field="independentApiMaxTokens" value="${esc(s.independentApiMaxTokens)}" min="256" max="64000" step="256" inputmode="numeric"></label>
        </div>
      </section>
      <section class="mxj-card">
        <h3>生成时读取</h3>
        <label class="mxj-check"><span>角色世界书</span><input type="checkbox" data-field="readCharacterWorldBook" ${s.readCharacterWorldBook ? 'checked' : ''}></label>
        <label class="mxj-check"><span>最近的聊天</span><input type="checkbox" data-field="readRecentChat" ${s.readRecentChat ? 'checked' : ''}></label>
        ${s.readRecentChat ? `<label class="mxj-field"><span>读最近几条</span><input type="number" class="mxj-input" data-field="recentChatCount" value="${esc(s.recentChatCount)}" min="1" max="40" step="1" inputmode="numeric"></label>` : ''}
      </section>
      <section class="mxj-card">
        <h3>他什么时候回家</h3>
        <label class="mxj-radio"><input type="radio" name="mxj-visit" data-field="visitMode" value="open" ${s.visitMode === 'open' ? 'checked' : ''}><span>打开小屋时，离上次回家够久就回来</span></label>
        <label class="mxj-radio"><input type="radio" name="mxj-visit" data-field="visitMode" value="manual" ${s.visitMode === 'manual' ? 'checked' : ''}><span>只在我点「等他回家」时</span></label>
        ${s.visitMode === 'open' ? `<label class="mxj-field"><span>至少隔多少分钟</span><input type="number" class="mxj-input" data-field="visitGapMinutes" value="${esc(s.visitGapMinutes)}" min="0" step="10" inputmode="numeric"></label>` : ''}
      </section>
      ${changelogCard()}
      ${home?.house ? `<section class="mxj-card">
        <h3>拆掉这个家</h3>
        <p class="mxj-muted">删除${esc(characterView(char).name)}的家，连同纸条和回家记录。删除后不能恢复。</p>
        <button type="button" class="mxj-btn is-danger" data-act="demolish">拆掉这个家</button>
      </section>` : ''}`;
}

function changelogCard() {
    if (state.changelog === null) {
        void loadChangelog();
        return '<section class="mxj-card"><h3>更新日志</h3><p class="mxj-muted">读取中…</p></section>';
    }
    if (!state.changelog) return '';
    return `<section class="mxj-card"><h3>更新日志 · ${esc(state.changelog.title)}</h3><ul class="mxj-changelog">${state.changelog.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`;
}

async function loadChangelog() {
    state.changelog = false;
    try {
        const url = new URL('../README.md', import.meta.url);
        const text = await (await fetch(url, { cache: 'no-cache' })).text();
        const lines = text.split(/\r?\n/);
        const start = lines.findIndex(l => /^##\s+\S/.test(l));
        if (start < 0) return;
        const items = [];
        for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
            const m = lines[i].match(/^\s*[-*]\s+(.*)$/);
            if (m) items.push(m[1].replace(/`/g, ''));
        }
        state.changelog = { title: lines[start].replace(/^##\s+/, ''), items };
    } catch {
        state.changelog = false;
    }
    if (state.view === 'settings') {
        state.keepScroll = true;
        render();
    }
}

// ---------------- 交互 ----------------

function go(view) {
    state.view = view;
    state.error = '';
    state.selectedFurniture = '';
    if (view === 'diary') {
        state.diaryAll = false;
        state.diaryDraft.picking = false;
    }
    render();
    root.querySelector('.mxj-main').scrollTop = 0;
    if (view === 'diary') {
        const char = currentCharacter();
        const home = char ? getHome(char) : null;
        if (home && shouldAutoDiary(home)) void askDiary(char);
    }
}

async function askDiary(char) {
    const name = characterView(char).name;
    await run(`${name}在写日记…`, signal => writeCharDiary(char, { signal }));
    if (state.view === 'diary') {
        const main = root?.querySelector('.mxj-main');
        if (main) main.scrollTop = main.scrollHeight;
    }
}

async function run(label, task) {
    if (state.busy) return;
    state.busy = label;
    state.error = '';
    state.toast = '';
    state.abort = new AbortController();
    state.keepScroll = true;
    render();
    try {
        await task(state.abort.signal);
    } catch (error) {
        if (state.abort?.signal.aborted) state.error = '已取消。';
        else {
            state.error = error?.message || String(error);
            console.warn(LOG_PREFIX, error);
        }
    } finally {
        state.busy = '';
        state.abort = null;
        state.keepScroll = true;
        if (root?.open) render();
    }
}

function flash(text) {
    state.toast = text;
    renderStatus();
    setTimeout(() => {
        if (state.toast === text) {
            state.toast = '';
            if (root) renderStatus();
        }
    }, 2600);
}

async function doVisit() {
    const char = currentCharacter();
    if (!char) return;
    const name = characterView(char).name;
    await run(`${name}正在回家的路上…`, signal => comeHome(char, { signal }));
    const h = getHome(char);
    if (h && h.changesSeenAt >= Date.now() - 60000) state.newLayout = '';
}

async function doRespond(text, furnitureId = '') {
    const char = currentCharacter();
    const action = String(text || '').trim();
    if (!char || !action) return;
    state.selectedFurniture = '';
    await run('他在想怎么回应…', signal => respond(char, action, { signal, furnitureId }));
}

function onKeydown(event) {
    const g = event.target?.closest?.('g[data-act="furniture"]');
    if (g && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
}

function onClick(event) {
    if (event.target === root) {
        close();
        return;
    }
    const el = event.target?.closest?.('[data-act]');
    if (!el || !root.contains(el)) return;
    if (el.tagName === 'BUTTON' && el.type === 'submit') return;
    const act = el.dataset.act;
    const char = currentCharacter();
    switch (act) {
        case 'close': close(); break;
        case 'back':
            if (state.view === 'decorate' && char) decorator.leave(char);
            else go(char && getHome(char)?.house ? 'home' : 'build');
            break;
        case 'decorate':
            if (!char) break;
            decorator.enter(char);
            go('decorate');
            break;
        case 'show-layout': {
            const summary = state.newLayout;
            state.newLayout = '';
            void doRespond(`你把家里重新布置了一下（${summary}），叫他过来看看`).then(() => {
                const h = getHome(char);
                if (h) {
                    h.changesSeenAt = Date.now();
                    setHome(char, h);
                }
            });
            break;
        }
        case 'settings': go('settings'); break;
        case 'go': go(el.dataset.view); break;
        case 'cancel': state.abort?.abort(); break;
        case 'dismiss': state.error = ''; renderStatus(); break;
        case 'room': {
            const home = getHome(char);
            home.currentRoom = el.dataset.id;
            state.selectedFurniture = '';
            setHome(char, home);
            state.keepScroll = true;
            render();
            break;
        }
        case 'furniture':
            if (state.view === 'decorate') {
                state.deco.selected = el.dataset.id;
                state.keepScroll = true;
                render();
                break;
            }
            state.selectedFurniture = state.selectedFurniture === el.dataset.id ? '' : el.dataset.id;
            state.keepScroll = true;
            render();
            break;
        case 'unselect': state.selectedFurniture = ''; state.keepScroll = true; render(); break;
        case 'avatar': go('look'); break;
        case 'look-style': setLook(char, { hairStyle: el.dataset.id }); state.keepScroll = true; render(); break;
        case 'look-acc': setLook(char, { accessory: el.dataset.id }); state.keepScroll = true; render(); break;
        case 'look-color': setLook(char, { [el.dataset.key]: el.dataset.color }); state.keepScroll = true; render(); break;
        case 'look-gen': void run('正在按人设画他…', signal => generateLook(char, { signal })); break;
        case 'diary-weather': state.diaryDraft.weather = el.dataset.id; state.keepScroll = true; render(); break;
        case 'diary-pick': state.diaryDraft.picking = !state.diaryDraft.picking; state.keepScroll = true; render(); break;
        case 'diary-quote': {
            const q = recentChatForQuote()[Number(el.dataset.idx)];
            if (q) state.diaryDraft.quote = q;
            state.diaryDraft.picking = false;
            state.keepScroll = true;
            render();
            break;
        }
        case 'diary-unquote': state.diaryDraft.quote = null; state.keepScroll = true; render(); break;
        case 'diary-more': state.diaryAll = true; state.keepScroll = true; render(); break;
        case 'diary-mode': setDiaryMode(char, el.dataset.id); state.keepScroll = true; render(); break;
        case 'diary-ask': void askDiary(char); break;
        case 'diary-save': {
            const dr = state.diaryDraft;
            const text = String(dr.text || '').trim();
            if (text) {
                addUserEntry(char, dr);
                state.diaryDraft = { weather: dr.weather, text: '', quote: null, picking: false };
                go('home');
                flash('本子放回书桌了');
            } else {
                go('home');
            }
            break;
        }
        case 'visit': void doVisit(); break;
        case 'option': void doRespond(el.dataset.text); break;
        case 'furniture-act': void doRespond(el.dataset.text, state.selectedFurniture); break;
        case 'size': state.draft.size = el.dataset.id; state.keepScroll = true; render(); break;
        case 'design':
            void run('正在按人设设计房子…', async signal => {
                state.draft.proposal = await designHouse(char, { ...state.draft, signal });
            }).then(() => {
                if (state.draft.proposal) root.querySelector('.mxj-main').scrollTop = 0;
            });
            break;
        case 'accept': {
            if (!state.draft.proposal) break;
            const fresh = !getHome(char)?.house;
            createHome(char, state.draft.proposal);
            state.draft.proposal = null;
            go('home');
            if (fresh && getSettings().visitMode === 'open') void doVisit();
            break;
        }
        case 'kind': state.composer.kind = el.dataset.id; state.keepScroll = true; render(); break;
        case 'place': state.composer.place = el.dataset.id; state.keepScroll = true; render(); break;
        case 'reply-note':
            state.composer.kind = el.dataset.kind || '日常';
            state.keepScroll = true;
            render();
            root.querySelector('#mxj-composer')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            root.querySelector('[data-field="noteText"]')?.focus({ preventScroll: true });
            break;
        case 'post-note': void submitNote(char); break;
        case 'source':
            updateSettings({ generationSource: el.dataset.id === 'independent' ? 'independent' : 'follow' });
            state.keepScroll = true;
            render();
            break;
        case 'refresh-profiles': state.keepScroll = true; render(); flash('已刷新连接配置'); break;
        case 'fetch-models': {
            const s = getSettings();
            void run('正在拉取模型…', async () => {
                state.models = await fetchManualModels(s.independentApiBaseUrl, s.independentApiKey);
                flash(`拿到 ${state.models.length} 个模型`);
            });
            break;
        }
        case 'test':
            void run('正在测试连接…', async () => {
                const reply = await testConnection();
                flash(`连接正常：${reply}`);
            });
            break;
        case 'demolish':
            if (globalThis.confirm?.('确定要拆掉这个家吗？纸条和回家记录也会一起删除。') !== false) {
                removeHome(char);
                go('build');
            }
            break;
        default:
            if (act.startsWith('deco-') && char) decorator.onAct(act, el, char);
            break;
    }
}

async function submitNote(char) {
    const c = state.composer;
    const text = String(c.text || '').trim();
    if (!text) {
        state.error = '纸条还是空的。';
        renderStatus();
        return;
    }
    const note = postNote(char, c);
    c.text = '';
    if (c.deferred) {
        state.keepScroll = false;
        render();
        flash('贴好了，他回家时会看到');
        return;
    }
    await run('他在看你的纸条…', signal => replyToNote(char, note.id, { signal }));
}

function onChange(event) {
    const el = event.target;
    const field = el?.dataset?.field;
    if (!field) return;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    switch (field) {
        case 'emptyWall': state.draft.emptyWall = value; return;
        case 'deferred': state.composer.deferred = value; return;
        case 'extra': state.draft.extra = value; return;
        case 'noteText': state.composer.text = value; return;
        case 'diaryText': state.diaryDraft.text = value; return;
        case 'decoName': {
            const c = currentCharacter();
            if (c) decorator.rename(c, value);
            state.keepScroll = true;
            render();
            return;
        }
        case 'modelSelect':
            if (value) {
                updateSettings({ independentApiModel: value });
                state.keepScroll = true;
                render();
            }
            return;
        default: break;
    }
    const numeric = ['independentApiTemperature', 'independentApiMaxTokens', 'recentChatCount', 'visitGapMinutes'];
    const patch = { [field]: numeric.includes(field) ? Number(value) : value };
    if (field === 'independentApiBaseUrl') state.models = [];
    updateSettings(patch);
    const rerender = ['generationSource', 'independentConnectionProfileId', 'readRecentChat', 'visitMode'];
    if (rerender.includes(field)) {
        state.keepScroll = true;
        render();
    }
}

function onInput(event) {
    const el = event.target;
    const field = el?.dataset?.field;
    if (field === 'noteText') state.composer.text = el.value;
    if (field === 'extra') state.draft.extra = el.value;
    if (field === 'diaryText') state.diaryDraft.text = el.value;
}

// 表单提交（回车或发送按钮）
document.addEventListener('submit', event => {
    const form = event.target;
    if (!root || !root.contains(form)) return;
    event.preventDefault();
    const input = form.querySelector('input');
    const text = input?.value || '';
    if (form.dataset.form === 'say') void doRespond(text);
    if (form.dataset.form === 'deco-describe') {
        const c = currentCharacter();
        if (c) void decorator.describe(c, text);
    }
    if (form.dataset.form === 'furniture-say') {
        const f = state.selectedFurniture;
        void doRespond(text, f);
    }
}, true);

// 切换聊天时，开着的面板跟着换角色
export function onChatChanged() {
    if (!root?.open) return;
    state.abort?.abort();
    state.draft.proposal = null;
    state.newLayout = '';
    const char = currentCharacter();
    const home = char ? getHome(char) : null;
    state.view = !char ? 'nochar' : (home?.house ? 'home' : 'build');
    render();
}
