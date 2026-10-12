const MAX_MEMOS=500;

function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  if(year<1||month<1||month>12||day<1) return false;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  return day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}

function timestamp(value,fallback) {
  if(value===undefined) return fallback;
  if(typeof value!=='string'||!validDate(value.slice(0,10))||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)||
    !Number.isFinite(Date.parse(value))) throw new Error('备忘录时间无效');
  return value;
}

export function normalizeMemo(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('备忘录数据无效');
  if(typeof raw.title!=='string'||!raw.title.trim()) throw new Error('请填写备忘录标题');
  const title=raw.title.trim();
  if(title.length>80) throw new Error('备忘录标题最多 80 字');
  const body=raw.body===undefined?'':raw.body;
  if(typeof body!=='string'||body.length>3000) throw new Error('备忘录内容最多 3000 字');
  const dueDate=raw.dueDate===undefined?'':raw.dueDate;
  if(dueDate!==''&&!validDate(dueDate)) throw new Error('备忘录日期无效，请使用 YYYY-MM-DD');
  const completed=raw.completed===undefined?false:raw.completed;
  if(typeof completed!=='boolean') throw new Error('备忘录完成状态无效');
  let id=raw.id;
  if(id===undefined) id=crypto.randomUUID();
  else if(typeof id!=='string'||!id.trim()||id.length>100||/[\u0000-\u001f\u007f]/.test(id)) throw new Error('备忘录 ID 无效');
  const now=new Date().toISOString();
  return {id,title,body,dueDate,completed,createdAt:timestamp(raw.createdAt,now),updatedAt:timestamp(raw.updatedAt,now)};
}

export function normalizeMemos(raw) {
  if(!Array.isArray(raw)||raw.length>MAX_MEMOS) throw new Error('备忘录数据应为数组，最多 500 条');
  const memos=raw.map(normalizeMemo),ids=new Set();
  for(const memo of memos){
    if(ids.has(memo.id)) throw new Error('备忘录 ID 重复');
    ids.add(memo.id);
  }
  return memos;
}

export function memoStatus(memo,today) {
  if(memo.completed) return 'completed';
  if(!memo.dueDate) return 'undated';
  if(!validDate(today)) throw new Error('今天的日期无效');
  return memo.dueDate<today?'overdue':memo.dueDate===today?'today':'upcoming';
}

export function sortMemos(memos) {
  return [...memos].sort((a,b)=>Number(a.completed)-Number(b.completed)||
    Number(!a.dueDate)-Number(!b.dueDate)||a.dueDate.localeCompare(b.dueDate)||
    Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id));
}
