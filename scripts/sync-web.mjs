import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const webSource=path.join(root,'web-source');
const webTarget=path.join(root,'www');
await fs.mkdir(webTarget,{recursive:true});
// Copy only public application assets; no Sites identity, PDFs or runtime data.
await fs.cp(webSource,webTarget,{recursive:true,filter:source=>!path.relative(webSource,source).split(path.sep).some(p=>p==='.openai'||p.startsWith('.'))});
let app=await fs.readFile(path.join(webSource,'app.js'),'utf8');
app="import {isNative,saveNativeBackup,initializeNativeApp,readSavedState,writeSavedState} from './native-app.js';\n"+app;
app=app.replace('const stored=localStorage.getItem(KEY);','const stored=await readSavedState(KEY);');
app=app.replace('stored??localStorage.getItem(LEGACY_KEY)','stored??await readSavedState(LEGACY_KEY)');
app=app.replace('return localStorage.getItem(APPEARANCE_KEY);','return readSavedState(APPEARANCE_KEY);');
app=app.replace('localStorage.setItem(APPEARANCE_KEY,value);','await writeSavedState(APPEARANCE_KEY,value);');
const persistStart=app.indexOf('function persist(next){'),persistEnd=app.indexOf('function toast(',persistStart);
if(persistStart<0||persistEnd<0)throw new Error('课表保存入口已变化，请重新核对安卓适配');
app=app.slice(0,persistStart)+`let saving=false;
async function persist(next){
  validateCoursePeriods(next.courses,next.settings);
  if(saving)throw new Error('正在保存，请稍后再试。');
  saving=true;
  try{
    await writeSavedState(KEY,JSON.stringify(next));
    state=next;
  }catch{throw new Error('本机存储不可用或空间不足，数据未保存。请检查 App 存储设置。');}
  finally{saving=false;}
}
`+app.slice(persistEnd);
app=app.replaceAll('persist({...state','await persist({...state');
app=app.replace("document.addEventListener('submit',(event)=>{","document.addEventListener('submit',async(event)=>{");
app=app.replace('function backup(){','async function backup(){');
const blobLine="  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);";
if(!app.includes(blobLine))throw new Error('课表备份入口已变化，请重新核对安卓适配');
app=app.replace(blobLine,"  if(isNative){const result=await saveNativeBackup('Kim课表备份-'+localDate()+'.json',JSON.stringify(data,null,2));toast(result.cancelled?'已取消导出':'备份已保存');return;}\n"+blobLine);
app=app.replace("else if(action==='backup')backup();","else if(action==='backup')await backup();");
app=app.replace("if('serviceWorker' in navigator)","if(!isNative&&'serviceWorker' in navigator)");
app+='\ninitializeNativeApp();\n';
app=app.replace('DEMO · 演示版','安卓体验版');
app=app.replace("<h3>像 App 一样打开</h3>","<h3>安卓 App</h3>");
app=app.replace('在安卓 Chrome 浏览器打开本页，点右上角菜单，选择“添加到主屏幕”或“安装应用”，就能从手机桌面打开。','已经安装为安卓 App，可从手机桌面打开。课程、备忘录和 PDF 解析资源都随安装包保存，日常查看与导入可离线使用。');
app=app.replace('这是手机网页版 demo。个人课表与备忘录保存在当前浏览器；清除浏览器数据会移除保存内容。','课表和备忘录保存在本 App 内；卸载或清除 App 数据会移除保存内容。网页版和旧版 App 的数据可通过 JSON 备份迁移。');
app=app.replace('当前浏览器','本 App').replace('此浏览器','本 App');
await fs.writeFile(path.join(webTarget,'app.js'),app);
const css=await fs.readFile(path.join(webSource,'style.css'),'utf8');
await fs.writeFile(path.join(webTarget,'style.css'),css+`\n/* Capacitor 8 exposes system bar insets in portrait and landscape. */
:root{--native-top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));--native-bottom:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px));--native-left:var(--safe-area-inset-left,env(safe-area-inset-left,0px));--native-right:var(--safe-area-inset-right,env(safe-area-inset-right,0px))}
body{padding-left:var(--native-left);padding-right:var(--native-right)}
.topbar{height:calc(86px + var(--native-top));padding-top:var(--native-top)}
.sidebar{left:var(--native-left);padding-top:calc(32px + var(--native-top));padding-bottom:calc(32px + var(--native-bottom))}
.bottom-nav{left:var(--native-left);right:var(--native-right);padding-bottom:calc(10px + var(--native-bottom))}
.sheet{padding-bottom:var(--native-bottom)}
@media(max-width:640px){.topbar{height:calc(68px + var(--native-top))}.sheet{left:var(--native-left);right:var(--native-right);width:auto}}
`);
await fs.copyFile(path.join(root,'native/webview-upgrade.html'),path.join(webTarget,'webview-upgrade.html'));
let html=await fs.readFile(path.join(webSource,'index.html'),'utf8');
html=html.replace('DEMO · 演示版','安卓体验版').replace('Kim课表 · 手机演示版','Kim课表 · 安卓体验版');
await fs.writeFile(path.join(webTarget,'index.html'),html);
await build({entryPoints:[path.join(root,'native/native-app.js')],bundle:true,format:'esm',platform:'browser',target:'chrome110',outfile:path.join(webTarget,'native-app.js')});
console.log('Android assets ready: '+webTarget);
