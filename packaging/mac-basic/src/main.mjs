import {app,BrowserWindow,Menu,dialog,session} from 'electron';
import {mkdirSync,lstatSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isLocalUrl,startLocalServer,stopLocalServer} from './lifecycle.mjs';

const profile = join(tmpdir(),`kelbi-basic-local-${process.getuid()}`);
mkdirSync(profile,{recursive:true,mode:0o700});
const profileStat = lstatSync(profile);
if (!profileStat.isDirectory() || profileStat.isSymbolicLink() || profileStat.uid !== process.getuid() || profileStat.mode & 0o077) throw Error('UNSAFE_LOCAL_PROFILE');
app.setPath('userData',profile);
app.setPath('sessionData',join(profile,'session'));
app.setPath('logs',join(profile,'logs'));
app.setPath('crashDumps',join(profile,'crash-dumps'));
app.setName('켈비');
const stateFile = join(profile,'runtime-state.json');
let ownedServer,window,closing=false,started=false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',() => {if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.on('window-all-closed',() => app.quit());
  app.on('before-quit',event => {
    if (closing || !started) return;
    event.preventDefault();closing=true;
    stopLocalServer(ownedServer).finally(() => {try{rmSync(stateFile,{force:true});}catch{}app.quit();});
  });
  // Register the ready callback, then let Electron finish importing this entry.
  // Awaiting ready at module top level prevents Electron from emitting ready.
  app.whenReady().then(async () => {
  try {
    const assetsRoot = app.isPackaged ? join(process.resourcesPath,'kelbi-app') : resolve(dirname(fileURLToPath(import.meta.url)),'../staging/kelbi-app');
    const {createOnServer} = await import(pathToFileURL(join(assetsRoot,'src/server.mjs')).href);
    const {server,origin} = await startLocalServer(createOnServer,assetsRoot);
    ownedServer=server;started=true;
    const isolatedSession = session.fromPartition('kelbi-local');
    isolatedSession.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
    isolatedSession.setPermissionCheckHandler(() => false);
    isolatedSession.on('will-download',(event,item) => {event.preventDefault();item.cancel();});
    isolatedSession.webRequest.onBeforeRequest((details,callback) => callback({cancel:!isLocalUrl(details.url,origin) && !details.url.startsWith('data:image/')}));
    window = new BrowserWindow({title:'켈비',width:1280,height:900,minWidth:640,minHeight:500,show:false,backgroundColor:'#f6f8fa',
      webPreferences:{session:isolatedSession,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,devTools:false}});
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-navigate',(event,url) => {if(!isLocalUrl(url,origin))event.preventDefault();});
    window.webContents.on('will-redirect',(event,url) => {if(!isLocalUrl(url,origin))event.preventDefault();});
    window.on('closed',() => {window=null;});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'켈비',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
      {label:'편집',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'보기',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
      {label:'창',submenu:[{role:'minimize'},{role:'zoom'}]}
    ]));
    await window.loadURL(`${origin}/`);
    writeFileSync(stateFile,JSON.stringify({pid:process.pid,origin,packaged:app.isPackaged,electron:process.versions.electron,node:process.versions.node}),{mode:0o600});
    window.show();
  } catch {
    await stopLocalServer(ownedServer);
    try{rmSync(stateFile,{force:true});}catch{}
    dialog.showErrorBox('켈비 실행 오류','로컬 앱을 시작하지 못했습니다. 앱을 닫은 뒤 다시 열어 주세요. 오류 코드: LOCAL_START_FAILED');
    app.exit(1);
  }
  });
}
