const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Keep a dragged block's length; resizing an edge always leaves at least one period.
export function adjustSelection(selection,mode,delta,periodCount){
  const {start,end}=selection;
  if(mode==='start')return {...selection,start:clamp(start+delta,1,end)};
  if(mode==='end')return {...selection,end:clamp(end+delta,start,periodCount)};
  const next=clamp(start+delta,1,periodCount-(end-start));
  return {...selection,start:next,end:next+end-start};
}

export function dragPeriodDelta(fromY,toY,gridHeight,periodCount){
  return Math.round((toY-fromY)/(gridHeight/periodCount));
}
