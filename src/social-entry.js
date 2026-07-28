import QRCode from 'qrcode';
import './social.css';

const SOCIAL_ROOT_ID = 'jiahao-social-root';
const ROOM_PATH_RE = /^\/r\/([A-Z2-9]{6,10})\/?$/i;
const DIMENSIONS = [
  ['mystery', '神秘感'],
  ['flex', '无意炫耀'],
  ['niche', '小众优越'],
  ['deep', '深情浓度'],
  ['show', '镜头掌控'],
  ['language', '豪言匹配'],
];

const state = {
  session: null,
  room: null,
  open: false,
  loading: false,
  error: '',
  battle: null,
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function latestResult() {
  try {
    const history = JSON.parse(localStorage.getItem('jiahao-history') || '[]');
    return history.find((item) => item && item.kind !== 'pk' && Number.isFinite(Number(item.score))) || null;
  } catch {
    return null;
  }
}

function resultPayload(result) {
  if (!result) return {};
  return {
    resultToken: result.resultToken || null,
    result: {
      id: result.id,
      score: result.score,
      level: result.level,
      type: result.type,
      dimensions: result.dimensions,
      source: result.source,
    },
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '好友榜服务暂时不可用');
  return payload;
}

function roomUrl(code) {
  return `${window.location.origin}/r/${encodeURIComponent(code)}`;
}

function routeCode() {
  return window.location.pathname.match(ROOM_PATH_RE)?.[1]?.toUpperCase() || '';
}

function navigate(path) {
  window.history.pushState({}, '', path);
  void syncRoute();
}

function openSocial(code = '') {
  state.open = true;
  if (code) navigate(`/r/${code}`);
  else if (routeCode()) void loadRoom(routeCode());
  else void loadSession();
  render();
}

function closeSocial() {
  state.open = false;
  state.battle = null;
  if (routeCode()) window.history.pushState({}, '', '/');
  render();
}

async function loadSession() {
  state.loading = true;
  state.error = '';
  render();
  try { state.session = await api('/api/social/session'); }
  catch (error) { state.error = error.message; }
  state.loading = false;
  render();
}

async function loadRoom(code) {
  state.open = true;
  state.loading = true;
  state.error = '';
  state.battle = null;
  render();
  try { state.room = await api(`/api/social/rooms/${encodeURIComponent(code)}`); }
  catch (error) { state.room = null; state.error = error.message; }
  state.loading = false;
  render();
}

async function syncRoute() {
  const code = routeCode();
  if (code) await loadRoom(code);
  else if (state.open) await loadSession();
}

function rankLabel(member) {
  if (member.rank === 1) return '豪气榜首';
  if (member.rank === 2) return '第二豪位';
  if (member.rank === 3) return '第三豪位';
  return `第 ${member.rank} 名`;
}

function resultCard(result) {
  if (!result) {
    return `<div class="social-empty-result">
      <strong>还没有可公开的单人鉴定</strong>
      <p>先完成一次单人鉴定，再创建或加入好友榜。双人 PK 结果不会作为个人排名成绩。</p>
      <button type="button" data-action="go-assay">去做单人鉴定</button>
    </div>`;
  }
  return `<div class="social-result-chip">
    <span>${result.resultToken ? '云端可信成绩' : '基础算法成绩'}</span>
    <strong>${escapeHtml(result.score)}</strong>
    <div><b>${escapeHtml(result.level)}</b><small>${escapeHtml(result.type)}</small></div>
  </div>`;
}

function homeView() {
  const result = latestResult();
  const rooms = state.session?.rooms || [];
  return `<div class="social-panel social-home">
    <div class="social-topbar">
      <div><span class="social-kicker">WEB SOCIAL LAB</span><h2>好友豪气榜</h2><p>创建一个私密房间，把链接发到宿舍群或好友群。成员完成鉴定后自动排名。</p></div>
      <button type="button" class="social-icon-button" data-action="close" aria-label="关闭好友榜">×</button>
    </div>
    ${state.error ? `<p class="social-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    <div class="social-home-grid">
      <section class="social-card">
        <div class="social-section-title"><span>01</span><div><h3>创建排行榜</h3><p>默认有效 7 天，不需要好友注册。</p></div></div>
        ${resultCard(result)}
        <label>你的公开昵称<input id="social-nickname" maxlength="24" value="${escapeHtml(state.session?.nickname || '')}" placeholder="例如：404 宿舍长" /></label>
        <label>榜单名称<input id="social-room-name" maxlength="40" value="404 宿舍豪气榜" /></label>
        <div class="social-inline-fields">
          <label>房间类型<select id="social-room-type"><option value="friends">好友豪气榜</option><option value="dorm">宿舍豪气榜</option><option value="pk">多人挑战房</option></select></label>
          <label>人数上限<select id="social-member-limit"><option>6</option><option>8</option><option selected>20</option><option>30</option></select></label>
        </div>
        <button type="button" class="social-primary" data-action="create-room" ${result ? '' : 'disabled'}>创建并成为榜主</button>
      </section>
      <section class="social-card">
        <div class="social-section-title"><span>02</span><div><h3>加入好友榜</h3><p>粘贴好友发来的房间码，或直接打开邀请链接。</p></div></div>
        <label>房间码<input id="social-room-code" maxlength="10" autocomplete="off" placeholder="例如：JH8F32A" /></label>
        <button type="button" class="social-secondary" data-action="join-code">打开排行榜</button>
        <div class="social-room-history">
          <div class="social-list-heading"><strong>我的好友榜</strong><span>${rooms.length} 个</span></div>
          ${rooms.length ? rooms.map((room) => `<button type="button" class="social-room-link" data-room-code="${escapeHtml(room.code)}">
            <div><strong>${escapeHtml(room.name)}</strong><small>${room.is_owner ? '我创建的' : '已加入'} · ${escapeHtml(room.member_count)} 人</small></div>
            <span>${escapeHtml(room.score)}<small>${escapeHtml(room.level)}</small></span>
          </button>`).join('') : '<p class="social-muted">暂无记录。创建或加入后会显示在这里。</p>'}
        </div>
      </section>
    </div>
    <div class="social-privacy-note">好友仅能看到昵称、分数、等级、物种和六维公开数据；原始照片、聊天记录与完整私密判词不会进入房间。</div>
  </div>`;
}

function leaderboardRows(members, canPk) {
  return members.map((member) => `<article class="social-rank-row ${member.isSelf ? 'is-self' : ''} ${member.rank <= 3 ? `is-top is-top-${member.rank}` : ''}">
    <div class="social-rank-number">${String(member.rank).padStart(2, '0')}</div>
    <div class="social-member-main">
      <div class="social-member-title"><strong>${escapeHtml(member.nickname)}</strong>${member.isSelf ? '<em>我</em>' : ''}${member.verified ? '<i>云端可信</i>' : '<i class="is-basic">基础成绩</i>'}</div>
      <span>${escapeHtml(member.type)} · ${escapeHtml(member.level)}</span>
      <div class="social-mini-bars">${DIMENSIONS.slice(0, 3).map(([key, label]) => `<div><small>${label}</small><span><i style="width:${Number(member.dimensions?.[key] || 0)}%"></i></span></div>`).join('')}</div>
    </div>
    <div class="social-score"><strong>${member.score}</strong><span>${rankLabel(member)}</span></div>
    ${canPk && !member.isSelf ? `<button type="button" class="social-pk-button" data-pk-member="${escapeHtml(member.memberId)}">快速 PK</button>` : ''}
  </article>`).join('');
}

function roomView() {
  if (!state.room) return `<div class="social-panel social-state"><button type="button" class="social-icon-button" data-action="close">×</button><h2>好友榜未找到</h2><p>${escapeHtml(state.error || '邀请链接可能已失效。')}</p><button type="button" class="social-primary" data-action="social-home">返回好友榜首页</button></div>`;
  const { room, members, isMember } = state.room;
  const result = latestResult();
  const self = members.find((member) => member.isSelf);
  const expired = room.isExpired || room.status !== 'active';
  return `<div class="social-panel social-room">
    <div class="social-topbar">
      <div><span class="social-kicker">ROOM / ${escapeHtml(room.code)}</span><h2>${escapeHtml(room.name)}</h2><p>${expired ? '本期好友榜已经结束，当前成绩只读展示。' : '云端可信成绩优先排名；同类成绩按嘉豪指数从高到低排序。'}</p></div>
      <button type="button" class="social-icon-button" data-action="close" aria-label="关闭好友榜">×</button>
    </div>
    ${state.error ? `<p class="social-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    <div class="social-room-metrics">
      <div><span>成员</span><strong>${room.memberCount}<small> / ${room.memberLimit}</small></strong></div>
      <div><span>平均豪气</span><strong>${room.averageScore}</strong></div>
      <div><span>最高纪录</span><strong>${room.highestScore}</strong></div>
      <div><span>我的名次</span><strong>${self ? self.rank : '--'}</strong></div>
    </div>
    <div class="social-room-actions">
      <button type="button" class="social-primary" data-action="share-room">邀请好友加入</button>
      ${isMember && !expired ? '<button type="button" class="social-secondary" data-action="update-score">使用最新成绩</button>' : ''}
      ${room.isOwner && !expired ? '<button type="button" class="social-danger" data-action="close-room">结束本期榜单</button>' : ''}
      ${isMember && !room.isOwner && !expired ? '<button type="button" class="social-quiet" data-action="leave-room">退出榜单</button>' : ''}
    </div>
    ${!isMember && !expired ? `<section class="social-join-card">
      <div><h3>加入后查看你的排名</h3><p>好友只看到公开成绩，不会看到原始素材。</p></div>
      ${resultCard(result)}
      <label>公开昵称<input id="social-join-nickname" maxlength="24" value="${escapeHtml(state.session?.nickname || '')}" placeholder="给自己起个榜内昵称" /></label>
      <button type="button" class="social-primary" data-action="join-room" ${result ? '' : 'disabled'}>使用当前成绩加入</button>
    </section>` : ''}
    <div class="social-leaderboard">
      <div class="social-list-heading"><strong>豪气排名</strong><span>${members.length ? `榜首 ${escapeHtml(members[0].nickname)}` : '等待首位成员'}</span></div>
      ${members.length ? leaderboardRows(members, isMember && room.allowPk && !expired) : '<p class="social-muted">还没有成员加入。</p>'}
    </div>
    <button type="button" class="social-back-link" data-action="social-home">查看我的其他好友榜</button>
  </div>`;
}

function loadingView() {
  return `<div class="social-panel social-state"><div class="social-loader"></div><h2>正在同步豪气排名</h2><p>好友榜数据从服务端实时读取。</p></div>`;
}

function battleView() {
  if (!state.battle) return '';
  const [a, b] = state.battle.participants;
  return `<div class="social-battle-backdrop"><section class="social-battle" role="dialog" aria-modal="true" aria-label="快速 PK 结果">
    <button type="button" class="social-icon-button" data-action="close-battle">×</button>
    <span class="social-kicker">PUBLIC SCORE BATTLE</span><h2>${escapeHtml(state.battle.battle.title)}</h2>
    <div class="social-versus">
      <div><span>选手 A</span><strong>${escapeHtml(a.score)}</strong><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.type)}</small></div>
      <em>VS</em>
      <div><span>选手 B</span><strong>${escapeHtml(b.score)}</strong><b>${escapeHtml(b.name)}</b><small>${escapeHtml(b.type)}</small></div>
    </div>
    <p>${escapeHtml(state.battle.battle.reason)}</p>
    <div class="social-battle-tags">${state.battle.battle.decisiveDimensions.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    <small>本结果复用双方已公开鉴定成绩，不重新上传或分析原始素材。</small>
  </section></div>`;
}

function render() {
  let root = document.getElementById(SOCIAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = SOCIAL_ROOT_ID;
    document.body.appendChild(root);
  }
  root.className = state.open ? 'is-open' : '';
  root.innerHTML = state.open ? `<div class="social-overlay">${state.loading ? loadingView() : routeCode() ? roomView() : homeView()}</div>${battleView()}` : '';
  bindActions(root);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  }
}

async function showShare(code) {
  const url = roomUrl(code);
  const qr = await QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#eaf2ff', light: '#070b12' } });
  const popup = document.createElement('div');
  popup.className = 'social-share-backdrop';
  popup.innerHTML = `<section class="social-share-card" role="dialog" aria-modal="true" aria-label="邀请好友">
    <button type="button" class="social-icon-button" data-share-close>×</button>
    <span class="social-kicker">INVITE / ${escapeHtml(code)}</span><h2>邀请好友来挑战</h2>
    <img src="${qr}" alt="好友榜邀请二维码" />
    <p>${escapeHtml(url)}</p>
    <button type="button" class="social-primary" data-share-copy>复制邀请链接</button>
    <small>微信内可长按二维码或使用右上角分享。房间默认 7 天有效。</small>
  </section>`;
  document.body.appendChild(popup);
  popup.querySelector('[data-share-close]').addEventListener('click', () => popup.remove());
  popup.addEventListener('click', (event) => { if (event.target === popup) popup.remove(); });
  popup.querySelector('[data-share-copy]').addEventListener('click', async (event) => {
    const ok = await copyText(url);
    event.currentTarget.textContent = ok ? '已复制，发到好友群吧' : '复制失败，请长按上方链接';
  });
}

function goAssay() {
  closeSocial();
  const button = [...document.querySelectorAll('header button')].find((item) => item.textContent.trim() === '鉴定');
  button?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindActions(root) {
  root.querySelectorAll('[data-room-code]').forEach((button) => button.addEventListener('click', () => navigate(`/r/${button.dataset.roomCode}`)));
  root.querySelector('[data-action="close"]')?.addEventListener('click', closeSocial);
  root.querySelector('[data-action="go-assay"]')?.addEventListener('click', goAssay);
  root.querySelector('[data-action="social-home"]')?.addEventListener('click', () => navigate('/'));
  root.querySelector('[data-action="join-code"]')?.addEventListener('click', () => {
    const code = root.querySelector('#social-room-code')?.value.trim().toUpperCase();
    if (code) navigate(`/r/${code}`);
  });
  root.querySelector('[data-action="create-room"]')?.addEventListener('click', async (event) => {
    const result = latestResult();
    if (!result) return goAssay();
    event.currentTarget.disabled = true;
    state.error = '';
    try {
      const payload = await api('/api/social/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: root.querySelector('#social-room-name').value,
          nickname: root.querySelector('#social-nickname').value,
          roomType: root.querySelector('#social-room-type').value,
          memberLimit: Number(root.querySelector('#social-member-limit').value),
          ...resultPayload(result),
        }),
      });
      navigate(`/r/${payload.code}`);
    } catch (error) { state.error = error.message; event.currentTarget.disabled = false; render(); }
  });
  root.querySelector('[data-action="join-room"]')?.addEventListener('click', async (event) => {
    const result = latestResult();
    if (!result) return goAssay();
    event.currentTarget.disabled = true;
    try {
      await api(`/api/social/rooms/${state.room.room.code}/join`, {
        method: 'POST',
        body: JSON.stringify({ nickname: root.querySelector('#social-join-nickname').value, ...resultPayload(result) }),
      });
      await loadRoom(state.room.room.code);
    } catch (error) { state.error = error.message; event.currentTarget.disabled = false; render(); }
  });
  root.querySelector('[data-action="update-score"]')?.addEventListener('click', async (event) => {
    const result = latestResult();
    if (!result) return goAssay();
    event.currentTarget.disabled = true;
    try {
      await api(`/api/social/rooms/${state.room.room.code}/score`, { method: 'POST', body: JSON.stringify(resultPayload(result)) });
      await loadRoom(state.room.room.code);
    } catch (error) { state.error = error.message; event.currentTarget.disabled = false; render(); }
  });
  root.querySelector('[data-action="share-room"]')?.addEventListener('click', () => void showShare(state.room.room.code));
  root.querySelector('[data-action="leave-room"]')?.addEventListener('click', async () => {
    if (!window.confirm('确定退出这个好友榜？你的公开排名会被移除。')) return;
    try { await api(`/api/social/rooms/${state.room.room.code}/leave`, { method: 'POST' }); await loadSession(); navigate('/'); }
    catch (error) { state.error = error.message; render(); }
  });
  root.querySelector('[data-action="close-room"]')?.addEventListener('click', async () => {
    if (!window.confirm('结束后将停止加入和 PK，并保留只读排名。确定继续？')) return;
    try { await api(`/api/social/rooms/${state.room.room.code}/close`, { method: 'POST' }); await loadRoom(state.room.room.code); }
    catch (error) { state.error = error.message; render(); }
  });
  root.querySelectorAll('[data-pk-member]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      state.battle = await api(`/api/social/rooms/${state.room.room.code}/pk`, {
        method: 'POST', body: JSON.stringify({ opponentMemberId: button.dataset.pkMember }),
      });
      render();
    } catch (error) { state.error = error.message; button.disabled = false; render(); }
  }));
  root.querySelector('[data-action="close-battle"]')?.addEventListener('click', () => { state.battle = null; render(); });
}

function installNavigation() {
  const header = document.querySelector('.site-header');
  const nav = header?.querySelector('nav');
  if (!nav || nav.querySelector('[data-social-nav]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.socialNav = 'true';
  button.textContent = '好友榜';
  button.addEventListener('click', () => openSocial());
  nav.appendChild(button);
}

function installResultAction() {
  const resultPage = document.querySelector('.result-page');
  if (!resultPage || resultPage.querySelector('[data-social-result-action]')) return;
  const actions = resultPage.querySelector('.result-actions') || resultPage;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-action social-result-action';
  button.dataset.socialResultAction = 'true';
  button.textContent = '创建好友豪气榜';
  button.addEventListener('click', () => openSocial());
  actions.appendChild(button);
}

const observer = new MutationObserver(() => {
  installNavigation();
  installResultAction();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
installNavigation();
installResultAction();
window.addEventListener('popstate', () => void syncRoute());

void (async () => {
  try { state.session = await api('/api/social/session'); }
  catch (error) { state.error = error.message; }
  if (routeCode()) {
    state.open = true;
    await loadRoom(routeCode());
  }
  render();
})();
