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
    tear: '按住包口，从左向右拖动撕开', ring: '左右拖动转盘，点开三张卡',
    top: '三张候选正在就位', pick: '选中一张角色，再确认落定', reveal: '揭晓后可点击继续'};
  status.textContent = state.status !== 'ready' ? '正在准备今天的卡包…' :
    state.tab === 'collection' ? '向上滑动浏览图鉴，点开已解锁角色查看详情' :
    state.tab === 'calendar' ? '查看历史角色，切换月份回顾每天的任务' :
    state.draw && state.scratch && !state.scratch.complete ? '按住今日卡背来回刮动，揭开介绍和任务；卡外可滑动' :
    (hints[state.anim.kind] || '完成角色任务，也可以看看日历和图鉴');
}
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
