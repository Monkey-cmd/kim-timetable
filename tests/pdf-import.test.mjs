import test from 'node:test';
import assert from 'node:assert/strict';
import {pageItems,parseShuPage} from '../www/pdf-import.js';
const labels=['一','二','三','四','五','六','日'];
const item=(text,x,y,height=8)=>({text,x,y,height,width:Math.min(80,text.length*4)});
const headers=labels.map((d,i)=>({...item('星期'+d,100+i*100,50,12),width:36}));
const periods=Array.from({length:12},(_,i)=>item(String(i+1),65,75+i*35,12));
test('rotated PDF text positions map into the displayed table',()=>{
  assert.deepEqual(pageItems([{str:'星期一',transform:[0,12,-12,0,50,100],width:36,height:12}],[0,1,1,0,0,0]),[{text:'星期一',x:100,y:50,width:36,height:12}]);
});
test('merged cells do not mix prior metadata into new course titles',()=>{
  const items=[...headers,...periods,
    item('测试课程A',200,80,9),item('(TEST00001)',200,93,9),item('(1-2节)1-2周,4-16周/校区:测试校区',200,106),
    item('/场地:A101/教师:测试',200,119),item('教师/选课备注:/学分:2.0',200,143),
    item('测试课程B',200,151,9),item('(TEST00002)',200,164,9),item('(3-4节)第6周/校区:测试校区',200,177),
    item('/场地:B202/教师:另',200,190),item('一教师/选课备注:/学分:1.0',200,202)
  ];
  const parsed=parseShuPage(items);
  assert.equal(parsed.supported,true);assert.equal(parsed.courses.length,2);assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.courses[0].teacher,'测试教师');
  assert.equal(parsed.courses[1].name,'测试课程B');
  assert.equal(parsed.courses[1].room,'B202');
  assert.deepEqual(parsed.courses[1].weeks,[6]);
  assert.equal(parsed.courses[0].weeks.includes(3),false);
});
