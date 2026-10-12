// 梦想家 · 入口：魔法棒菜单 + 扩展设置里的打开按钮
import { getSettings } from './src/settings.js?mxj=0.1.0';
import { ctx, LOG_PREFIX } from './src/util.js?mxj=0.1.0';

const WAND_ID = 'mxj_wand_entry';
const DRAWER_ID = 'mxj_settings_drawer';
const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>';

let uiModule = null;
let clickHandler = null;
let chatHandler = null;

async function loadUi() {
    if (!uiModule) uiModule = await import('./src/ui.js?mxj=0.1.0');
    return uiModule;
}

async function openPanel(label) {
    const original = label?.textContent;
    try {
        if (label) label.textContent = '正在打开梦想家…';
        const ui = await loadUi();
        ui.open();
    } catch (error) {
        console.error(LOG_PREFIX, '打开失败', error);
        if (label) label.textContent = '打开失败，点击重试';
        return;
    }
    if (label) label.textContent = original || '梦想家';
}

function installWandEntry() {
    if (document.getElementById(WAND_ID)) return;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const entry = document.createElement('div');
    entry.id = WAND_ID;
    entry.setAttribute('role', 'button');
    entry.tabIndex = 0;
    entry.className = 'list-group-item flex-container flexGap5';
    entry.style.cssText = 'background:transparent;color:inherit;border:0;box-shadow:none;appearance:none;-webkit-appearance:none;';
    entry.setAttribute('aria-haspopup', 'dialog');
    entry.innerHTML = `<span class="extensionsMenuExtensionButton mxj-wand-icon">${ICON}</span><span>梦想家</span>`;
    entry.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (!event.repeat) entry.click();
    });
    entry.addEventListener('click', () => {
        // 收起魔法棒菜单，再打开面板
        const menuEl = document.getElementById('extensionsMenu');
        if (menuEl && getComputedStyle(menuEl).display !== 'none') {
            try {
                globalThis.jQuery?.(menuEl).fadeOut?.(100);
            } catch { /* 忽略 */ }
        }
        void openPanel(entry.querySelector('span:last-child'));
    });
    menu.append(entry);
}

function installSettingsDrawer() {
    if (document.getElementById(DRAWER_ID)) return;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.id = DRAWER_ID;
    wrap.className = 'mxj-drawer';
    wrap.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>梦想家</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <p class="mxj-drawer-text">和角色一起住的小家。平时从魔法棒进入，也可以在这里打开。</p>
          <button type="button" class="menu_button mxj-drawer-open">打开梦想家</button>
        </div>
      </div>`;
    wrap.querySelector('.mxj-drawer-open').addEventListener('click', event => {
        void openPanel(event.currentTarget);
    });
    host.append(wrap);
}

function init() {
    getSettings();
    installWandEntry();
    installSettingsDrawer();
    // 魔法棒菜单可能稍后才出现：点魔法棒时补装
    clickHandler = event => {
        if (event.target?.closest?.('#extensionsMenuButton')) installWandEntry();
    };
    document.addEventListener('click', clickHandler, true);
    const c = ctx();
    const types = c.eventTypes || c.event_types;
    if (c.eventSource && types?.CHAT_CHANGED) {
        chatHandler = () => {
            installWandEntry();
            uiModule?.onChatChanged?.();
        };
        c.eventSource.on(types.CHAT_CHANGED, chatHandler);
    }
}

export function onDisable() {
    document.getElementById(WAND_ID)?.remove();
    document.getElementById(DRAWER_ID)?.remove();
    if (clickHandler) document.removeEventListener('click', clickHandler, true);
    const c = ctx();
    const types = c.eventTypes || c.event_types;
    if (chatHandler && c.eventSource && types?.CHAT_CHANGED) {
        (c.eventSource.removeListener || c.eventSource.off)?.call(c.eventSource, types.CHAT_CHANGED, chatHandler);
    }
    uiModule?.destroy?.();
}

jQuery(() => {
    try {
        init();
    } catch (error) {
        console.error(LOG_PREFIX, '初始化失败', error);
    }
});
