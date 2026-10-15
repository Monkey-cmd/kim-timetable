import {normalizeCrop} from './background-crop.js';
export const DEFAULT_APPEARANCE={color:'#91b2a0',background:'',backgroundSource:'',backgroundCrop:null,blur:8,fontScale:1,textColor:'#253e35',bold:false,mask:45};
export const THEME_PRESETS=[['苔绿','#91b2a0'],['雾蓝','#9bafc7'],['浅紫','#b4a3bf'],['蜜桃','#c4a69a'],['橄榄','#b2bd96'],['湖水','#94b6b9']];
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
const hex=values=>'#'+values.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const mix=(a,b,ratio)=>hex(rgb(a).map((v,i)=>v*(1-ratio)+rgb(b)[i]*ratio));

export function softenColor(value){
  if(typeof value!=='string'||!/^#[a-f\d]{6}$/i.test(value))throw new Error('请选择有效的主题颜色');
  const [r,g,b]=rgb(value).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let light=(max+min)/2,saturation=d?d/(1-Math.abs(2*light-1)):0,hue=0;
  if(d)hue=(max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4)/6;
  hue=(hue+1)%1;saturation=Math.min(saturation,.38);light=Math.max(.60,Math.min(.74,light));
  const c=(1-Math.abs(2*light-1))*saturation,x=c*(1-Math.abs((hue*6)%2-1)),m=light-c/2;
  const parts=hue<1/6?[c,x,0]:hue<2/6?[x,c,0]:hue<3/6?[0,c,x]:hue<4/6?[0,x,c]:hue<5/6?[x,0,c]:[c,0,x];
  return hex(parts.map(v=>(v+m)*255));
}
export function normalizeAppearance(raw={}){
  const color=softenColor(raw.color??DEFAULT_APPEARANCE.color),blur=Number(raw.blur??DEFAULT_APPEARANCE.blur),background=raw.background??'';
  const fontScale=Number(raw.fontScale??DEFAULT_APPEARANCE.fontScale),textColor=raw.textColor??DEFAULT_APPEARANCE.textColor,bold=raw.bold??DEFAULT_APPEARANCE.bold,mask=Number(raw.mask??DEFAULT_APPEARANCE.mask);
  const backgroundSource=raw.backgroundSource??'',backgroundCrop=raw.backgroundCrop?normalizeCrop(raw.backgroundCrop):null;
  if(!Number.isInteger(blur)||blur<0||blur>30)throw new Error('背景虚化程度应在 0–30 之间');
  if(typeof background!=='string'||background.length>1200000||(background&&!/^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/]+={0,2}$/i.test(background)))throw new Error('背景图片无效或过大，请重新选择 JPG、PNG 或 WebP 图片');
  if(typeof backgroundSource!=='string'||backgroundSource.length>1200000||(backgroundSource&&!/^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/]+={0,2}$/i.test(backgroundSource)))throw new Error('背景原图无效或过大，请重新选择图片');
  if(![1,1.12,1.24].includes(fontScale)||typeof textColor!=='string'||!/^#[a-f\d]{6}$/i.test(textColor)||typeof bold!=='boolean'||!Number.isInteger(mask)||mask<0||mask>80)throw new Error('文字或背景淡化设置无效');
  return {color,background,backgroundSource:background?backgroundSource:'',backgroundCrop:background?backgroundCrop:null,blur,fontScale,textColor:textColor.toLowerCase(),bold,mask};
}
const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
export function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (values[1]+.05)/(values[0]+.05);}
export function themeTokens(color){
  const onAccent=contrast(color,'#152921')>=4.5?'#152921':contrast(color,'#ffffff')>=4.5?'#ffffff':'#000000';
  let text=color;
  for(let i=1;contrast(text,'#ffffff')<4.5&&i<=10;i++)text=mix(color,'#000000',i/10);
  return {'--green':color,'--accent-text':text,'--on-accent':onAccent,'--soft':mix(color,'#ffffff',.87),'--bg':mix(color,'#ffffff',.96),'--line':mix(color,'#ffffff',.82),'--ink':mix(color,'#152921',.85)};
}
export function readingTokens(value){
  let paperText=value.textColor;
  for(let i=1;contrast(paperText,'#ffffff')<7&&i<=10;i++)paperText=mix(value.textColor,'#000000',i/10);
  let muted=mix(paperText,'#ffffff',.18);
  if(contrast(muted,'#ffffff')<4.5)muted=paperText;
  return {'--font-scale':String(value.fontScale),'--reading-text':value.textColor,'--paper-text':paperText,'--paper-muted':muted,'--ink':paperText,'--muted':muted,'--reading-mask':String(value.mask/100),'--reading-shadow':contrast(value.textColor,'#ffffff')<4.5?'0 1px 4px #000000b0':'0 1px 4px #ffffffd0'};
}
// Serialize native preference writes so rapid changes cannot finish in the wrong order.
export function createAppearanceWriter(write){
  let previous=Promise.resolve();
  return value=>{
    const text=JSON.stringify(value),next=previous.catch(()=>{}).then(()=>write(text));
    previous=next;return next;
  };
}
export async function prepareBackground(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if(file.size>15*1024*1024)throw new Error('图片超过 15 MB，请选择较小的图片');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>50000000)throw new Error('图片尺寸过大，请选择较小的图片');
    const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f6f7f3';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.82,.65,.45]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=1200000)return data;}
    throw new Error('图片压缩后仍过大，请选择较小的图片');
  }catch(err){throw new Error(err.message==='The source image cannot be decoded.'?'图片无法读取，请换一张图片':err.message);}
  finally{URL.revokeObjectURL(url);}
}
