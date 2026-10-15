import {COLORS,DAYS,DEFAULT_SETTINGS,DEFAULT_TIMES,DEMO_COURSES,clone,localDate,dateFrom,addDays,weekOf,dayOf,weekStart,activeInWeek,coursesOn,normalizeCourse,normalizeSettings,validateCoursePeriods,timeMinutes,courseConflicts,importBackup,parseCourseLines,parseWeekSpec,formatWeekSpec} from './core.js';
import {pageItems,textLines,parseTimetablePage} from './pdf-import.js';
import {normalizeMemo,normalizeMemos,memoStatus,sortMemos} from './memos.js';
import {adjustSelection,dragPeriodDelta} from './course-selection.js';
import {openBackgroundCrop} from './background-crop.js';
import {DEFAULT_APPEARANCE,THEME_PRESETS,normalizeAppearance,softenColor,themeTokens,readingTokens,createAppearanceWriter,prepareBackground} from './appearance.js';

const KEY='kim-timetable-v1',LEGACY_KEY='shu-timetable-demo-v1';
const APPEARANCE_KEY='kim-appearance-v1';
const main=document.querySelector('#main'),sheet=document.querySelector('#sheet'),fileInput=document.querySelector('#file-input');
const svgPaths={
  week:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4M8 14h2M14 14h2M8 17h2"/>',
  today:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  memos:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4M10 8h6M10 12h6M10 16h4"/>',
  import:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 18v-6M9 15l3-3 3 3"/>',
  settings:'<path d="m12 3 2 3 4-.2 1.7 3.4-2 3 2 3-1.7 3.4-4-.2-2 3-2-3-4 .2-1.7-3.4 2-3-2-3L6 5.8l4 .2z"/><circle cx="12" cy="12" r="3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  person:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  leaf:'<path d="M20 4s-12-2-15 6c-3 8 8 14 12 6 3-5 3-12 3-12Z"/><path d="M4 21 15 10"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  book:'<path d="M12 6c-2-2-6-3-9-2v15c3-1 7 0 9 2 2-2 6-3 9-2V4c-3-1-7 0-9 2v15"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
};
const icon=(name)=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(svgPaths[name]||svgPaths.book)+'</svg>';
const esc=(text)=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,action,cls='secondary-btn',extra='')=>'<button type="button" class="'+cls+'" data-action="'+action+'" '+extra+'>'+label+'</button>';
const clampWeek=(w)=>Math.max(1,Math.min(state.settings.totalWeeks,w));
let state={settings:clone(DEFAULT_SETTINGS),courses:clone(DEMO_COURSES),memos:[],demo:true};
let storageWarning='';
try{
  const stored=localStorage.getItem(KEY);
  const saved=stored??localStorage.getItem(LEGACY_KEY);
  if(saved){
    const data=JSON.parse(saved),settings=normalizeSettings(data.settings),courses=data.courses.map(normalizeCourse);
    validateCoursePeriods(courses,settings);
    state={settings,courses,memos:[],demo:!!data.demo};
    try{state.memos=normalizeMemos(data.memos??[]);}catch{storageWarning='备忘录数据无法读取，课表已保留。请从备份恢复备忘录。';}
  }
}catch{storageWarning='本机保存的数据无法读取，已显示示例课表。';}
async function readAppearance(){return localStorage.getItem(APPEARANCE_KEY);}
async function writeAppearance(value){localStorage.setItem(APPEARANCE_KEY,value);}
let appearance={...DEFAULT_APPEARANCE},appearanceDraft,backgroundBusy=false,appearanceRevision=0;
try{const saved=await readAppearance();if(saved)appearance=normalizeAppearance(JSON.parse(saved));}catch{storageWarning=storageWarning||'外观设置无法读取，已使用默认外观。';}
appearanceDraft={...appearance};applyAppearance(appearance);
const rememberAppearance=createAppearanceWriter(writeAppearance);
let selectedWeek=clampWeek(weekOf(localDate(),state.settings)),selectedDate=localDate();
let route='week',showWeekends=false,importState=null,toastTimeout,deferredInstall=null,memoFilter='pending';
let courseSelection=null,selectionDrag=null,suppressSelectionClick=false;
const navs=[['week','课表','每周课表'],['today','今天','今日课程'],['memos','备忘录','我的备忘录'],['import','导入','导入课表'],['settings','设置','课表设置']];
function persist(next){
  validateCoursePeriods(next.courses,next.settings);
  // Mutate in-memory state only after successful storage, so a failed save cannot appear successful.
  try{localStorage.setItem(KEY,JSON.stringify(next));}
  catch{throw new Error('本机存储不可用或空间不足，数据未保存。请检查浏览器存储设置。');}
  state=next;
}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3500);}
function shortDate(value){const d=dateFrom(value);return (d.getMonth()+1)+'.'+String(d.getDate()).padStart(2,'0');}
function longDate(value){const d=dateFrom(value);return (d.getMonth()+1)+'月'+d.getDate()+'日';}
function when(course){return state.settings.times[course.start-1][0]+' – '+state.settings.times[course.end-1][1];}
function weeksText(course){return (course.weeks?formatWeekSpec(course.weeks):course.weekFrom+'–'+course.weekTo)+'周'+(course.parity==='odd'?' · 单周':course.parity==='even'?' · 双周':course.weeks?'':' · 每周');}
function heading(title,subtitle,action=''){return '<div class="page-heading"><div><div class="eyebrow">A LITTLE ORDER, A BETTER DAY</div><h1>'+title+'</h1><p class="subtitle">'+subtitle+'</p></div>'+action+'</div>';}
function dataNotice(){
  if(state.demo)return '<div class="notice">'+icon('info')+'<span>当前为示例课表，课程与作息均为演示数据。</span>'+button('导入我的课表 '+icon('arrow'),'goto-import','')+'</div>';
  return '<div class="notice">'+icon('shield')+'<span>个人课表保存在此浏览器，课程变更后请重新导入。</span>'+button('管理课表','goto-import','')+'</div>';
}
function renderNav(){
  for(const selector of ['.side-nav','.bottom-nav'])document.querySelector(selector).innerHTML=navs.map(([key,label,full])=>'<a class="nav-item '+(route===key?'active':'')+'" href="#'+key+'" '+(route===key?'aria-current="page"':'')+'>'+icon(key)+'<span>'+(selector==='.side-nav'?full:label)+'</span>'+(route===key?'<i class="nav-dot"></i>':'')+'</a>').join('');
  document.querySelector('#breadcrumb').textContent=navs.find(n=>n[0]===route)[2];
  document.querySelector('#school-badge').textContent=state.settings.school;
  document.querySelector('#sidebar-school').textContent=state.settings.school;
}
function upcoming(){
  const now=new Date(),today=localDate(now),mins=now.getHours()*60+now.getMinutes();
  for(let offset=0;offset<=210;offset++){
    const date=addDays(today,offset),week=weekOf(date,state.settings);
    if(week>state.settings.totalWeeks)break;
    const course=coursesOn(state.courses,date,state.settings).find(c=>offset!==0||timeMinutes(state.settings.times[c.end-1][1])>mins);
    if(course)return {course,date,ongoing:offset===0&&timeMinutes(state.settings.times[course.start-1][0])<=mins};
  }
  return null;
}
function nextCard(){
  const next=upcoming();
  if(!next)return '<div class="next-card"><div class="label-row">NEXT UP '+icon('leaf')+'</div><h2>给自己<br>留一点空白</h2><p class="next-time">本学期暂无后续课程</p><div class="decor-orbit"></div></div>';
  const c=next.course,label=next.ongoing?'正在上课':next.date===localDate()?'今天下一节':next.date===addDays(localDate(),1)?'明天的第一节':'下一节课';
  return '<div class="next-card"><div class="label-row">'+label+' '+icon('leaf')+'</div><h2>'+esc(c.name)+'</h2><p class="next-time">'+longDate(next.date)+' · '+when(c)+'</p><div class="next-info">'+icon('pin')+esc(c.room||'教室待填写')+'</div><div class="next-info">'+icon('person')+esc(c.teacher||'教师待填写')+'</div>'+button('查看课程 '+icon('arrow'),'detail','secondary-btn','data-id="'+esc(c.id)+'"')+'<div class="decor-orbit"></div></div>';
}
function statsCard(){
  const courses=state.courses.filter(c=>activeInWeek(c,selectedWeek)),periods=courses.reduce((sum,c)=>sum+c.end-c.start+1,0);
  const current=Math.max(0,Math.min(weekOf(localDate(),state.settings),state.settings.totalWeeks));
  return '<div class="white-card"><h3>'+icon('book')+' 本周小计</h3><div class="stats-grid"><div><div class="stat-number">'+courses.length+'<small>次</small></div><div class="stat-label">课程安排</div></div><div><div class="stat-number">'+periods+'<small>节</small></div><div class="stat-label">上课节次</div></div></div><div class="progress-track"><i style="width:'+(current/state.settings.totalWeeks*100)+'%"></i></div><div class="progress-text"><span>学期进度</span><span>第 '+current+' / '+state.settings.totalWeeks+' 周</span></div></div>';
}
function renderWeek(){
  const start=weekStart(selectedWeek,state.settings),end=addDays(start,6),courses=state.courses.filter(c=>activeInWeek(c,selectedWeek));
  const currentDay=weekOf(localDate(),state.settings)===selectedWeek?dayOf(localDate()):0;
  const visibleDays=showWeekends||courses.some(c=>c.day>5)?DAYS:DAYS.slice(0,5);
  main.innerHTML=heading('每一天，心里有数。',esc(state.settings.term)+'<span class="mobile-hide"> · 从容开始这一周</span>',button(icon('plus')+'添加课程','add','primary-btn'))+dataNotice()+
    '<div class="week-layout"><section class="calendar-panel" aria-label="第'+selectedWeek+'周课程表"><div class="calendar-tools"><div class="week-control">'+button(icon('left'),'prev-week','icon-btn','aria-label="上一周" '+(selectedWeek===1?'disabled':''))+'<div>'+button('第 '+selectedWeek+' 周 '+icon('down'),'choose-week','week-select-btn')+'<div class="date-range">'+shortDate(start)+' — '+shortDate(end)+'</div></div>'+button(icon('right'),'next-week','icon-btn','aria-label="下一周" '+(selectedWeek===state.settings.totalWeeks?'disabled':''))+'</div><div class="calendar-actions">'+button('周末','toggle-weekends','today-btn','aria-pressed="'+showWeekends+'"')+button('本周','current-week','today-btn')+'</div></div><div role="region" tabindex="0" aria-label="课程网格，可左右滑动" class="calendar '+(visibleDays.length===5?'weekdays-only':'')+'"><div class="day-heads"><span class="month-head">'+(dateFrom(start).getMonth()+1)+'月</span>'+visibleDays.map((day,index)=>'<div class="day-head '+(index+1===currentDay?'current':'')+'"><span>周'+day+'</span><span class="day-number">'+dateFrom(addDays(start,index)).getDate()+'</span></div>').join('')+'</div><div class="schedule-body"><div class="periods" style="grid-template-rows:repeat('+state.settings.times.length+',var(--row))">'+state.settings.times.map((t,index)=>'<div class="period" aria-label="第'+(index+1)+'节，'+t[0]+'至'+t[1]+'" title="'+t[0]+'–'+t[1]+'"><span>'+String(index+1).padStart(2,'0')+'</span><small class="period-time"><span>'+t[0]+'</span><span>'+t[1]+'</span></small></div>').join('')+'</div><div class="course-grid" style="grid-template-rows:repeat('+state.settings.times.length+',var(--row))">'+visibleDays.map((_,index)=>'<div class="column-bg '+(index+1===currentDay?'current':'')+'" style="grid-column:'+(index+1)+'"></div>').join('')+visibleDays.flatMap((_,day)=>Array.from({length:state.settings.times.length},(_,period)=>courses.some(c=>c.day===day+1&&c.start<=period+1&&c.end>=period+1)?'':'<button type="button" class="empty-course-slot" data-action="select-course-range" data-day="'+(day+1)+'" data-period="'+(period+1)+'" style="grid-column:'+(day+1)+';grid-row:'+(period+1)+'" aria-label="添加课程，星期'+DAYS[day]+'，第'+(period+1)+'节"></button>')).join('')+courses.map(c=>'<button class="course-block color-'+c.color+'" data-action="detail" data-id="'+esc(c.id)+'" style="grid-column:'+c.day+';grid-row:'+c.start+' / '+(c.end+1)+'" aria-label="'+esc(c.name)+'，周'+DAYS[c.day-1]+'，'+c.start+'至'+c.end+'节，'+esc(c.room)+'"><strong>'+esc(c.name)+'</strong><span>'+esc(c.room||'教室待填写')+'</span><span class="course-period">'+c.start+'–'+c.end+'节</span></button>').join('')+'</div></div></div><div id="course-selection-hint" class="course-selection-hint" hidden><div><strong data-range-label aria-live="polite"></strong><small data-range-help></small></div>'+button('取消选择','cancel-course-range','')+'</div><div class="calendar-legend"><span><i class="legend-dot" style="background:#adc3a3"></i>点空白添加 · 点课程查看详情</span><span><i class="legend-dot" style="background:#c7bbd6"></i>单双周自动显示</span></div></section><aside class="aside-stack">'+nextCard()+statsCard()+'<div class="tip-card"><h3>'+icon('leaf')+' 留一点时间给自己</h3><p>课间走走，喝口水。<br>忙碌的日子，也可以有自己的节奏。</p></div></aside></div>';
}
function clearCourseSelection(){
  courseSelection=null;selectionDrag=null;
  main.querySelector('.course-picker')?.remove();
  const hint=main.querySelector('#course-selection-hint');if(hint)hint.hidden=true;
}
function selectCourseRange(day,period){
  clearCourseSelection();
  courseSelection={day,start:period,end:period};
  const picker=document.createElement('div');picker.className='course-picker';picker.setAttribute('role','group');
  picker.innerHTML='<div class="range-handle range-start" data-selection-mode="start" role="slider" tabindex="0" aria-label="调整开始节次" aria-orientation="vertical"><i></i></div><button type="button" class="range-add" data-selection-mode="move" data-action="add-selected-course">'+icon('plus')+'</button><div class="range-handle range-end" data-selection-mode="end" role="slider" tabindex="0" aria-label="调整结束节次" aria-orientation="vertical"><i></i></div>';
  main.querySelector('.course-grid').append(picker);
  updateCourseSelection();
  picker.querySelector('.range-add').focus({preventScroll:true});
}
function updateCourseSelection(){
  const picker=main.querySelector('.course-picker');if(!picker||!courseSelection)return;
  const {day,start,end}=courseSelection;
  const conflict=state.courses.some(c=>activeInWeek(c,selectedWeek)&&c.day===day&&c.start<=end&&c.end>=start);
  const label='星期'+DAYS[day-1]+' · '+start+'–'+end+'节 · '+state.settings.times[start-1][0]+'–'+state.settings.times[end-1][1];
  picker.style.gridColumn=day;picker.style.gridRow=start+' / '+(end+1);
  picker.classList.toggle('range-conflict',conflict);picker.setAttribute('aria-label',label);
  const add=picker.querySelector('.range-add');
  add.setAttribute('aria-label','填写课程详情，'+label);
  // Keep the button draggable even when the selected range needs adjustment.
  add.setAttribute('aria-disabled',String(conflict));
  for(const mode of ['start','end']){
    const handle=picker.querySelector('[data-selection-mode="'+mode+'"]');
    handle.setAttribute('aria-valuemin',mode==='start'?1:start);
    handle.setAttribute('aria-valuemax',mode==='start'?end:state.settings.times.length);
    handle.setAttribute('aria-valuenow',mode==='start'?start:end);
    handle.setAttribute('aria-valuetext','第'+(mode==='start'?start:end)+'节');
  }
  const hint=main.querySelector('#course-selection-hint');hint.hidden=false;
  hint.querySelector('[data-range-label]').textContent=label;
  hint.querySelector('[data-range-help]').textContent=conflict?'本周所选范围已有课程，请拖动调整。':'拖动方框移动，上下边缘调整范围；点 ＋ 填写详情。';
}
main.addEventListener('pointerdown',event=>{
  const target=event.target.closest('[data-selection-mode]');
  if(!target||!courseSelection||!event.isPrimary||event.button!==0)return;
  const grid=main.querySelector('.course-grid');
  selectionDrag={pointerId:event.pointerId,target,mode:target.dataset.selectionMode,fromY:event.clientY,height:grid.getBoundingClientRect().height,initial:{...courseSelection},moved:false};
  target.setPointerCapture(event.pointerId);event.preventDefault();target.focus({preventScroll:true});
});
main.addEventListener('pointermove',event=>{
  if(!selectionDrag||event.pointerId!==selectionDrag.pointerId)return;
  if(!selectionDrag.moved&&Math.abs(event.clientY-selectionDrag.fromY)<6)return;
  selectionDrag.moved=true;
  courseSelection=adjustSelection(selectionDrag.initial,selectionDrag.mode,dragPeriodDelta(selectionDrag.fromY,event.clientY,selectionDrag.height,state.settings.times.length),state.settings.times.length);
  updateCourseSelection();event.preventDefault();
});
function finishSelectionDrag(event){
  if(!selectionDrag||event.pointerId!==selectionDrag.pointerId)return;
  const drag=selectionDrag;selectionDrag=null;
  if(event.type==='pointercancel'){courseSelection=drag.initial;updateCourseSelection();}
  if(drag.moved||event.type==='pointercancel'){
    suppressSelectionClick=true;
    setTimeout(()=>{suppressSelectionClick=false;},0);
  }
  if(drag.target.hasPointerCapture(event.pointerId))drag.target.releasePointerCapture(event.pointerId);
}
main.addEventListener('pointerup',finishSelectionDrag);
main.addEventListener('pointercancel',finishSelectionDrag);
main.addEventListener('lostpointercapture',finishSelectionDrag);
main.addEventListener('keydown',event=>{
  if(!courseSelection||sheet.open)return;
  if(event.key==='Escape'){clearCourseSelection();event.preventDefault();return;}
  const target=event.target.closest('[data-selection-mode]');
  if(!target||!['ArrowUp','ArrowDown'].includes(event.key))return;
  courseSelection=adjustSelection(courseSelection,target.dataset.selectionMode,event.key==='ArrowUp'?-1:1,state.settings.times.length);
  updateCourseSelection();event.preventDefault();
});
function renderToday(){
  const current=weekOf(selectedDate,state.settings),start=weekStart(current,state.settings);
  const courses=current>=1&&current<=state.settings.totalWeeks?coursesOn(state.courses,selectedDate,state.settings):[];
  main.innerHTML=heading('今天，也从容一点。',longDate(selectedDate)+' · 星期'+DAYS[dayOf(selectedDate)-1]+(current>=1&&current<=state.settings.totalWeeks?' · 第 '+current+' 周':' · 学期范围之外'),button('回到今天','current-day','secondary-btn'))+dataNotice()+'<div class="content-column"><div class="day-strip">'+button(icon('left'),'prev-day','icon-btn','aria-label="前一天"')+DAYS.map((day,i)=>'<button class="day-pick '+(addDays(start,i)===selectedDate?'active':'')+'" data-action="pick-date" data-date="'+addDays(start,i)+'"><span>周'+day+'</span><strong>'+dateFrom(addDays(start,i)).getDate()+'</strong></button>').join('')+button(icon('right'),'next-day','icon-btn','aria-label="后一天"')+'</div><p class="daily-summary">今天有 <strong>'+courses.length+'</strong> 次课程，'+(courses.length?'带好你的好状态。':'享受属于自己的时间。')+'</p>'+
  (courses.length?'<div class="timeline">'+courses.map(c=>'<div class="agenda-row"><div class="agenda-time">'+state.settings.times[c.start-1][0]+'<small>'+state.settings.times[c.end-1][1]+'</small></div><button class="agenda-card color-'+c.color+'" data-action="detail" data-id="'+esc(c.id)+'"><h3>'+esc(c.name)+'</h3><div class="agenda-details"><span>'+icon('pin')+esc(c.room||'教室待填写')+'</span><span>'+icon('person')+esc(c.teacher||'教师待填写')+'</span><span>'+c.start+'–'+c.end+'节</span></div></button></div>').join('')+'</div>':'<div class="empty-state"><div class="empty-icon">'+icon('leaf')+'</div><h3>今天，留白。</h3><p>没有安排课程。<br>去散个步，或做一件你喜欢的事。</p>'+button('看看本周安排 '+icon('arrow'),'goto-week','secondary-btn')+'</div>')+'</div>';
}
function renderMemos(){
  const today=localDate(),pending=state.memos.filter(m=>!m.completed),due=pending.filter(m=>m.dueDate&&m.dueDate<=today);
  const filtered=sortMemos(state.memos).filter(m=>memoFilter==='all'||(memoFilter==='completed'?m.completed:!m.completed));
  const labels={completed:'已完成',overdue:'已过期',today:'今天截止',upcoming:'截止',undated:'未设日期'};
  main.innerHTML=heading('小事记下来，心里轻一点。','作业、考试、生活琐事，给它们一个位置。',button(icon('plus')+'新建备忘','add-memo','primary-btn'))+
    '<div class="content-column memo-page"><div class="memo-overview"><div><span class="memo-overview-number">'+pending.length+'</span><span>件待办</span></div><div><span class="memo-overview-number">'+due.length+'</span><span>件今天到期 / 已过期</span></div><span class="memo-overview-leaf">'+icon('memos')+'</span></div><div class="memo-toolbar" role="group" aria-label="备忘录筛选">'+[['pending','待办'],['completed','已完成'],['all','全部']].map(([key,label])=>button(label+(key==='completed'?' '+(state.memos.length-pending.length):key==='all'?' '+state.memos.length:' '+pending.length),'filter-memos','memo-filter '+(memoFilter===key?'active':''),'data-filter="'+key+'" aria-pressed="'+(memoFilter===key)+'"')).join('')+'</div>'+
    (filtered.length?'<div class="memo-list">'+filtered.map(m=>{
      const status=memoStatus(m,today);
      return '<article class="memo-card '+(m.completed?'completed':'')+'"><button type="button" class="memo-check" data-action="toggle-memo" data-id="'+esc(m.id)+'" role="checkbox" aria-checked="'+m.completed+'" aria-label="'+(m.completed?'重新打开':'完成')+'：'+esc(m.title)+'">'+(m.completed?icon('check'):'')+'</button><div class="memo-content"><button type="button" class="memo-title" data-action="edit-memo" data-id="'+esc(m.id)+'">'+esc(m.title)+'</button>'+(m.body?'<p class="memo-body">'+esc(m.body)+'</p>':'')+'<div class="memo-meta"><span class="memo-date '+status+'">'+(m.dueDate?icon('week'):'')+labels[status]+(m.dueDate?' · '+m.dueDate:'')+'</span><div class="memo-actions">'+button('编辑','edit-memo','','data-id="'+esc(m.id)+'" aria-label="编辑：'+esc(m.title)+'"')+button('删除','delete-memo','','data-id="'+esc(m.id)+'" aria-label="删除：'+esc(m.title)+'"')+'</div></div></div></article>';
    }).join('')+'</div>':'<div class="empty-state memo-empty"><div class="empty-icon">'+icon('memos')+'</div><h3>'+(memoFilter==='completed'?'还没有完成的备忘':memoFilter==='pending'&&state.memos.length?'待办都完成啦。':'从一件小事开始。')+'</h3><p>'+(memoFilter==='completed'?'完成的事项会收在这里。':'记下要做的事，腾出心思给今天。')+'</p>'+button(icon('plus')+'新建备忘','add-memo','secondary-btn')+'</div>')+'<p class="fine-print memo-privacy">'+icon('shield')+' 备忘录保存在当前浏览器，可随课表一起导出备份。截止日期不会触发手机通知。</p></div>';
}
function editMemo(id=null){
  const m=state.memos.find(m=>m.id===id)||{title:'',body:'',dueDate:''};
  if(id&&!state.memos.some(m=>m.id===id))return;
  if(sheet.open)sheet.close();
  openSheet(id?'编辑备忘':'新建备忘','<form id="memo-form" data-id="'+esc(id||'')+'"><div class="form-grid"><label class="field full">标题<input name="title" required maxlength="80" placeholder="例如：完成电路作业" value="'+esc(m.title)+'"></label><label class="field full">内容（选填）<textarea name="body" class="memo-editor" maxlength="3000" placeholder="需要带的东西、作业要求，或一个突然想到的点子…">'+esc(m.body)+'</textarea></label><label class="field full">截止日期（选填）<input name="dueDate" type="date" value="'+esc(m.dueDate)+'"></label></div><div class="form-footer">'+button('取消','close-sheet','secondary-btn')+'<button type="submit" class="primary-btn">保存备忘</button></div></form>');
}
function resultHtml(){
  if(!importState)return '';
  if(importState.busy)return '<div class="import-result"><div class="spinner"></div><p class="result-meta" style="margin-top:15px">正在本机读取 PDF，请稍候…</p></div>';
  if(importState.error)return '<div class="import-result"><h3>文件暂时无法读取</h3><p class="result-meta">'+esc(importState.error)+'</p>'+button('重新选择文件','upload','secondary-btn','style="margin-top:15px"')+'</div>';
  const isBackup=importState.type==='json',courses=importState.courses;
  let text='<div class="import-result"><h3>'+esc(importState.filename)+'</h3><p class="result-meta">'+(isBackup?'已读取课表备份':'已读取 '+importState.pages+' 页 PDF'+(importState.adapter?' · '+importState.adapter:''))+' · 找到 '+courses.length+' 条候选课程。请确认名称、时间、教室和周次后导入。</p>';
  if(importState.errors?.length)text+='<div class="alert-box">有 '+importState.errors.length+' 条课程未完整识别，请对照 PDF 手动补充。导入不会包含未识别的条目。</div>';
  if(isBackup||courses.length){
    text+='<div class="candidate-list">'+courses.map((c,i)=>'<div class="candidate"><input type="checkbox" aria-label="导入'+esc(c.name)+'" data-candidate="'+i+'" '+(c.selected!==false?'checked':'')+'><div><h4>'+esc(c.name)+'</h4><p>周'+DAYS[c.day-1]+' · '+c.start+'–'+c.end+'节 · '+weeksText(c)+'<br>'+esc(c.room||'教室待填写')+' · '+esc(c.teacher||'教师待填写')+'</p></div>'+button('修改','edit-candidate','','data-index="'+i+'"')+'</div>').join('')+'</div>';
    if(courseConflicts(courses.filter(c=>c.selected!==false)).length)text+='<div class="alert-box">候选课程存在时间冲突，请修改或取消勾选后导入。</div>';
    text+='<div class="alert-box">确认后将替换当前课表。建议先导出备份。'+(isBackup?' 备份中的学期和作息设置也会一起恢复。'+(importState.memos!==undefined?' 备忘录将恢复为备份中的 '+importState.memos.length+' 条。':' 此旧备份不包含备忘录，现有备忘录会保留。'):importState.adapter?' 连续周、指定周和停课周次均已保留。现有备忘录会保留。':' PDF 未标明周次时，候选条目默认 1–18 周，请修改为真实周次。现有备忘录会保留。')+'</div><div class="form-footer">'+button('导出当前备份','backup','secondary-btn')+button('确认替换课表','confirm-import','primary-btn')+'</div>';
  }else text+='<div class="alert-box">'+(importState.text.trim()?'已读出文字，但尚未识别到完整课程条目。这份 PDF 的版式与当前适配格式不同；可查看下方原文，再手动添加课程。':'这份 PDF 没有可读取的文字层，可能是扫描图片。本 demo 暂不支持图片文字识别。')+'</div>'+button('手动添加课程','add','secondary-btn','style="margin-top:15px"');
  if(importState.text)text+='<details><summary>查看 PDF 提取的原文</summary><textarea class="extracted-text" readonly aria-label="PDF 提取文字">'+esc(importState.text)+'</textarea><p class="fine-print">支持文字版 PDF：当前可识别带星期列、12 节编号及课程元数据的横向表格，以及同一行含课程名、星期和节次的简单文字条目。其他格式请手动添加；扫描图片暂不支持。</p></details>';
  return text+'</div>';
}
function renderImport(){
  main.innerHTML=heading('让你的课表，来到这里。','从你学校的教务系统导出，再在手机上查看。')+'<div class="import-layout"><div><section class="upload-card"><button class="upload-zone" data-action="upload" '+(importState?.busy?'disabled':'')+'><span class="upload-icon">'+icon('import')+'</span><strong>选择课表文件</strong><small>点击选择，或拖动文件到这里<br>文字版 PDF / Kim课表 JSON 备份 · 最大 10 MB</small></button><p class="local-privacy">'+icon('shield')+' PDF 在本机读取，不上传文件</p><div class="import-bottom">'+button(icon('download')+'导出当前备份','backup','secondary-btn')+button(icon('plus')+'手动添加课程','add','secondary-btn')+'</div><div class="alert-box">当前支持带星期列和 12 节编号的横向文字表格，以及同一行包含课程名、星期和节次的简单文字条目。不同学校的格式可能无法识别，可手动添加课程；扫描图片暂不支持。</div></section>'+resultHtml()+'</div><aside class="white-card"><h3>三步，把课表装进口袋</h3><div class="step"><span class="step-number">01</span><div><h4>打开你学校的教务系统</h4><p>在学校网站登录，打开个人课表。无需在 Kim课表输入学校密码。</p></div></div><div class="step"><span class="step-number">02</span><div><h4>导出文字版课表 PDF</h4><p>使用教务系统的导出功能。无法导出或格式不支持时，可以手动添加。</p></div></div><div class="step"><span class="step-number">03</span><div><h4>读取并确认</h4><p>选择文件，检查名称、教室、节次和周次，确认后替换当前课表。</p></div></div><p class="fine-print">学校课程有调整时，请重新导出并导入。使用前请在设置中填写学校、学期起始日和每日作息。备忘录会随 JSON 备份一起恢复。</p></aside></div>';
}
function timeFields(times){
  return times.map((t,i)=>'<label class="time-fields"><span>'+(i+1)+'节</span><input type="time" name="time-start-'+i+'" value="'+esc(t[0])+'" required aria-label="第'+(i+1)+'节开始时间"><input type="time" name="time-end-'+i+'" value="'+esc(t[1])+'" required aria-label="第'+(i+1)+'节结束时间"></label>').join('');
}
function applyAppearance(value){
  const root=document.documentElement;
  for(const [name,color] of Object.entries({...themeTokens(value.color),...readingTokens(value)}))root.style.setProperty(name,color);
  root.style.setProperty('--background-blur',value.blur+'px');
  root.style.setProperty('--user-background',value.background?'url("'+value.background+'")':'none');
  document.body.classList.toggle('has-background',!!value.background);
  document.body.classList.toggle('reading-bold',value.bold);
  document.body.classList.add('themed');
  let layer=document.querySelector('#appearance-background');
  if(!layer){layer=document.createElement('div');layer.id='appearance-background';layer.setAttribute('aria-hidden','true');document.body.prepend(layer);}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themeTokens(value.color)['--bg']);
}
function appearanceCard(){
  return '<section id="appearance-form" class="settings-card appearance-card"><h3>主题、背景与文字</h3><p class="appearance-intro">调整后自动生效，随时看看课表效果。</p><div class="theme-presets">'+THEME_PRESETS.map(([name,color])=>button('<i style="background:'+color+'"></i>'+name,'theme-preset','theme-preset','data-color="'+color+'" aria-pressed="'+(appearanceDraft.color===color)+'"')).join('')+'</div><label class="theme-color-field">自定义主题色<input name="themeColor" type="color" value="'+appearanceDraft.color+'"><span data-theme-color>'+appearanceDraft.color+'</span></label><p class="appearance-help">自选颜色会自动柔化，保持清新。</p><div class="appearance-preview" aria-label="外观预览"><div class="appearance-preview-bg"></div><div class="appearance-preview-card"><span>我的课表</span><strong>每一天，心里有数。</strong><span class="appearance-preview-accent">'+icon('plus')+' 添加课程</span></div></div><div class="appearance-background-row"><span data-background-state>'+(appearanceDraft.background?'已选择背景图片':'当前使用纯色背景')+'</span><div>'+button('选择背景图片','choose-background','secondary-btn')+button('调整裁剪','crop-background','inline-link',appearanceDraft.background?'':'hidden')+button('移除','remove-background','inline-link',appearanceDraft.background?'':'hidden')+'</div></div><input id="background-input" type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="appearance-help">选图后可拖动、缩放裁剪，之后也能重新调整。图片仅保存在本机，最大 15 MB。</p><label class="blur-field" for="background-blur">背景虚化<output id="blur-value">'+appearanceDraft.blur+' px</output><input id="background-blur" name="backgroundBlur" type="range" min="0" max="30" step="1" value="'+appearanceDraft.blur+'"></label><label class="blur-field" for="background-mask">背景淡化<output id="mask-value">'+appearanceDraft.mask+'%</output><input id="background-mask" name="backgroundMask" type="range" min="0" max="80" step="1" value="'+appearanceDraft.mask+'"></label><p class="appearance-help">背景越淡，文字越容易读；虚化只作用于图片。</p><div class="reading-controls"><label class="field">字号<select name="fontScale">'+[[1,'标准'],[1.12,'较大'],[1.24,'大']].map(([value,label])=>'<option value="'+value+'" '+(appearanceDraft.fontScale===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="theme-color-field">文字颜色<input name="textColor" type="color" value="'+appearanceDraft.textColor+'"></label><label class="reading-bold-toggle"><input name="bold" type="checkbox" '+(appearanceDraft.bold?'checked':'')+'>加粗文字</label></div><p class="appearance-help">浅色文字用于背景上的标题；课程卡片会自动保持清晰对比。</p><p class="appearance-status" data-appearance-status aria-live="polite">自动应用到课表</p><p class="course-form-error" data-form-error role="alert" hidden></p><div class="form-footer appearance-footer">'+button('恢复默认','reset-appearance','secondary-btn')+button('预览','preview-appearance','primary-btn')+'</div></section>';
}
function updateAppearancePreview(syncColor=true){
  applyAppearance(appearanceDraft);
  const form=main.querySelector('#appearance-form');if(!form)return;
  if(syncColor){form.querySelector('[name="themeColor"]').value=appearanceDraft.color;form.querySelector('[name="textColor"]').value=appearanceDraft.textColor;}
  form.querySelector('[name="backgroundBlur"]').value=appearanceDraft.blur;
  form.querySelector('[name="backgroundMask"]').value=appearanceDraft.mask;
  form.querySelector('[name="fontScale"]').value=appearanceDraft.fontScale;
  form.querySelector('[name="bold"]').checked=appearanceDraft.bold;
  form.querySelector('[data-theme-color]').textContent=appearanceDraft.color;
  form.querySelector('#blur-value').textContent=appearanceDraft.blur+' px';
  form.querySelector('#mask-value').textContent=appearanceDraft.mask+'%';
  form.querySelector('[data-background-state]').textContent=appearanceDraft.background?'已选择背景图片':'当前使用纯色背景';
  form.querySelector('[data-action="remove-background"]').hidden=!appearanceDraft.background;
  form.querySelector('[data-action="crop-background"]').hidden=!appearanceDraft.background;
  for(const preset of form.querySelectorAll('.theme-preset'))preset.setAttribute('aria-pressed',String(preset.dataset.color===appearanceDraft.color));
  form.querySelector('[data-form-error]').hidden=true;
}
async function commitAppearance(){
  const revision=++appearanceRevision,next=normalizeAppearance(appearanceDraft);
  appearance=next;appearanceDraft={...next};updateAppearancePreview();
  try{await rememberAppearance(next);if(revision===appearanceRevision)main.querySelector('[data-appearance-status]')?.replaceChildren(document.createTextNode('自动应用到课表'));}
  catch{
    if(revision!==appearanceRevision)return;
    const message='本机存储不可用，本次外观无法记住。请移除背景或检查存储空间。',error=main.querySelector('#appearance-form [data-form-error]');
    if(error){error.textContent=message;error.hidden=false;}else toast(message);
  }
}
function updateAppearanceInput(target){
  const key={themeColor:'color',textColor:'textColor',backgroundBlur:'blur',backgroundMask:'mask',fontScale:'fontScale',bold:'bold'}[target.name];
  if(!key)return false;
  appearanceDraft[key]=key==='color'?softenColor(target.value):key==='bold'?target.checked:['blur','mask','fontScale'].includes(key)?Number(target.value):target.value;
  updateAppearancePreview(!['themeColor','textColor'].includes(target.name));return true;
}
document.addEventListener('input',event=>{if(event.target.closest('#appearance-form'))updateAppearanceInput(event.target);});
async function editBackgroundCrop(file){
  const form=main.querySelector('#appearance-form');if(!form||backgroundBusy)return;
  const controls=form.querySelectorAll('[data-action="choose-background"],[data-action="crop-background"],[data-action="remove-background"],[data-action="reset-appearance"],[data-action="preview-appearance"]');
  backgroundBusy=true;controls.forEach(button=>button.disabled=true);
  form.querySelector('[data-appearance-status]').textContent='正在准备裁剪…';
  try{
    const source=file?await prepareBackground(file):appearanceDraft.backgroundSource||appearanceDraft.background;
    if(!source||!form.isConnected)return;
    const result=await openBackgroundCrop(source,{initial:file?null:appearanceDraft.backgroundCrop});
    if(!form.isConnected)return;
    if(result){appearanceDraft.background=result.background;appearanceDraft.backgroundSource=source;appearanceDraft.backgroundCrop=result.crop;await commitAppearance();}
    else form.querySelector('[data-appearance-status]').textContent='已取消裁剪，背景未更换';
  }catch(err){
    if(form.isConnected){const error=form.querySelector('[data-form-error]');error.textContent=err.message;error.hidden=false;form.querySelector('[data-appearance-status]').textContent='图片未更换';}
  }finally{backgroundBusy=false;controls.forEach(button=>button.disabled=false);}
}
document.addEventListener('change',async event=>{
  if(!event.target.closest('#appearance-form'))return;
  if(updateAppearanceInput(event.target)){await commitAppearance();return;}
  if(event.target.id!=='background-input'||!event.target.files[0]||backgroundBusy)return;
  const file=event.target.files[0];event.target.value='';await editBackgroundCrop(file);
});
function showAppearancePreview(){
  const start=weekStart(selectedWeek,state.settings),courses=state.courses.filter(c=>activeInWeek(c,selectedWeek));
  const days=showWeekends||courses.some(c=>c.day>5)?DAYS:DAYS.slice(0,5);
  const periodRows='grid-template-rows:repeat('+state.settings.times.length+',var(--row))';
  openSheet('课表预览','<div class="appearance-preview-stage"><div class="appearance-preview-bg"></div><div class="preview-heading"><h2>每一天，心里有数。</h2><p>第 '+selectedWeek+' 周 · '+esc(state.settings.term)+'</p></div><div class="calendar-panel"><div role="region" tabindex="0" aria-label="课程网格，可左右滑动" class="calendar '+(days.length===5?'weekdays-only':'')+'"><div class="day-heads"><span class="month-head">'+(dateFrom(start).getMonth()+1)+'月</span>'+days.map((day,index)=>'<div class="day-head"><span>周'+day+'</span><span class="day-number">'+dateFrom(addDays(start,index)).getDate()+'</span></div>').join('')+'</div><div class="schedule-body"><div class="periods" style="'+periodRows+'">'+state.settings.times.map((times,index)=>'<div class="period"><span>'+String(index+1).padStart(2,'0')+'</span><small class="period-time"><span>'+times[0]+'</span><span>'+times[1]+'</span></small></div>').join('')+'</div><div class="course-grid" style="'+periodRows+'">'+days.map((_,index)=>'<div class="column-bg" style="grid-column:'+(index+1)+'"></div>').join('')+courses.map(c=>'<div class="course-block color-'+c.color+'" style="grid-column:'+c.day+';grid-row:'+c.start+' / '+(c.end+1)+'"><strong>'+esc(c.name)+'</strong><span>'+esc(c.room||'教室待填写')+'</span><span class="course-period">'+c.start+'–'+c.end+'节</span></div>').join('')+'</div></div></div></div></div><div class="form-footer">'+button('返回设置','close-sheet','primary-btn')+'</div>');
}
function renderSettings(){
  const s=state.settings;
  main.innerHTML=heading('按你的节奏，来安排。','外观、学校、学期与课表数据，都在这里管理。')+'<div class="content-column">'+appearanceCard()+'<form id="settings-form" class="settings-card"><h3>学校、学期与作息</h3><div class="form-grid"><label class="field full">学校名称<input name="school" maxlength="60" required placeholder="我的学校" value="'+esc(s.school)+'"></label><label class="field full">学期名称<input name="term" maxlength="60" required value="'+esc(s.term)+'"></label><label class="field">第 1 周的星期一<input type="date" name="startDate" required value="'+s.startDate+'"></label><label class="field">学期总周数<input type="number" name="totalWeeks" min="1" max="30" required value="'+s.totalWeeks+'"></label><label class="field full">每天的节数<select name="periodCount">'+options(6,16,s.times.length,' 节')+'</select></label></div><p class="fine-print">请按你学校的校历与作息表修改。第一周起始日必须是星期一；新增节次请填写时间，已有课程使用的节次不能被移除。</p><details><summary>修改每天 <span id="period-count-label">'+s.times.length+'</span> 节的作息时间</summary><div id="time-fields" style="margin-top:12px">'+timeFields(s.times)+'</div></details><div class="form-footer">'+button('保存设置','submit-settings','primary-btn')+'</div></form><section class="settings-card"><h3>我的课表数据</h3><div class="settings-row"><div><h4>导出课表备份</h4><p>保存课程、备忘录、学校、学期和作息，方便迁移或恢复。</p></div>'+button('导出 JSON','backup','secondary-btn')+'</div><div class="settings-row"><div><h4>恢复备份 / 导入 PDF</h4><p>先预览并确认，再替换已有课表。兼容旧版备份。</p></div>'+button('前往导入','goto-import','secondary-btn')+'</div><div class="settings-row"><div><h4>恢复示例课表</h4><p>替换为演示课程，恢复示例学期与作息，保留学校名称与备忘录。</p></div>'+button('恢复示例','reset-demo','danger-btn')+'</div></section><section class="settings-card"><h3>像 App 一样打开</h3><div class="install-banner"><p class="install-info">在安卓 Chrome 浏览器打开本页，点右上角菜单，选择“添加到主屏幕”或“安装应用”，就能从手机桌面打开。</p>'+(deferredInstall?button('添加到手机桌面','install','primary-btn','style="margin-top:14px"'):'')+'</div><p class="fine-print">这是手机网页版 demo。个人课表与备忘录保存在当前浏览器；清除浏览器数据会移除保存内容。建议定期导出备份。</p></section></div>';
}
function render(){
  courseSelection=null;selectionDrag=null;
  if(route!=='settings'){appearanceDraft={...appearance};applyAppearance(appearance);}
  renderNav();
  ({week:renderWeek,today:renderToday,memos:renderMemos,import:renderImport,settings:renderSettings})[route]();
}
function navigate(key){if(route===key)render();else location.hash=key;}
function openSheet(title,body){document.querySelector('#sheet-content').innerHTML='<div class="sheet-header"><h2>'+title+'</h2>'+button(icon('close'),'close-sheet','icon-btn','aria-label="关闭弹窗"')+'</div><div class="sheet-body">'+body+'</div>';sheet.showModal();}
function showDetail(id){
  const c=state.courses.find(c=>c.id===id);if(!c)return;
  openSheet('课程详情','<div class="course-detail-color color-'+c.color+'"><h2>'+esc(c.name)+'</h2><p>星期'+DAYS[c.day-1]+' · '+c.start+'–'+c.end+'节 · '+when(c)+'</p></div><div class="detail-row">'+icon('pin')+'<span>教室</span>'+esc(c.room||'待填写')+'</div><div class="detail-row">'+icon('person')+'<span>教师</span>'+esc(c.teacher||'待填写')+'</div><div class="detail-row">'+icon('week')+'<span>周次</span>'+weeksText(c)+'</div>'+(c.note?'<p class="detail-note">'+esc(c.note)+'</p>':'')+'<div class="form-footer">'+button('删除课程','delete-course','danger-btn','data-id="'+esc(c.id)+'"')+button('编辑课程','edit-course','primary-btn','data-id="'+esc(c.id)+'"')+'</div>');
}
function options(start,end,value,suffix=''){let out='';for(let n=start;n<=end;n++)out+='<option value="'+n+'" '+(n===value?'selected':'')+'>'+n+suffix+'</option>';return out;}
function editCourse(id=null,candidateIndex=null,preset=null){
  const c=candidateIndex!==null?importState.courses[candidateIndex]:state.courses.find(c=>c.id===id)||{name:'',day:dayOf(selectedDate),start:1,end:2,weekFrom:1,weekTo:state.settings.totalWeeks,parity:'all',room:'',teacher:'',color:'sage',note:'',...preset};
  const periodCount=candidateIndex!==null?(importState.type==='json'?importState.settings.times.length:16):state.settings.times.length;
  if(sheet.open)sheet.close();
  openSheet(candidateIndex!==null?'确认候选课程':id?'编辑课程':'添加课程',
    '<form id="course-form" data-id="'+esc(id||'')+'" data-candidate="'+(candidateIndex??'')+'"><div class="form-grid"><label class="field full">课程名称<input name="name" required maxlength="80" placeholder="例如：高等数学 A" value="'+esc(c.name)+'"></label><label class="field full">星期<select name="day">'+DAYS.map((d,i)=>'<option value="'+(i+1)+'" '+(c.day===i+1?'selected':'')+'>星期'+d+'</option>').join('')+'</select></label><label class="field">开始节次<select name="start">'+options(1,periodCount,c.start,'节')+'</select></label><label class="field">结束节次<select name="end">'+options(1,periodCount,c.end,'节')+'</select></label><label class="field">开始周次<input name="weekFrom" type="number" min="1" max="30" value="'+c.weekFrom+'" required></label><label class="field">结束周次<input name="weekTo" type="number" min="1" max="30" value="'+c.weekTo+'" required></label><label class="field full">单双周<select name="parity"><option value="all" '+(c.parity==='all'?'selected':'')+'>每周上课</option><option value="odd" '+(c.parity==='odd'?'selected':'')+'>仅单周</option><option value="even" '+(c.parity==='even'?'selected':'')+'>仅双周</option></select></label><label class="field full">指定周次（选填，优先于开始/结束周次）<input name="weekSpec" maxlength="100" placeholder="例如 1-2,4-16 或 4,8,12,16" value="'+esc(formatWeekSpec(c.weeks).replace(/、/g,','))+'"></label><label class="field">教室<input name="room" maxlength="100" placeholder="A 教学楼 203" value="'+esc(c.room)+'"></label><label class="field">教师<input name="teacher" maxlength="60" placeholder="教师姓名" value="'+esc(c.teacher)+'"></label><label class="field full">备注<textarea name="note" maxlength="1000" placeholder="给这门课留一点备忘">'+esc(c.note)+'</textarea></label><div class="field full">课程颜色<div class="color-options">'+COLORS.map(color=>'<button type="button" class="color-option color-'+color+' '+(color===c.color?'selected':'')+'" data-action="pick-color" data-color="'+color+'" aria-label="'+({sage:'草绿',lavender:'浅紫',peach:'浅橙',blue:'浅蓝',rose:'浅粉',yellow:'浅黄'}[color])+'色" aria-pressed="'+(color===c.color)+'"></button>').join('')+'</div><input type="hidden" name="color" value="'+c.color+'"></div></div><div class="course-form-error" data-form-error role="alert" hidden></div><div class="form-footer">'+button('取消','close-sheet','secondary-btn')+'<button type="submit" class="primary-btn">保存课程</button></div></form>');
}
function backup(){
  const data={format:'kim-timetable-v1',savedAt:new Date().toISOString(),settings:state.settings,courses:state.courses,memos:state.memos};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='Kim课表备份-'+localDate()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('课表备份已生成');
}
function confirmReplace(kind){
  if(sheet.open)sheet.close();
  openSheet(kind==='demo'?'恢复示例课表':'确认替换当前课表','<p class="install-info">'+(kind==='demo'?'当前课程、学期与作息将恢复为演示数据，学校名称与备忘录会保留。':'已选择的课程将替换当前课表。请确认你已检查所有时间和周次。'+(importState?.memos!==undefined?' 当前备忘录也将替换为备份中的 '+importState.memos.length+' 条。':'现有备忘录会保留。'))+'操作前可导出备份。</p><div class="form-footer">'+button('导出备份','backup','secondary-btn')+button('取消','close-sheet','secondary-btn')+button('确认替换',kind==='demo'?'do-reset':'do-import','primary-btn')+'</div>');
}
async function readFile(file){
  if(!file)return;
  navigate('import');
  if(file.size>10*1024*1024){importState={error:'文件超过 10 MB，请导出仅包含个人课表的文件。'};render();return;}
  importState={busy:true};render();
  let pdf=null;
  try{
    if(/\.json$/i.test(file.name)){
      const data=importBackup(await file.text());
      importState={...data,filename:file.name,type:'json',text:''};
    }else if(/\.pdf$/i.test(file.name)||file.type==='application/pdf'){
      const pdfjs=await import('./vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('此文件不是有效的 PDF。');
      pdf=await pdfjs.getDocument({data:bytes,cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/wasm/',import.meta.url).href,isEvalSupported:false}).promise;
      if(pdf.numPages>40)throw new Error('PDF 超过 40 页，请导出个人课表，而非全校课程清单。');
      const texts=[],tableResults=[];
      for(let n=1;n<=pdf.numPages;n++){
        const page=await pdf.getPage(n),content=await page.getTextContent();
        const items=pageItems(content.items,page.getViewport({scale:1}).transform);
        const table=parseTimetablePage(items);
        if(table.supported)tableResults.push(table);
        texts.push(textLines(items));
        page.cleanup();
      }
      const text=texts.join('\n\n').slice(0,150000),parsed=tableResults.length?{courses:tableResults.flatMap(t=>t.courses),errors:tableResults.flatMap(t=>t.errors)}:parseCourseLines(text);
      if(parsed.courses.length>300)throw new Error('识别课程超过 300 条，请选择个人课表。');
      importState={filename:file.name,type:'pdf',pages:pdf.numPages,text,courses:parsed.courses,unrecognized:parsed.unrecognized,errors:parsed.errors,adapter:tableResults.length?'12 节横向表格识别':''};
    }else throw new Error('请选择 PDF 或本应用导出的 JSON 备份。');
  }catch(err){
    importState={error:err.name==='PasswordException'?'此 PDF 已加密，请先导出未加密的课表。':err.message||'读取失败，请重新导出后重试。'};
  }finally{if(pdf)await pdf.destroy();render();}
}
document.addEventListener('click',async(event)=>{
  if(event.target.closest('.course-picker')&&suppressSelectionClick){suppressSelectionClick=false;return;}
  const el=event.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action;
  try{
    if(action==='theme-preset'){appearanceDraft.color=softenColor(el.dataset.color);await commitAppearance();}
    else if(action==='choose-background')document.querySelector('#background-input').click();
    else if(action==='crop-background')await editBackgroundCrop();
    else if(action==='remove-background'){appearanceDraft.background='';appearanceDraft.backgroundSource='';appearanceDraft.backgroundCrop=null;await commitAppearance();}
    else if(action==='reset-appearance'){appearanceDraft={...DEFAULT_APPEARANCE};await commitAppearance();}
    else if(action==='preview-appearance'){await commitAppearance();showAppearancePreview();}
    else if(action==='toggle-weekends'){showWeekends=!showWeekends;render();}
    else if(action==='prev-week'){selectedWeek=clampWeek(selectedWeek-1);render();}
    else if(action==='next-week'){selectedWeek=clampWeek(selectedWeek+1);render();}
    else if(action==='current-week'){selectedWeek=clampWeek(weekOf(localDate(),state.settings));render();}
    else if(action==='choose-week')openSheet('选择教学周','<div class="week-grid">'+Array.from({length:state.settings.totalWeeks},(_,i)=>'<button class="week-option '+(selectedWeek===i+1?'active':'')+'" data-action="set-week" data-week="'+(i+1)+'">'+(i+1)+'周</button>').join('')+'</div>');
    else if(action==='set-week'){selectedWeek=Number(el.dataset.week);sheet.close();render();}
    else if(action==='close-sheet')sheet.close();
    else if(action.startsWith('goto-'))navigate(action.slice(5));
    else if(action==='detail')showDetail(el.dataset.id);
    else if(action==='add')editCourse();
    else if(action==='select-course-range')selectCourseRange(Number(el.dataset.day),Number(el.dataset.period));
    else if(action==='add-selected-course'&&courseSelection){
      if(el.getAttribute('aria-disabled')==='true')toast('所选范围已有课程，请拖动调整。');
      else editCourse(null,null,courseSelection);
    }
    else if(action==='cancel-course-range')clearCourseSelection();
    else if(action==='edit-course')editCourse(el.dataset.id);
    else if(action==='edit-candidate')editCourse(null,Number(el.dataset.index));
    else if(action==='add-memo')editMemo();
    else if(action==='edit-memo')editMemo(el.dataset.id);
    else if(action==='filter-memos'){memoFilter=el.dataset.filter;render();}
    else if(action==='toggle-memo'){
      const m=state.memos.find(m=>m.id===el.dataset.id);if(!m)return;
      persist({...state,memos:state.memos.map(item=>item.id===m.id?normalizeMemo({...item,completed:!item.completed,updatedAt:new Date().toISOString()}):item)});render();toast(m.completed?'已重新打开备忘':'备忘已完成');
    }
    else if(action==='delete-memo'){
      const m=state.memos.find(m=>m.id===el.dataset.id);if(!m)return;
      if(sheet.open)sheet.close();
      openSheet('删除这条备忘？','<p class="install-info">将删除“'+esc(m.title)+'”。</p><div class="form-footer">'+button('取消','close-sheet','secondary-btn')+button('确认删除','do-delete-memo','danger-btn','data-id="'+esc(m.id)+'"')+'</div>');
    }
    else if(action==='do-delete-memo'){persist({...state,memos:state.memos.filter(m=>m.id!==el.dataset.id)});sheet.close();render();toast('备忘已删除');}
    else if(action==='pick-color'){
      const form=el.closest('form');form.elements.color.value=el.dataset.color;
      form.querySelectorAll('.color-option').forEach(b=>{b.classList.toggle('selected',b===el);b.setAttribute('aria-pressed',String(b===el));});
    }
    else if(action==='delete-course'){
      const c=state.courses.find(c=>c.id===el.dataset.id);if(!c)return;
      sheet.close();openSheet('删除这门课程？','<p class="install-info">将移除“'+esc(c.name)+'”在星期'+DAYS[c.day-1]+'的这条课程安排。</p><div class="form-footer">'+button('取消','close-sheet','secondary-btn')+button('确认删除','do-delete','danger-btn','data-id="'+esc(c.id)+'"')+'</div>');
    }
    else if(action==='do-delete'){persist({...state,courses:state.courses.filter(c=>c.id!==el.dataset.id)});sheet.close();render();toast('课程已删除');}
    else if(action==='prev-day'){selectedDate=addDays(selectedDate,-1);render();}
    else if(action==='next-day'){selectedDate=addDays(selectedDate,1);render();}
    else if(action==='pick-date'){selectedDate=el.dataset.date;render();}
    else if(action==='current-day'){selectedDate=localDate();render();}
    else if(action==='upload'){fileInput.value='';fileInput.click();}
    else if(action==='backup')backup();
    else if(action==='confirm-import'){
      const courses=importState?.courses.filter(c=>c.selected!==false)||[];
      if(!courses.length&&importState?.type!=='json')throw new Error('请至少选择一条课程');
      if(courseConflicts(courses).length)throw new Error('课程时间有冲突，请先修改或取消勾选');
      confirmReplace('import');
    }
    else if(action==='do-import'){
      const courses=importState.courses.filter(c=>c.selected!==false).map(normalizeCourse);
      const settings=importState.type==='json'?importState.settings:state.settings;
      persist({...state,courses,settings,memos:importState.memos??state.memos,demo:false});selectedWeek=clampWeek(weekOf(localDate(),settings));sheet.close();importState=null;navigate('week');toast('已保存 '+courses.length+' 条课程');
    }
    else if(action==='reset-demo')confirmReplace('demo');
    else if(action==='do-reset'){persist({...state,courses:clone(DEMO_COURSES),settings:{...clone(DEFAULT_SETTINGS),school:state.settings.school},demo:true});selectedWeek=clampWeek(weekOf(localDate(),state.settings));sheet.close();render();toast('已恢复示例课表');}
    else if(action==='submit-settings')document.querySelector('#settings-form').requestSubmit();
    else if(action==='install'&&deferredInstall){await deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;render();}
  }catch(err){toast(err.message);}
});
document.addEventListener('submit',async(event)=>{
  const form=event.target;if(!['course-form','settings-form','memo-form'].includes(form.id))return;
  event.preventDefault();
  try{
    const data=Object.fromEntries(new FormData(form).entries());
    if(form.id==='memo-form'){
      const previous=state.memos.find(m=>m.id===form.dataset.id);
      if(form.dataset.id&&!previous)throw new Error('这条备忘已不存在');
      if(!previous&&state.memos.length>=500)throw new Error('最多保存 500 条备忘，请先整理已有内容');
      const m=normalizeMemo({...previous,...data,updatedAt:new Date().toISOString()});
      persist({...state,memos:previous?state.memos.map(item=>item.id===m.id?m:item):[...state.memos,m]});
      if(!previous)memoFilter='pending';sheet.close();render();toast('备忘已保存');
    }else if(form.id==='course-form'){
      const previous=form.dataset.candidate!==''?importState.courses[Number(form.dataset.candidate)]:state.courses.find(c=>c.id===form.dataset.id);
      const c=normalizeCourse({...previous,...data,id:form.dataset.id||undefined,weeks:data.weekSpec?.trim()?parseWeekSpec(data.weekSpec):undefined});
      if(form.dataset.candidate!==''){
        importState.courses[Number(form.dataset.candidate)]={...c,selected:importState.courses[Number(form.dataset.candidate)].selected};
      }else{
        if(c.weekTo>state.settings.totalWeeks)throw new Error('课程周次超出了学期总周数，请先调整学期设置');
        const courses=[...state.courses.filter(existing=>existing.id!==c.id),c];
        const conflict=courseConflicts(courses).find(pair=>pair.some(existing=>existing.id===c.id));
        if(conflict)throw new Error('与“'+conflict.find(existing=>existing.id!==c.id).name+'”的上课时间冲突');
        persist({...state,courses});
      }
      sheet.close();render();toast('课程已保存');
    }else{
      const count=Number(data.periodCount);
      const times=Array.from({length:count},(_,i)=>[data['time-start-'+i],data['time-end-'+i]]);
      const settings=normalizeSettings({...state.settings,...data,times});
      // Form-only fields must not be persisted.
      Object.keys(settings).filter(k=>k.startsWith('time-')).forEach(k=>delete settings[k]);
      delete settings.periodCount;
      persist({...state,settings});selectedWeek=clampWeek(selectedWeek);render();toast('学期与作息已更新');
    }
  }catch(err){
    const error=form.querySelector('[data-form-error]');
    if(error){error.textContent=err.message;error.hidden=false;}else toast(err.message);
  }
});
document.addEventListener('change',event=>{
  if(event.target.matches('[data-candidate]'))importState.courses[Number(event.target.dataset.candidate)].selected=event.target.checked;
  if(event.target.matches('#settings-form [name="periodCount"]')){
    const form=event.target.form,count=Number(event.target.value);
    const times=Array.from({length:count},(_,i)=>[form.elements['time-start-'+i]?.value||'',form.elements['time-end-'+i]?.value||'']);
    form.querySelector('#time-fields').innerHTML=timeFields(times);
    form.querySelector('#period-count-label').textContent=count;
    form.querySelector('#time-fields').closest('details').open=true;
  }
});
document.addEventListener('dragover',event=>{const zone=event.target.closest('.upload-zone');if(zone){event.preventDefault();zone.classList.add('dragover');}});
document.addEventListener('dragleave',event=>event.target.closest('.upload-zone')?.classList.remove('dragover'));
document.addEventListener('drop',event=>{if(event.target.closest('.upload-zone')){event.preventDefault();if(!importState?.busy)readFile(event.dataTransfer.files[0]);}});
fileInput.addEventListener('change',()=>readFile(fileInput.files[0]));
sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)sheet.close();}});
window.addEventListener('hashchange',()=>{route=navs.some(n=>n[0]===location.hash.slice(1))?location.hash.slice(1):'week';if(sheet.open)sheet.close();render();window.scrollTo({top:0});});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;if(route==='settings')render();});
window.addEventListener('appinstalled',()=>{deferredInstall=null;toast('已添加到手机桌面');});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&['week','memos'].includes(route)&&!sheet.open)render();});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
route=navs.some(n=>n[0]===location.hash.slice(1))?location.hash.slice(1):'week';render();
if(storageWarning)toast(storageWarning);
