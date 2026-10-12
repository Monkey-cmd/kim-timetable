import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,addDays,weekOf,weekStart,dayOf,activeInWeek,normalizeCourse,normalizeSettings,courseConflicts,parseCourseLines,importBackup,parseWeekSpec,formatWeekSpec} from '../www/core.js';
import {normalizeMemo} from '../www/memos.js';
const sample=(changes={})=>normalizeCourse({name:'测试课程',day:1,start:1,end:2,weekFrom:1,weekTo:18,...changes});
test('date arithmetic works across month, year and leap day boundaries',()=>{
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.equal(addDays('2024-02-28',2),'2024-03-01');
  assert.equal(weekOf('2026-10-11',DEFAULT_SETTINGS),4);
  assert.equal(weekOf('2026-10-12',DEFAULT_SETTINGS),5);
  assert.equal(weekStart(4,DEFAULT_SETTINGS),'2026-10-05');
  assert.equal(dayOf('2026-10-11'),7);
  assert.throws(()=>addDays('2026-02-30',1));
});
test('odd and even recurrences respect start/end boundaries',()=>{
  const c=sample({weekFrom:2,weekTo:6,parity:'even'});
  assert.equal(activeInWeek(c,1),false);
  assert.equal(activeInWeek(c,2),true);
  assert.equal(activeInWeek(c,3),false);
  assert.equal(activeInWeek(c,6),true);
  assert.equal(activeInWeek(c,8),false);
});
test('conflict detection considers recurrence and day as well as periods',()=>{
  assert.equal(courseConflicts([sample({parity:'odd'}),sample({parity:'even'})]).length,0);
  assert.equal(courseConflicts([sample({weekTo:5}),sample({weekFrom:6})]).length,0);
  assert.equal(courseConflicts([sample(),sample({day:2})]).length,0);
  assert.equal(courseConflicts([sample(),sample({start:2,end:3})]).length,1);
});
test('PDF line candidates parse Sunday and reject unsupported scattered weeks',()=>{
  const result=parseCourseLines('高等数学 周一 第1-2节 1-16周 教师:陈老师 教室:A203\n体育 星期天 第5-6节 2-18周 双周\n实验 周二 第3-4节 1-8,10-16周\n这不是课程');
  assert.equal(result.courses.length,2);
  assert.equal(result.courses[0].room,'A203');
  assert.equal(result.courses[1].day,7);
  assert.equal(result.courses[1].parity,'even');
  assert.equal(result.unrecognized.length,2);
});
test('invalid imports cannot become valid saved courses',()=>{
  assert.throws(()=>sample({start:0}));
  assert.throws(()=>sample({start:4,end:2}));
  assert.throws(()=>sample({day:8}));
  assert.throws(()=>importBackup('{"courses":[{"name":"错误","day":1}]}'));
  assert.throws(()=>importBackup('{"courses":"not an array"}'));
  const backup=importBackup(JSON.stringify({courses:[sample({id:'same'}),sample({id:'same',day:2})],settings:DEFAULT_SETTINGS}));
  assert.notEqual(backup.courses[0].id,backup.courses[1].id);
});
test('semester starts on Monday and class times must be chronological',()=>{
  assert.throws(()=>normalizeSettings({...DEFAULT_SETTINGS,startDate:'2026-09-15'}));
  const times=structuredClone(DEFAULT_SETTINGS.times);times[1]=['08:30','09:30'];
  assert.throws(()=>normalizeSettings({...DEFAULT_SETTINGS,times}));
});
test('scattered and interrupted teaching weeks remain exact through backup',()=>{
  assert.deepEqual(parseWeekSpec('第4周,8周,12周,16周'),[4,8,12,16]);
  const c=sample({weeks:parseWeekSpec('1-2周,4-16周')});
  assert.equal(activeInWeek(c,3),false);
  assert.equal(activeInWeek(c,4),true);
  assert.equal(formatWeekSpec(c.weeks),'1–2、4–16');
  const result=importBackup(JSON.stringify({courses:[c],settings:DEFAULT_SETTINGS}));
  assert.equal(activeInWeek(result.courses[0],3),false);
  assert.equal(activeInWeek(sample({weeks:[6]}),5),false);
  assert.equal(activeInWeek(sample({weeks:[6]}),6),true);
  assert.equal(courseConflicts([sample({weeks:[4,8]}),sample({weeks:[3,7]})]).length,0);
});

test('backups distinguish absent memos from an explicit list and preserve memo-only data',()=>{
  const old=importBackup(JSON.stringify({courses:[sample()],settings:DEFAULT_SETTINGS}));
  assert.equal(Object.hasOwn(old,'memos'),false);
  const m=normalizeMemo({title:'写实验报告',body:'附上实验数据',dueDate:'2026-10-14',completed:true});
  const restored=importBackup(JSON.stringify({courses:[],settings:DEFAULT_SETTINGS,memos:[m]}));
  assert.deepEqual(restored.courses,[]);
  assert.deepEqual(restored.memos,[m]);
  assert.deepEqual(importBackup(JSON.stringify({courses:[],memos:[]})).memos,[]);
  assert.throws(()=>importBackup(JSON.stringify({courses:[sample()],memos:[{title:'错误日期',dueDate:'2026-02-30'}]})));
});
