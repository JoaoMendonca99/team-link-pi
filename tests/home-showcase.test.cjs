const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),sharp=require('sharp')
const exported={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/home/showcase-navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exported})
test('keyboard navigation wraps both showcases and supports Home/End without capturing unrelated keys',()=>{
  for(const count of [2,6,8])for(let current=0;current<count;current++){
    assert.equal(exported.nextShowcaseTab('ArrowRight',current,count),(current+1)%count)
    assert.equal(exported.nextShowcaseTab('ArrowLeft',current,count),(current+count-1)%count)
    assert.equal(exported.nextShowcaseTab('Home',current,count),0)
    assert.equal(exported.nextShowcaseTab('End',current,count),count-1)
    for(const key of ['Tab','Enter','Escape','a'])assert.equal(exported.nextShowcaseTab(key,current,count),null)
  }
  assert.equal(exported.nextShowcaseTab('ArrowRight',0,0),null)
})

test('gallery swipes require horizontal intent and ignore taps and vertical scrolling',()=>{
  for(const [x,y,step] of [[-120,8,1],[120,-8,-1],[-60,0,1],[60,0,-1],[59,0,0],[0,0,0],[20,120,0],[-90,100,0],[-90,-100,0]])assert.equal(exported.showcaseSwipeStep(x,y),step)
})

test('gallery masters exceed native Full HD, stay optimized and contain no embedded metadata',async()=>{
  let total=0
  for(const screen of ['panel','space','activities','team','goals','messages','documents','integrations']){
    const bytes=fs.readFileSync('src/components/home/screens/'+screen+'-full.webp'),image=await sharp(bytes).metadata()
    assert.equal(image.format,'webp');assert.ok(image.width>=1920&&image.height>=1080,screen)
    assert.equal(image.exif,undefined);assert.equal(image.xmp,undefined)
    assert.ok(bytes.length<650_000,screen+' exceeds gallery image budget');total+=bytes.length
  }
  assert.ok(total<3_000_000,'Full gallery should stay below 3 MB; originals are loaded on opening only')
})
test('each real screen has optimized desktop and mobile assets without embedded metadata',async()=>{
  const directory='src/components/home/screens/'
  let total=0
  for(const screen of ['panel','space','activities','team','goals','messages','documents','integrations'])for(const size of ['desktop','mobile']){
    const file=directory+screen+'-'+size+'.webp',bytes=fs.readFileSync(file)
    const image=await sharp(bytes).metadata()
    assert.equal(image.format,'webp');assert.ok(bytes.length<200_000,file+' exceeds image budget')
    assert.equal(image.exif,undefined);assert.equal(image.xmp,undefined)
    assert.ok(image.width>=350&&image.height>=300)
    if(size==='mobile'){assert.ok(image.width<=390);assert.ok(image.height>image.width)}
    total+=bytes.length
  }
  assert.ok(total<1_500_000,'All responsive previews must remain below 1.5 MB combined; only active screens are mounted')
})
