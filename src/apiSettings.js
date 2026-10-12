// 梦想家 · 扩展设置抽屉里的 API 设置（和面板里的设置读写同一份数据）
import { esc } from './util.js?mxj=0.3.1';
import { getSettings, updateSettings } from './settings.js?mxj=0.3.1';
import { listConnectionProfiles, fetchManualModels, testConnection } from './api.js?mxj=0.3.1';

export function mountApiSettings(container) {
    if (!container) return;
    let models = [];
    let status = '';
    let busy = false;

    function html() {
        const s = getSettings();
        const independent = s.generationSource === 'independent';
        const usingProfile = !!s.independentConnectionProfileId;
        const profiles = listConnectionProfiles();
        const profileOptions = ['<option value="">不用连接配置（手动填写接口）</option>']
            .concat(profiles.map(p => `<option value="${esc(p.id)}" ${p.id === s.independentConnectionProfileId ? 'selected' : ''}>${esc(p.name)}</option>`))
            .join('');
        return `
          <b>生成用哪个 API</b>
          <label class="mxj-api-radio"><input type="radio" name="mxj_drawer_source" data-k="generationSource" value="follow" ${independent ? '' : 'checked'}> 跟随当前 API</label>
          <label class="mxj-api-radio"><input type="radio" name="mxj_drawer_source" data-k="generationSource" value="independent" ${independent ? 'checked' : ''}> 使用副 API</label>
          <hr>
          <b>副 API 设置${independent ? '' : '（选「使用副 API」后生效）'}</b>
          <label>酒馆连接配置（可选）
            <div class="mxj-api-row">
              <select class="text_pole" data-k="independentConnectionProfileId">${profileOptions}</select>
              <button type="button" class="menu_button" data-a="refresh">刷新</button>
            </div>
          </label>
          ${usingProfile ? '' : `
          <label>API 地址
            <input type="text" class="text_pole" data-k="independentApiBaseUrl" value="${esc(s.independentApiBaseUrl)}" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="API 地址">
          </label>
          <label>API Key
            <input type="password" class="text_pole" data-k="independentApiKey" value="${esc(s.independentApiKey)}" autocomplete="off" placeholder="API Key">
          </label>
          <div class="mxj-api-row"><button type="button" class="menu_button" data-a="models" ${busy ? 'disabled' : ''}>拉取模型列表</button></div>`}
          <label>模型 ID${usingProfile ? '（空着就用连接配置里的模型）' : ''}
            ${models.length ? `<select class="text_pole" data-k="modelSelect"><option value="">从列表里选一个</option>${models.map(m => `<option value="${esc(m)}" ${m === s.independentApiModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : ''}
            <input type="text" class="text_pole" data-k="independentApiModel" value="${esc(s.independentApiModel)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="模型 ID">
          </label>
          <div class="mxj-api-row">
            <label>温度 <input type="number" class="text_pole" data-k="independentApiTemperature" value="${esc(s.independentApiTemperature)}" min="0" max="2" step="0.05" inputmode="decimal"></label>
            <label>最大输出 <input type="number" class="text_pole" data-k="independentApiMaxTokens" value="${esc(s.independentApiMaxTokens)}" min="256" max="64000" step="256" inputmode="numeric"></label>
          </div>
          <div class="mxj-api-row"><button type="button" class="menu_button" data-a="test" ${busy ? 'disabled' : ''}>测试连接</button></div>
          <div class="mxj-api-status" role="status">${esc(status)}</div>`;
    }

    function render() {
        container.innerHTML = html();
    }

    container.addEventListener('change', event => {
        const el = event.target;
        const k = el?.dataset?.k;
        if (!k) return;
        if (k === 'modelSelect') {
            if (el.value) updateSettings({ independentApiModel: el.value });
            render();
            return;
        }
        const numeric = ['independentApiTemperature', 'independentApiMaxTokens'];
        if (k === 'independentApiBaseUrl') models = [];
        updateSettings({ [k]: numeric.includes(k) ? Number(el.value) : el.value });
        if (['generationSource', 'independentConnectionProfileId'].includes(k)) render();
    });

    container.addEventListener('click', async event => {
        const btn = event.target?.closest?.('[data-a]');
        if (!btn || busy) return;
        const action = btn.dataset.a;
        if (action === 'refresh') {
            status = '已刷新连接配置';
            render();
            return;
        }
        busy = true;
        status = action === 'models' ? '正在拉取模型…' : '正在测试连接…';
        render();
        try {
            if (action === 'models') {
                const s = getSettings();
                models = await fetchManualModels(s.independentApiBaseUrl, s.independentApiKey);
                status = `拿到 ${models.length} 个模型`;
            } else if (action === 'test') {
                const reply = await testConnection();
                status = `连接正常：${reply}`;
            }
        } catch (error) {
            status = error?.message || String(error);
        } finally {
            busy = false;
            render();
        }
    });

    render();
}
