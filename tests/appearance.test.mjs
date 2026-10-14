import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_APPEARANCE,THEME_PRESETS,normalizeAppearance,softenColor,themeTokens,contrast} from '../web-source/appearance.js';

test('appearance defaults and saved image survive independently of timetable settings',()=>{
  assert.deepEqual(normalizeAppearance(),DEFAULT_APPEARANCE);
  const data={color:'#879fbd',background:'data:image/jpeg;base64,/9j/AA==',blur:0};
  assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(data))),data);
});
test('invalid colors, blur and nonlocal or executable image sources are rejected',()=>{
  for(const data of [{color:'red'},{color:'#000000;display:none'},{blur:31},{blur:-1},{blur:1.5},{background:'https://example.com/image.jpg'},{background:'data:image/svg+xml;base64,AAAA'},{background:'data:image/png;base64,'+'A'.repeat(1200000)}])assert.throws(()=>normalizeAppearance(data));
});
test('vivid colors become soft, stable tones while presets remain unchanged',()=>{
  for(const [,color] of THEME_PRESETS)assert.equal(softenColor(color),color);
  for(const color of ['#ff0000','#00ff00','#0000ff','#ffff00','#000000','#ffffff']){
    const softened=softenColor(color);
    assert.notEqual(softened,color);assert.equal(softenColor(softened),softened);
  }
});
test('theme button and text colors keep readable contrast across custom hues',()=>{
  for(const color of ['#ff0000','#00ff00','#0000ff','#ffffff','#000000',...THEME_PRESETS.map(p=>p[1])]){
    const softened=softenColor(color),tokens=themeTokens(softened);
    assert.ok(contrast(softened,tokens['--on-accent'])>=4.5);
    assert.ok(contrast('#ffffff',tokens['--accent-text'])>=4.5);
  }
});
