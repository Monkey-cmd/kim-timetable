import {normalizeMemos} from './memos.js';
export const COLORS = ['sage','lavender','peach','blue','rose','yellow'];
export const DAYS = ['一','二','三','四','五','六','日'];
export const DEFAULT_TIMES = [
  ['08:00','08:45'],['08:55','09:40'],['10:00','10:45'],['10:55','11:40'],
  ['13:00','13:45'],['13:55','14:40'],['15:00','15:45'],['15:55','16:40'],
  ['18:00','18:45'],['18:55','19:40'],['19:50','20:35'],['20:45','21:30']
];
export const DEFAULT_SETTINGS = { school:'上海大学',term:'2026–2027 秋季学期',startDate:'2026-09-14',totalWeeks:18,times:DEFAULT_TIMES };
export const DEMO_COURSES = [
  {id:'demo-1',name:'高等数学 A',day:1,start:1,end:2,weekFrom:1,weekTo:16,parity:'all',room:'A 教学楼 203',teacher:'陈老师',color:'sage',note:'示例课程，请以个人课表为准。'},
  {id:'demo-2',name:'大学英语',day:1,start:5,end:6,weekFrom:1,weekTo:16,parity:'all',room:'C 教学楼 301',teacher:'李老师',color:'lavender'},
  {id:'demo-3',name:'程序设计基础',day:2,start:3,end:4,weekFrom:1,weekTo:16,parity:'all',room:'计算机中心 302',teacher:'王老师',color:'blue'},
  {id:'demo-4',name:'线性代数',day:2,start:7,end:8,weekFrom:1,weekTo:16,parity:'all',room:'A 教学楼 105',teacher:'周老师',color:'peach'},
  {id:'demo-5',name:'高等数学 A',day:3,start:1,end:2,weekFrom:1,weekTo:16,parity:'all',room:'A 教学楼 203',teacher:'陈老师',color:'sage'},
  {id:'demo-6',name:'大学体育',day:3,start:5,end:6,weekFrom:1,weekTo:16,parity:'all',room:'体育馆',teacher:'刘老师',color:'yellow'},
  {id:'demo-7',name:'大学英语',day:4,start:3,end:4,weekFrom:1,weekTo:16,parity:'all',room:'C 教学楼 301',teacher:'李老师',color:'lavender'},
  {id:'demo-8',name:'中国近现代史纲要',day:4,start:9,end:10,weekFrom:1,weekTo:16,parity:'all',room:'B 教学楼 102',teacher:'赵老师',color:'rose'},
  {id:'demo-9',name:'程序设计实验',day:5,start:5,end:8,weekFrom:2,weekTo:16,parity:'even',room:'计算机中心 205',teacher:'王老师',color:'blue'}
];
export function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function localDate(date = new Date()) {
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function dateFrom(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error('日期格式应为 YYYY-MM-DD');
  const [y,m,d] = value.split('-').map(Number), result = new Date(y,m-1,d,12);
  if(result.getFullYear()!==y || result.getMonth()!==m-1 || result.getDate()!==d) throw new Error('日期无效');
  return result;
}
export function addDays(value, days) { const date = dateFrom(value); date.setDate(date.getDate()+days); return localDate(date); }
export function daysBetween(a,b) {
  const x=dateFrom(a),y=dateFrom(b);
  return Math.round((Date.UTC(y.getFullYear(),y.getMonth(),y.getDate())-Date.UTC(x.getFullYear(),x.getMonth(),x.getDate()))/86400000);
}
export function weekOf(date,settings) { return Math.floor(daysBetween(settings.startDate,date)/7)+1; }
export function dayOf(date) { return (dateFrom(date).getDay()+6)%7+1; }
export function weekStart(week,settings) { return addDays(settings.startDate,(week-1)*7); }
export function activeInWeek(course,week) {
  return week>=course.weekFrom && week<=course.weekTo && (!course.weeks||course.weeks.includes(week)) && (course.parity==='all' || (course.parity==='odd' && week%2===1) || (course.parity==='even' && week%2===0));
}
export function parseWeekSpec(text){
  const input=String(text).replace(/[～~—–至]/g,'-').replace(/[第周\s]/g,'');
  if(!input||!/^\d+(?:-\d+)?(?:[,，、]\d+(?:-\d+)?)*$/.test(input)) throw new Error('周次格式无效，例如 1-2,4-16 或 4,8,12,16');
  const weeks=new Set();
  for(const part of input.split(/[,，、]/)){
    const [start,end=start]=part.split('-').map(Number);
    if(start<1||end>30||start>end)throw new Error('指定周次必须在 1–30 之间');
    for(let week=start;week<=end;week++)weeks.add(week);
  }
  return [...weeks].sort((a,b)=>a-b);
}
export function formatWeekSpec(weeks){
  if(!weeks?.length)return '';
  const runs=[];let start=weeks[0],end=start;
  for(const week of weeks.slice(1)){if(week===end+1)end=week;else{runs.push(start===end?String(start):start+'–'+end);start=end=week;}}
  runs.push(start===end?String(start):start+'–'+end);return runs.join('、');
}
export function coursesOn(courses,date,settings) { return courses.filter(c=>c.day===dayOf(date) && activeInWeek(c,weekOf(date,settings))).sort((a,b)=>a.start-b.start); }
export function normalizeCourse(raw,index=0) {
  if(!raw || typeof raw!=='object') throw new Error('课程数据无效');
  const c = {
    id:typeof raw.id==='string' && raw.id.length<100?raw.id:crypto.randomUUID(),
    name:String(raw.name||'').trim().slice(0,80),day:Number(raw.day),start:Number(raw.start),end:Number(raw.end),
    weekFrom:Number(raw.weekFrom??1),weekTo:Number(raw.weekTo??18),parity:raw.parity??'all',
    room:String(raw.room||'').slice(0,100),teacher:String(raw.teacher||'').slice(0,60),
    color:COLORS.includes(raw.color)?raw.color:COLORS[index%COLORS.length],note:String(raw.note||'').slice(0,1000)
  };
  if(!c.name) throw new Error('请填写课程名称');
  if(!Number.isInteger(c.day)||c.day<1||c.day>7) throw new Error('星期必须在 1–7 之间');
  if(!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<1||c.end>12||c.start>c.end) throw new Error('节次必须在 1–12 之间，结束节次不能早于开始');
  if(!Number.isInteger(c.weekFrom)||!Number.isInteger(c.weekTo)||c.weekFrom<1||c.weekTo>30||c.weekFrom>c.weekTo) throw new Error('课程周次必须在 1–30 之间');
  if(!['all','odd','even'].includes(c.parity)) throw new Error('单双周设置无效');
  if(raw.weeks!=null){
    if(!Array.isArray(raw.weeks)||!raw.weeks.length||raw.weeks.some(w=>!Number.isInteger(w)||w<1||w>30)) throw new Error('指定周次无效');
    c.weeks=[...new Set(raw.weeks)].sort((a,b)=>a-b);
    c.weekFrom=c.weeks[0];c.weekTo=c.weeks.at(-1);
  }
  if(raw.campus)c.campus=String(raw.campus).slice(0,80);
  if(raw.code)c.code=String(raw.code).slice(0,40);
  return c;
}
export function normalizeSettings(raw) {
  const s={...clone(DEFAULT_SETTINGS),...raw};
  dateFrom(s.startDate);
  if(dayOf(s.startDate)!==1) throw new Error('第一周起始日请选择星期一');
  s.totalWeeks=Number(s.totalWeeks);
  if(!Number.isInteger(s.totalWeeks)||s.totalWeeks<1||s.totalWeeks>30) throw new Error('学期周数必须在 1–30 之间');
  s.term=String(s.term||'我的学期').slice(0,60);
  if(!Array.isArray(s.times)||s.times.length!==12) throw new Error('需要 12 节的作息时间');
  let previousEnd=-1;
  for(const t of s.times){
    if(!Array.isArray(t)||t.length!==2||t.some(v=>!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))) throw new Error('作息时间无效');
    const [start,end]=t.map(timeMinutes);
    if(start>=end||start<previousEnd) throw new Error('各节作息时间不能重叠，结束应晚于开始');
    previousEnd=end;
  }
  return s;
}
export function timeMinutes(time){ return Number(time.split(':')[0])*60+Number(time.split(':')[1]); }
export function courseConflicts(courses) {
  const conflicts=[];
  for(let i=0;i<courses.length;i++) for(let j=i+1;j<courses.length;j++){
    const a=courses[i],b=courses[j];
    if(a.day!==b.day || a.end<b.start || b.end<a.start) continue;
    for(let week=Math.max(a.weekFrom,b.weekFrom);week<=Math.min(a.weekTo,b.weekTo);week++){
      if(activeInWeek(a,week)&&activeInWeek(b,week)){conflicts.push([a,b]);break;}
    }
  }
  return conflicts;
}
export function importBackup(text) {
  const data=JSON.parse(text);
  if(!Array.isArray(data.courses)||data.courses.length>300) throw new Error('请选择本应用导出的备份文件（最多 300 条课程）');
  const courses=data.courses.map(normalizeCourse);
  // Give each row a fresh identity to avoid duplicate or user-supplied identifiers.
  courses.forEach(c=>c.id=crypto.randomUUID());
  return {courses,settings:normalizeSettings(data.settings||DEFAULT_SETTINGS),...(data.memos!==undefined?{memos:normalizeMemos(data.memos)}:{})};
}
export function parseCourseLines(text) {
  const courses=[], unrecognized=[];
  const lines=String(text).replace(/[～~—–]/g,'-').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  for(const line of lines){
    const day=line.match(/(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/);
    const period=line.match(/第?\s*(\d{1,2})\s*(?:[-至到]\s*(\d{1,2}))?\s*节/);
    const weeks=line.match(/(?:第\s*)?(\d{1,2})\s*-\s*(\d{1,2})\s*周/);
    if(!day||!period){unrecognized.push(line);continue;}
    const parity=/单周|\(单\)|（单）/.test(line)?'odd':/双周|\(双\)|（双）/.test(line)?'even':'all';
    let name=line.slice(0,day.index).replace(/课程(?:名称)?[:：]?/g,'').replace(/[|·,，;；\s]+$/,'').trim();
    if(!name){unrecognized.push(line);continue;}
    const teacher=line.match(/(?:教师|老师)[:：]\s*([^|·,，;；\s]+)/);
    const room=line.match(/(?:教室|地点)[:：]\s*([^|·,，;；]+)/);
    try {
      const course=normalizeCourse({name,day:'1234567'.includes(day[1])?Number(day[1]):day[1]==='天'?7:'一二三四五六日'.indexOf(day[1])+1,
        start:Number(period[1]),end:Number(period[2]||period[1]),weekFrom:weeks?Number(weeks[1]):1,weekTo:weeks?Number(weeks[2]):18,
        parity,teacher:teacher?.[1]||'',room:room?.[1]?.trim()||'',note:'PDF 文字识别结果，请逐项确认。'},courses.length);
      // Unsupported scattered weeks are never silently treated as a continuous range.
      if(/\d+\s*[,，、]\s*\d+.*周/.test(line)){unrecognized.push(line);continue;}
      course.day=day[1]==='天'?7:course.day;
      if(!courses.some(c=>c.name===course.name&&c.day===course.day&&c.start===course.start&&c.end===course.end&&c.weekFrom===course.weekFrom&&c.weekTo===course.weekTo&&c.parity===course.parity)) courses.push(course);
    } catch { unrecognized.push(line); }
  }
  return {courses,unrecognized};
}
