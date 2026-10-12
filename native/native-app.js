import {Capacitor,registerPlugin} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Preferences} from '@capacitor/preferences';
export const isNative=Capacitor.isNativePlatform();
const Backup=registerPlugin('Backup');
export async function saveNativeBackup(filename,json){return Backup.saveBackup({filename,json});}
export async function readSavedState(key){
  if(!isNative)return localStorage.getItem(key);
  const saved=await Preferences.get({key});
  if(saved.value!==null)return saved.value;
  const legacy=localStorage.getItem(key);
  if(legacy!==null)await Preferences.set({key,value:legacy});
  return legacy;
}
export async function writeSavedState(key,value){
  if(isNative)await Preferences.set({key,value});else localStorage.setItem(key,value);
}
export function initializeNativeApp(){
  if(!isNative)return;
  App.addListener('backButton',()=>{
    const sheet=document.querySelector('#sheet');
    if(sheet?.open){sheet.close();return;}
    if(location.hash&&location.hash!=='#week'){location.hash='week';return;}
    App.minimizeApp();
  }).catch(error=>console.warn('Android back button unavailable',error));
}
