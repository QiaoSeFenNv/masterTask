import {requireGame} from './game.bundle.js';
import {createPreviewAPI} from './preview-api.js';
import {installWechatBridge} from './wx-bridge.js';

const canvas = document.querySelector('#game');
const surface = document.querySelector('#screen');
const status = document.querySelector('#status');
const dialog = document.querySelector('#note-dialog');
const note = document.querySelector('#note-input');
const form = document.querySelector('#note-form');
let modalRequest = null;
function closeModal(confirm) {
  const request = modalRequest;
  modalRequest = null;
  dialog.close();
  if (request && typeof request.success === 'function') request.success({confirm, cancel: !confirm, content: note.value});
}
function openModal(options) {
  modalRequest = options;
  document.querySelector('#note-title').textContent = options.title || '记录想法';
  note.value = options.content || '';
  note.placeholder = options.placeholderText || '';
  dialog.showModal();
  requestAnimationFrame(() => note.focus());
}
form.addEventListener('submit', event => { event.preventDefault(); closeModal(true); });
document.querySelector('#note-cancel').addEventListener('click', () => closeModal(false));
dialog.addEventListener('cancel', event => { event.preventDefault(); closeModal(false); });

const api = createPreviewAPI(requireGame('data/roles.js').roles);
installWechatBridge({canvas, surface, api, modal: openModal});
const app = requireGame('js/app.js');
const env = requireGame('js/env.js');
const game = app.start();
// Also exposes the production modules for repeatable browser integration checks.
globalThis.rolesPreview = {game, requireGame};
function updateHint() {
  const state = game.store.state;
  const hints = {pack: '选一个卡包，开启今天的角色', opening: '卡包就位，准备撕开',
    tear: '在卡包上任意位置、任意方向划动撕开', tearFinish: '卡包已打开，卡牌正在出现', ring: '左右拖动转盘，点开三张卡',
    top: '三张候选正在就位', pick: '选中一张角色，再确认落定', reveal: '揭晓后可点击继续'};
  status.textContent = state.status !== 'ready' ? '正在准备今天的卡包…' :
    (hints[state.anim.kind] || (state.tab === 'today' ? '拖动旋转卡牌，轻点翻面查看角色描述' : '看看过去的角色，或浏览你的图鉴'));
  canvas.setAttribute('aria-label', state.draw && state.tab === 'today'
    ? '今日角色卡牌：'+state.draw.role.name+'。'+state.draw.role.intro+'。拖动旋转，点击或按空格翻面。'
    : '每日角色互动卡包，按屏幕提示选择和拖动');
}
canvas.addEventListener('keydown',event=>{
  const state=game.store.state;
  const history=requireGame('js/calendar-card.js');
  if(event.key==='Escape' && state.tab==='calendar' && history.active()) {
    event.preventDefault();
    const close=history.render(env.viewport()).find(zone=>zone.id==='calendar-card-close').rect;
    game.dispatch(close.x+close.w/2,close.y+close.h/2);
  } else if(event.key==='Enter' || event.key===' ') {
    if(state.tab==='today' && state.draw && !game.store.stage()) {
      event.preventDefault();const r=requireGame('js/today-card.js').rect(env.viewport());
      game.dispatch(r.x+r.w/2,r.y+r.h/2);
    } else if(state.tab==='calendar' && history.interactive()) {
      event.preventDefault();const r=history.rect(env.viewport());
      game.dispatch(r.x+r.w/2,r.y+r.h/2);
    }
  }
});
game.store.subscribe(updateHint);
updateHint();
let resizeTicket = null;
new ResizeObserver(() => {
  if (resizeTicket !== null) cancelAnimationFrame(resizeTicket);
  resizeTicket = requestAnimationFrame(() => {
    resizeTicket = null;
    env.refreshMetrics();
    game.resize();
  });
}).observe(surface);

document.querySelector('#restart').addEventListener('click', () => { api.reset(); location.reload(); });
document.querySelector('#copy-link').addEventListener('click', async event => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = '已复制';
    setTimeout(() => { button.textContent = '复制链接'; }, 1600);
  } catch (_) {
    window.prompt('复制这个地址，邀请朋友体验', location.href);
  }
});
