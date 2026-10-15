import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCrop,cropSourceRect,moveCrop} from '../web-source/background-crop.js';
import {normalizeAppearance} from '../web-source/appearance.js';

test('portrait crop selects the expected center strip of a landscape image',()=>{
  assert.deepEqual(cropSourceRect(4000,2000,{aspect:.45}),{x:1550,y:0,width:900,height:2000});
  assert.deepEqual(cropSourceRect(4000,2000,{aspect:.45,zoom:2,x:1,y:1}),{x:3550,y:1000,width:450,height:1000});
});
test('all positions and zoom levels keep the selected rectangle inside the source',()=>{
  for(const [w,h] of [[4000,2000],[800,1600],[100,100]])for(const aspect of [.45,1,2])for(const zoom of [1,2,4])for(const x of [0,.5,1])for(const y of [0,.5,1]){
    const r=cropSourceRect(w,h,{aspect,zoom,x,y});
    assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w+.00001&&r.y+r.height<=h+.00001);
    assert.ok(Math.abs(r.width/r.height-aspect)<.00001);
  }
});
test('dragging follows the image, clamps at its edges and cannot reveal blank space',()=>{
  const c={x:.5,y:.5,zoom:2,aspect:.5};
  const moved=moveCrop(c,1000,1000,250,50,-50);
  assert.ok(moved.x<c.x&&moved.y>c.y);
  assert.equal(moveCrop(c,1000,1000,250,100000,0).x,0);
  assert.equal(moveCrop(c,1000,1000,250,-100000,0).x,1);
  assert.equal(moveCrop({aspect:1},1000,1000,250,10,10).x,.5);
});
test('invalid crop geometry and nonlocal original images are rejected',()=>{
  for(const c of [{zoom:0},{zoom:5},{x:-1},{y:2},{aspect:0},{x:NaN},{zoom:Infinity}])assert.throws(()=>normalizeCrop(c));
  assert.throws(()=>cropSourceRect(0,100,{aspect:1}));
  assert.throws(()=>normalizeAppearance({backgroundSource:'https://example.com/photo.jpg'}));
});
test('the original and crop can be reopened after saving, and removed together',()=>{
  const original='data:image/jpeg;base64,AAAA',background='data:image/jpeg;base64,BBBB';
  const value=normalizeAppearance({background,backgroundSource:original,backgroundCrop:{x:.1,y:.8,zoom:2,aspect:.45}});
  assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(value))),value);
  const cleared=normalizeAppearance({...value,background:''});
  assert.equal(cleared.backgroundSource,'');assert.equal(cleared.backgroundCrop,null);
});
