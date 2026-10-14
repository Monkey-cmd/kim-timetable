import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_APPEARANCE,THEME_PRESETS,normalizeAppearance,softenColor,themeTokens,contrast,readingTokens,createAppearanceWriter} from '../web-source/appearance.js';

test('appearance defaults and saved image survive independently of timetable settings',()=>{
  assert.deepEqual(normalizeAppearance(),DEFAULT_APPEARANCE);
  const data={color:'#879fbd',background:'data:image/jpeg;base64,/9j/AA==',blur:0};
  assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(data))),{...DEFAULT_APPEARANCE,...data});
});
test('old appearance keeps its image and gains safe reading defaults',()=>{
  const old={color:'#9bafc7',background:'data:image/png;base64,AAAA',blur:12};
  const upgraded=normalizeAppearance(old);
  assert.equal(upgraded.background,old.background);assert.equal(upgraded.blur,12);
  assert.equal(upgraded.fontScale,1);assert.equal(upgraded.mask,45);
  for(const value of [{fontScale:2},{textColor:'white'},{bold:'true'},{mask:81},{mask:-1}])assert.throws(()=>normalizeAppearance(value));
});
test('paper text remains readable even when the user selects light text for the background',()=>{
  for(const color of ['#ffffff','#ffcc00','#253e35','#000000']){
    const tokens=readingTokens(normalizeAppearance({textColor:color,fontScale:1.24,bold:true,mask:80}));
    assert.ok(contrast(tokens['--paper-text'],'#ffffff')>=7);
    assert.ok(contrast(tokens['--paper-muted'],'#ffffff')>=4.5);
    assert.equal(tokens['--font-scale'],'1.24');assert.equal(tokens['--reading-mask'],'0.8');
  }
});
test('automatic preference changes preserve order and snapshot values during slow writes',async()=>{
  const written=[];let release;
  const writer=createAppearanceWriter(async text=>{if(!written.length){written.push(JSON.parse(text));await new Promise(resolve=>{release=resolve;});}else written.push(JSON.parse(text));});
  const first=writer({mask:10});await Promise.resolve();await Promise.resolve();
  const secondValue={mask:80},second=writer(secondValue);secondValue.mask=0;
  assert.deepEqual(written,[{mask:10}]);release();await Promise.all([first,second]);
  assert.deepEqual(written,[{mask:10},{mask:80}]);
});
test('a failed preference write does not prevent the next change from being remembered',async()=>{
  let attempts=0;const written=[];
  const writer=createAppearanceWriter(async text=>{if(++attempts===1)throw new Error('storage unavailable');written.push(JSON.parse(text));});
  await assert.rejects(writer({mask:10}));await writer({mask:20});assert.deepEqual(written,[{mask:20}]);
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
