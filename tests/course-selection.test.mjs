import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustSelection,dragPeriodDelta} from '../web-source/course-selection.js';

test('moving snaps in both directions and preserves the selected duration at boundaries',()=>{
  const range={day:3,start:3,end:5};
  assert.deepEqual(adjustSelection(range,'move',2,12),{day:3,start:5,end:7});
  assert.deepEqual(adjustSelection(range,'move',-20,12),{day:3,start:1,end:3});
  assert.deepEqual(adjustSelection(range,'move',20,12),{day:3,start:10,end:12});
  assert.deepEqual(range,{day:3,start:3,end:5});
});

test('either edge can expand or shrink, without inversion or leaving the timetable',()=>{
  const range={day:7,start:3,end:5};
  assert.equal(adjustSelection(range,'start',-20,6).start,1);
  assert.equal(adjustSelection(range,'start',20,6).start,5);
  assert.equal(adjustSelection(range,'end',-20,6).end,3);
  assert.equal(adjustSelection(range,'end',20,6).end,6);
  assert.equal(adjustSelection(range,'end',20,16).end,16);
});

test('pointer offsets use the current rendered row height for desktop and mobile',()=>{
  assert.equal(dragPeriodDelta(100,121,540,12),0);
  assert.equal(dragPeriodDelta(100,145,540,12),1);
  assert.equal(dragPeriodDelta(100,4,768,16),-2);
});
