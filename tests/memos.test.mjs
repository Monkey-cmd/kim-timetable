import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMemo,normalizeMemos,memoStatus,sortMemos} from '../www/memos.js';

const memo=(changes={})=>normalizeMemo({id:'memo-1',title:'交实验报告',body:'附上测量数据',dueDate:'2026-10-12',completed:false,createdAt:'2026-10-01T08:00:00.000Z',updatedAt:'2026-10-11T08:00:00.000Z',...changes});

test('new memos default optional fields and generate valid identity and timestamps',()=>{
  const result=normalizeMemo({title:'  买教材  '});
  assert.equal(result.title,'买教材');
  assert.equal(result.body,'');
  assert.equal(result.dueDate,'');
  assert.equal(result.completed,false);
  assert.match(result.id,/^[a-f0-9-]{36}$/);
  assert.equal(new Date(result.createdAt).toISOString(),result.createdAt);
  assert.equal(result.createdAt,result.updatedAt);
});

test('backup round trip preserves memo identity, text, status, dates and creation time',()=>{
  const source=memo({body:'第一行\n第二行',completed:true,extra:'不保存'});
  const restored=normalizeMemos(JSON.parse(JSON.stringify([source])));
  assert.deepEqual(restored,[source]);
  assert.equal('extra' in restored[0],false);
  const edited=normalizeMemo({...source,title:'报告已提交',updatedAt:'2026-10-12T10:00:00+08:00'});
  assert.equal(edited.id,source.id);
  assert.equal(edited.createdAt,source.createdAt);
  assert.equal(edited.updatedAt,'2026-10-12T10:00:00+08:00');
});

test('due dates reject impossible days and accept leap-year dates',()=>{
  assert.equal(memo({dueDate:'2024-02-29'}).dueDate,'2024-02-29');
  assert.equal(memo({dueDate:'2000-02-29'}).dueDate,'2000-02-29');
  for(const dueDate of ['2026-02-29','1900-02-29','2026-04-31','2026-13-01','2026-01-00','0000-01-01','2026-1-12','2026-10-12T00:00:00Z',null,123]){
    assert.throws(()=>memo({dueDate}));
  }
});

test('invalid fields are rejected without silently shortening or coercing user data',()=>{
  for(const title of ['', '   ', 'x'.repeat(81),123,null]) assert.throws(()=>memo({title}));
  assert.equal(memo({title:'x'.repeat(80),body:'x'.repeat(3000)}).body.length,3000);
  for(const body of [null,12,'x'.repeat(3001)]) assert.throws(()=>memo({body}));
  for(const completed of ['false',0,1,null]) assert.throws(()=>memo({completed}));
  for(const id of ['', ' ', null, 5, 'x'.repeat(101), 'a\nb']) assert.throws(()=>memo({id}));
  for(const date of ['bad','2026-02-30T10:00:00.000Z','2026-10-12T25:00:00.000Z','2026-10-12',null]){
    assert.throws(()=>memo({createdAt:date}));
    assert.throws(()=>memo({updatedAt:date}));
  }
});

test('memo collections enforce the size cap and reject duplicate identifiers',()=>{
  assert.deepEqual(normalizeMemos([]),[]);
  assert.throws(()=>normalizeMemos({}));
  assert.throws(()=>normalizeMemos([memo(),memo({title:'另一项'})]));
  const rows=Array.from({length:500},(_,i)=>memo({id:'memo-'+i}));
  assert.equal(normalizeMemos(rows).length,500);
  assert.throws(()=>normalizeMemos([...rows,memo({id:'memo-500'})]));
});

test('status separates overdue, today, future, undated and completed items',()=>{
  assert.equal(memoStatus(memo({dueDate:'2026-10-11'}),'2026-10-12'),'overdue');
  assert.equal(memoStatus(memo(),'2026-10-12'),'today');
  assert.equal(memoStatus(memo({dueDate:'2026-10-13'}),'2026-10-12'),'upcoming');
  assert.equal(memoStatus(memo({dueDate:''}),'2026-10-12'),'undated');
  assert.equal(memoStatus(memo({completed:true,dueDate:'2026-10-11'}),'2026-10-12'),'completed');
});

test('sorting places open dated items first and completed items last without changing input',()=>{
  const rows=[
    memo({id:'done',completed:true,dueDate:'2026-10-01'}),
    memo({id:'undated',dueDate:'',updatedAt:'2026-10-12T08:00:00.000Z'}),
    memo({id:'later',dueDate:'2026-10-13'}),
    memo({id:'today-old',updatedAt:'2026-10-11T02:00:00.000Z'}),
    memo({id:'today-new',updatedAt:'2026-10-11T11:00:00+08:00'}),
    memo({id:'overdue',dueDate:'2026-10-11'})
  ];
  const originalIds=rows.map(row=>row.id);
  assert.deepEqual(sortMemos(rows).map(row=>row.id),['overdue','today-new','today-old','later','undated','done']);
  assert.deepEqual(rows.map(row=>row.id),originalIds);
});
