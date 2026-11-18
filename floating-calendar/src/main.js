'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  session,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------
const PARTITION = 'persist:gcal'; // 로그인 세션을 디스크에 유지 (재실행해도 로그인 유지)
const CAL_URL = 'https://calendar.google.com/calendar/r';
const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+C';

// Google 이 임베디드 브라우저를 막지 않도록 일반 Chrome User-Agent 로 위장
function chromeUserAgent() {
  const chromeVersion = '131.0.0.0';
  if (process.platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }
  if (process.platform === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

// ---------------------------------------------------------------------------
// 창 위치/크기 저장
// ---------------------------------------------------------------------------
const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { width: 380, height: 640, opacity: 1, pinned: true };
  }
}

function saveState(partial) {
  const current = loadState();
  const next = { ...current, ...partial };
  try {
    fs.writeFileSync(stateFile, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

let win = null;
let tray = null;

// ---------------------------------------------------------------------------
// 메인 창
// ---------------------------------------------------------------------------
function createWindow() {
  const state = loadState();

  win = new BrowserWindow({
    width: state.width || 380,
    height: state.height || 640,
    x: state.x,
    y: state.y,
    minWidth: 280,
    minHeight: 360,
    frame: false,
    alwaysOnTop: state.pinned !== false,
    skipTaskbar: false,
    resizable: true,
    backgroundColor: '#1f1f1f',
    title: 'Floating Calendar',
    icon: iconImage(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      partition: PARTITION,
    },
  });

  // 다른 전체화면 앱 위에서도 떠있도록
  if (state.pinned !== false) {
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  win.setOpacity(state.opacity || 1);

  win.loadFile(path.join(__dirname, 'index.html'));

  // 창 상태 저장
  const persistBounds = () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    saveState({ width: b.width, height: b.height, x: b.x, y: b.y });
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  // 닫기 버튼 → 트레이로 숨김 (완전 종료는 트레이 메뉴 또는 Quit)
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

// ---------------------------------------------------------------------------
// 트레이 아이콘
// ---------------------------------------------------------------------------
function iconImage() {
  const p = path.join(__dirname, '..', 'assets', 'icon.png');
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createEmpty();
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function buildTray() {
  tray = new Tray(iconImage());
  tray.setToolTip('Floating Calendar');

  const menu = Menu.buildFromTemplate([
    { label: '보이기 / 숨기기', click: toggleWindow },
    { label: '새로고침', click: () => win && win.webContents.send('cmd:reload') },
    { type: 'separator' },
    {
      label: '투명도',
      submenu: [100, 90, 80, 70, 60, 50].map((v) => ({
        label: `${v}%`,
        click: () => {
          if (!win) return;
          win.setOpacity(v / 100);
          saveState({ opacity: v / 100 });
        },
      })),
    },
    {
      label: '항상 위에 고정',
      type: 'checkbox',
      checked: loadState().pinned !== false,
      click: (item) => {
        if (!win) return;
        win.setAlwaysOnTop(item.checked, 'floating');
        win.setVisibleOnAllWorkspaces(item.checked, { visibleOnFullScreen: true });
        saveState({ pinned: item.checked });
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
  tray.on('double-click', toggleWindow);
}

// ---------------------------------------------------------------------------
// IPC (렌더러 → 메인)
// ---------------------------------------------------------------------------
ipcMain.on('win:hide', () => win && win.hide());
ipcMain.on('win:quit', () => {
  app.isQuitting = true;
  app.quit();
});
ipcMain.on('win:opacity', (_e, value) => {
  if (!win) return;
  const v = Math.max(0.3, Math.min(1, Number(value) || 1));
  win.setOpacity(v);
  saveState({ opacity: v });
});
ipcMain.on('win:pin', (_e, pinned) => {
  if (!win) return;
  win.setAlwaysOnTop(!!pinned, 'floating');
  win.setVisibleOnAllWorkspaces(!!pinned, { visibleOnFullScreen: true });
  saveState({ pinned: !!pinned });
});
ipcMain.handle('win:getState', () => loadState());

// ---------------------------------------------------------------------------
// 앱 수명주기
// ---------------------------------------------------------------------------
// 단일 인스턴스만 허용
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // webview 세션에 Chrome UA 적용 (Google 임베디드 차단 회피)
    const ses = session.fromPartition(PARTITION);
    const ua = chromeUserAgent();
    ses.setUserAgent(ua);
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      details.requestHeaders['User-Agent'] = ua;
      cb({ requestHeaders: details.requestHeaders });
    });

    createWindow();
    buildTray();

    globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else if (win) win.show();
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  // 외부 링크는 기본 브라우저로
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url) && !url.includes('google.com')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
  });

  // 모든 창을 닫아도 트레이로 유지 (명시적 종료 전까지)
  app.on('window-all-closed', (e) => {
    // 아무것도 하지 않음 → 트레이에 남음
  });
}
