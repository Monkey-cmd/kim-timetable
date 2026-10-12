import {normalizeCourse,parseWeekSpec,COLORS} from './core.js';

// Work in rendered page coordinates, including rotated landscape PDFs.
export function pageItems(items,transform){
  return items.filter(i=>i.str?.trim()&&i.transform).map(i=>{
    const x=i.transform[4],y=i.transform[5];
    return {text:i.str,x:transform[0]*x+transform[2]*y+transform[4],y:transform[1]*x+transform[3]*y+transform[5],width:i.width,height:i.height};
  });
}
export function textLines(items){
  const rows=[];
  for(const item of items){
    let row=rows.find(r=>Math.abs(r.y-item.y)<2.5);
    if(!row){row={y:item.y,items:[]};rows.push(row);}
    row.items.push(item);
  }
  return rows.sort((a,b)=>a.y-b.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')).join('\n');
}
export function parseShuPage(items){
  const dayHeaders=items.filter(i=>/^星期[一二三四五六日天]$/.test(i.text.trim())).sort((a,b)=>a.x-b.x);
  if(dayHeaders.length!==7||dayHeaders.some((i,n)=>i.text.trim()!=='星期'+['一','二','三','四','五','六','日'][n]))return {supported:false,courses:[],errors:[]};
  const headerY=dayHeaders.reduce((sum,i)=>sum+i.y,0)/7,centers=dayHeaders.map(i=>i.x+i.width/2);
  if(dayHeaders.some(i=>Math.abs(i.y-headerY)>4))return {supported:false,courses:[],errors:[]};
  const step=(centers[6]-centers[0])/6,left=centers[0]-step/2;
  const column=(item)=>{
    const center=item.x+Math.min(item.width,step-5)/2;
    if(center<left||center>centers[6]+step/2)return 0;
    return Math.min(7,Math.max(1,Math.floor((center-left)/step)+1));
  };
  const periods=new Map(items.filter(i=>i.x<left && i.y>headerY && /^\d{1,2}$/.test(i.text.trim()) && Number(i.text)>=1 && Number(i.text)<=12).map(i=>[Number(i.text),i.y]));
  if(periods.size!==12)return {supported:false,courses:[],errors:[]};
  const markers=items.filter(i=>i.y>headerY && column(i) && /[（(]\d{1,2}-\d{1,2}节[）)]/.test(i.text.replace(/\s/g,'')));
  const courses=[],errors=[],courseColors=new Map();
  for(const marker of markers){
    try{
      const day=column(marker),clean=marker.text.replace(/\s/g,''),period=clean.match(/[（(](\d{1,2})-(\d{1,2})节[）)]/);
      const start=Number(period[1]),end=Number(period[2]);
      // Exported tables have merged cells and uneven row heights. The bold
      // course headings identify cell boundaries more reliably than period centers.
      const columnMarkers=markers.filter(i=>column(i)===day).sort((a,b)=>a.y-b.y);
      const index=columnMarkers.indexOf(marker),previousY=columnMarkers[index-1]?.y??headerY,next=columnMarkers[index+1];
      const headings=(from,to)=>items.filter(i=>column(i)===day&&i.y>from+2&&i.y<to-2&&i.height>=8.5);
      const titles=headings(previousY,marker.y);
      if(!titles.length)throw new Error('无法定位课程标题');
      const top=Math.min(...titles.map(i=>i.y));
      const nextTitles=next?headings(marker.y,next.y):[];
      const bottom=nextTitles.length?Math.min(...nextTitles.map(i=>i.y)):periods.get(12)+44;
      const cell=items.filter(i=>column(i)===day&&i.y>=top-2&&i.y<bottom-2).sort((a,b)=>Math.abs(a.y-b.y)<2.5?a.x-b.x:a.y-b.y);
      const raw=textLines(cell).replace(/\s/g,'');
      const periodMatch=raw.match(/[（(](\d{1,2})-(\d{1,2})节[）)]/);
      if(!periodMatch)throw new Error('无法定位课程节次');
      const header=raw.slice(0,periodMatch.index),code=header.match(/[（(]([A-Z]{2,}\d{4,})[）)]/)?.[1]||'';
      const name=header.replace(/[（(][A-Z]{2,}\d{4,}[）)]/g,'').trim();
      const meta=raw.slice(periodMatch.index+periodMatch[0].length),weekSpec=meta.split('/')[0],weeks=parseWeekSpec(weekSpec);
      const field=(label)=>meta.match(new RegExp('(?:'+label+')[:：]([^/]+)'))?.[1]||'';
      const campus=field('校区'),room=field('场地|教室'),teacher=field('教师'),credits=field('学分'),remark=field('选课备注');
      if(!name||!room||!teacher)throw new Error('课程名称、教室或教师不完整');
      if(!courseColors.has(code||name))courseColors.set(code||name,COLORS[courseColors.size%COLORS.length]);
      const c=normalizeCourse({name,code,campus,day,start,end,weeks,weekFrom:weeks[0],weekTo:weeks.at(-1),parity:'all',room,teacher,
        color:courseColors.get(code||name),note:[campus?'校区：'+campus:'',credits?'学分：'+credits:'',remark?'备注：'+remark:''].filter(Boolean).join('；')});
      courses.push(c);
    }catch(error){errors.push({day:column(marker),message:error.message});}
  }
  return {supported:true,courses,errors,markerCount:markers.length};
}
