'use strict';

const wv = document.getElementById('cal');
const loading = document.getElementById('loading');

let opacity = 1;
let pinned = true;

// 저장된 상태 복원
window.cal.getState().then((s) => {
  opacity = s.opacity || 1;
  pinned = s.pinned !== false;
  updatePinButton();
});

function clampOpacity(v) {
  return Math.max(0.3, Math.min(1, Math.round(v * 100) / 100));
}

document.getElementById('btn-opacity-down').addEventListener('click', () => {
  opacity = clampOpacity(opacity - 0.1);
  window.cal.setOpacity(opacity);
});

document.getElementById('btn-opacity-up').addEventListener('click', () => {
  opacity = clampOpacity(opacity + 0.1);
  window.cal.setOpacity(opacity);
});

document.getElementById('btn-reload').addEventListener('click', () => {
  try { wv.reload(); } catch {}
});

const btnPin = document.getElementById('btn-pin');
function updatePinButton() {
  btnPin.classList.toggle('active', pinned);
  btnPin.title = pinned ? '항상 위 고정됨 (클릭 해제)' : '고정 해제됨 (클릭 고정)';
}
btnPin.addEventListener('click', () => {
  pinned = !pinned;
  window.cal.setPin(pinned);
  updatePinButton();
});

document.getElementById('btn-hide').addEventListener('click', () => window.cal.hide());
document.getElementById('btn-close').addEventListener('click', () => window.cal.quit());

// 트레이 메뉴의 새로고침
window.cal.onReload(() => {
  try { wv.reload(); } catch {}
});

// webview 로딩 표시
wv.addEventListener('did-start-loading', () => loading.classList.remove('hidden'));
wv.addEventListener('did-stop-loading', () => loading.classList.add('hidden'));
wv.addEventListener('dom-ready', () => loading.classList.add('hidden'));
