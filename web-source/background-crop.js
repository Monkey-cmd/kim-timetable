const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function normalizeCrop(raw={}){
  const value={x:Number(raw.x??.5),y:Number(raw.y??.5),zoom:Number(raw.zoom??1),aspect:Number(raw.aspect??.5)};
  if(!Object.values(value).every(Number.isFinite)||value.x<0||value.x>1||value.y<0||value.y>1||value.zoom<1||value.zoom>4||value.aspect<.1||value.aspect>10)throw new Error('背景裁剪范围无效，请重新调整');
  return value;
}
export function cropSourceRect(width,height,raw){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('图片尺寸无效');
  const crop=normalizeCrop(raw),w=Math.min(width,height*crop.aspect)/crop.zoom,h=w/crop.aspect;
  return {x:(width-w)*crop.x,y:(height-h)*crop.y,width:w,height:h};
}
export function moveCrop(raw,width,height,displayWidth,dx,dy){
  const crop=normalizeCrop(raw),rect=cropSourceRect(width,height,crop),scale=rect.width/displayWidth;
  return {...crop,x:width>rect.width?clamp(crop.x-dx*scale/(width-rect.width),0,1):.5,y:height>rect.height?clamp(crop.y-dy*scale/(height-rect.height),0,1):.5};
}

function renderCrop(image,crop,canvas,width,height){
  const rect=cropSourceRect(image.naturalWidth,image.naturalHeight,crop);
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('当前设备无法裁剪图片，请更新浏览器组件');
  ctx.fillStyle='#f6f7f3';ctx.fillRect(0,0,width,height);
  ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,width,height);
}
function exportCrop(image,crop){
  const rect=cropSourceRect(image.naturalWidth,image.naturalHeight,crop),canvas=document.createElement('canvas');
  const scale=Math.min(1,1600/Math.max(rect.width,rect.height));
  renderCrop(image,crop,canvas,Math.max(1,Math.round(rect.width*scale)),Math.max(1,Math.round(rect.height*scale)));
  for(const quality of [.82,.65,.45]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=1200000)return data;}
  throw new Error('裁剪后的图片过大，请再放大一点或选择较小的图片');
}

export async function openBackgroundCrop(source,{initial,aspect=window.innerWidth/window.innerHeight}={}){
  const image=new Image();image.src=source;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('图片无法读取，请换一张图片');
  let crop=normalizeCrop({...initial,aspect:clamp(aspect,.1,10)}),drag=null;
  const dialog=document.createElement('dialog');dialog.className='sheet crop-sheet';dialog.setAttribute('aria-labelledby','crop-title');
  dialog.innerHTML='<div class="sheet-header"><h2 id="crop-title">裁剪背景图片</h2><button type="button" class="icon-btn" data-crop-action="cancel" aria-label="关闭裁剪">×</button></div><div class="sheet-body"><p class="crop-intro">拖动图片选择想保留的部分，也可以缩放。框内就是按当前屏幕比例裁剪的效果。</p><div class="crop-workspace"><div class="crop-frame"><canvas class="crop-canvas" tabindex="0" role="img" aria-label="背景裁剪预览，可拖动图片或使用方向键移动"></canvas></div></div><div class="crop-controls"><label class="blur-field">缩放<output data-crop-output="zoom"></output><input name="cropZoom" aria-label="裁剪缩放" type="range" min="1" max="4" step=".01"></label><div class="crop-position-controls"><label class="blur-field">水平位置<output data-crop-output="x"></output><input name="cropX" aria-label="裁剪水平位置" type="range" min="0" max="100" step="1"></label><label class="blur-field">垂直位置<output data-crop-output="y"></output><input name="cropY" aria-label="裁剪垂直位置" type="range" min="0" max="100" step="1"></label></div></div><p class="course-form-error" data-crop-error role="alert" hidden></p><div class="form-footer crop-footer"><button type="button" class="inline-link" data-crop-action="reset">居中重置</button><button type="button" class="secondary-btn" data-crop-action="cancel">取消</button><button type="button" class="primary-btn" data-crop-action="apply">完成裁剪</button></div></div>';
  document.body.append(dialog);
  const frame=dialog.querySelector('.crop-frame'),canvas=dialog.querySelector('canvas');
  frame.style.setProperty('--crop-aspect',String(crop.aspect));
  const inputs={zoom:dialog.querySelector('[name="cropZoom"]'),x:dialog.querySelector('[name="cropX"]'),y:dialog.querySelector('[name="cropY"]')};
  const redraw=()=>{
    const bounds=frame.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
    if(bounds.width&&bounds.height)renderCrop(image,crop,canvas,Math.round(bounds.width*ratio),Math.round(bounds.height*ratio));
    for(const key of ['zoom','x','y']){
      inputs[key].value=String(key==='zoom'?crop[key]:Math.round(crop[key]*100));
      dialog.querySelector('[data-crop-output="'+key+'"]').textContent=key==='zoom'?crop.zoom.toFixed(2)+'×':Math.round(crop[key]*100)+'%';
    }
    const rect=cropSourceRect(image.naturalWidth,image.naturalHeight,crop);
    inputs.x.disabled=image.naturalWidth-rect.width<.01;inputs.y.disabled=image.naturalHeight-rect.height<.01;
  };
  return new Promise(resolve=>{
    let result=null;
    const cancel=()=>dialog.close();
    const observer=new ResizeObserver(redraw);
    dialog.addEventListener('close',()=>{observer.disconnect();window.removeEventListener('hashchange',cancel);dialog.remove();resolve(result);},{once:true});
    window.addEventListener('hashchange',cancel);
    dialog.addEventListener('click',event=>{
      const action=event.target.closest('[data-crop-action]')?.dataset.cropAction;
      if(action==='cancel')cancel();
      else if(action==='reset'){crop={...crop,x:.5,y:.5,zoom:1};redraw();}
      else if(action==='apply'){
        try{result={background:exportCrop(image,crop),crop:{...crop}};dialog.close();}
        catch(err){const error=dialog.querySelector('[data-crop-error]');error.textContent=err.message;error.hidden=false;}
      }
    });
    dialog.addEventListener('input',event=>{
      const key={cropZoom:'zoom',cropX:'x',cropY:'y'}[event.target.name];
      if(key){crop={...crop,[key]:Number(event.target.value)/(key==='zoom'?1:100)};redraw();}
    });
    canvas.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||event.button!==0)return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,initial:{...crop},width:canvas.getBoundingClientRect().width};
      canvas.setPointerCapture(event.pointerId);event.preventDefault();canvas.focus({preventScroll:true});
    });
    canvas.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      crop=moveCrop(drag.initial,image.naturalWidth,image.naturalHeight,drag.width,event.clientX-drag.x,event.clientY-drag.y);redraw();
    });
    const endDrag=event=>{if(drag?.id!==event.pointerId)return;drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,endDrag);
    canvas.addEventListener('keydown',event=>{
      const change={ArrowLeft:[-.03,0],ArrowRight:[.03,0],ArrowUp:[0,-.03],ArrowDown:[0,.03]}[event.key];if(!change)return;
      event.preventDefault();crop={...crop,x:clamp(crop.x+change[0],0,1),y:clamp(crop.y+change[1],0,1)};redraw();
    });
    dialog.showModal();observer.observe(frame);redraw();
  });
}
