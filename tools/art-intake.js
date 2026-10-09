// Art intake: run by .github/workflows/art.yml when an "art" or "art-draft" issue is opened from Pixel Studio / HL Studio.
// Reads the design code from the issue body, checks it, and adds it to art/library.json (live in the app)
// or art/drafts.json (saved, not in the app). Writes a preview PNG and a reply for the issue.
// Types: head (32x32 pixels), logo (16x16 pixels), kit (jersey colours/pattern), pbg (a built-in player background, recoloured).
const fs=require('fs'),zlib=require('zlib');
const body=process.env.BODY||'',labels=JSON.parse(process.env.LABELS||'[]'),draft=labels.includes('art-draft');
const reply=t=>fs.writeFileSync('.art-result.md',t);
function fail(why){reply(`❌ **Couldn't add this design.** ${why}\n\nFix it in Pixel Studio and press *Submit* again (or edit this issue's code).`);process.exit(1)}

// 1. find the JSON (inside a ```json block, or the first {...} / [...])
let raw=(body.match(/```(?:json)?\s*([\s\S]*?)```/)||[])[1];
if(!raw){const a=body.search(/[\[{]/),b=Math.max(body.lastIndexOf('}'),body.lastIndexOf(']'));if(a>=0&&b>a)raw=body.slice(a,b+1)}
if(!raw)fail('No design code found in the issue.');
let d;try{d=JSON.parse(raw)}catch(_){fail("The code isn't valid JSON.")}
const items=Array.isArray(d)?d:[d];
if(!items.length)fail('No designs in the code.');

// 2. what the app already has (read from index.html so this never drifts from the app)
const app=fs.readFileSync('index.html','utf8');
const arr=name=>{const m=app.match(new RegExp(`const ${name}=(\\[.*?\\]);`));if(!m)fail(`Internal: couldn't read ${name} from index.html.`);return Function('return '+m[1])()};
const BUILTIN={
  head:new Set([...app.matchAll(/\{id:'([a-z0-9]+)'/g)].map(m=>m[1])),
  logo:new Set(arr('LOGOS').map(x=>x[0])),
  kit:new Set([...(app.match(/const KITDEF=\{([\s\S]*?)\};/)||['',''])[1].matchAll(/(?:^|[{,\s])([a-z0-9]+):\{n:/g)].map(m=>m[1]).concat('scout')),
  pbg:new Set(Object.keys(JSON.parse((app.match(/const PBG_CSS=(\{.*?\});\n/)||fail("Internal: couldn't read PBG_CSS from index.html."))[1])))};
const PBG_CSS=JSON.parse(app.match(/const PBG_CSS=(\{.*?\});\n/)[1]);
const KIT_PATS=arr('KIT_PATS'),KIT_FONTS=arr('KIT_FONTS');
const HEX6=/^#[0-9a-fA-F]{6}$/,HEX=/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const SIZE={head:32,logo:16},WHAT={head:'head',logo:'team logo',kit:'kit',pbg:'player background'};

// 3. check each design
const seen=new Set();
for(const x of items){
  if(!x||!WHAT[x.type])fail(`Unknown type "${x&&x.type}". Use head, logo, kit or pbg.`);
  const t=x.type,w=WHAT[t];
  if(!/^[a-z0-9]{2,20}$/.test(x.id||''))fail(`The id "${x.id}" must be 2–20 lowercase letters or numbers.`);
  if(BUILTIN[t].has(x.id))fail(`The id "${x.id}" is already used by a built-in ${w}. Pick another name.`);
  if(seen.has(t+':'+x.id))fail(`The ${w} id "${x.id}" appears twice in this code.`);seen.add(t+':'+x.id);
  if(!x.name||String(x.name).length>20)fail('The name must be 1–20 characters.');
  if(!['rare','epic','leg'].includes(x.rarity))fail('Rarity must be rare, epic or leg.');
  if(!['shop','none'].includes(x.where))fail('Where must be shop or none.');
  if(t==='head'||t==='logo'){const N=SIZE[t];
    if(!Array.isArray(x.px)||x.px.length!==N||x.px.some(r=>typeof r!=='string'||r.length!==N))fail(`A ${w} grid must be exactly ${N} rows of ${N} characters.`);
    if(!x.pal||typeof x.pal!=='object')fail('The palette (pal) is missing.');
    for(const [k,v] of Object.entries(x.pal))if(k.length!==1||k==='.'||!HEX6.test(v))fail(`Palette entry "${k}": "${v}" isn't a #rrggbb colour.`);
    const bad=[...new Set(x.px.join('').replace(/\./g,''))].filter(c=>!(c in x.pal));if(bad.length)fail(`These letters aren't in the palette: ${bad.join(' ')}`);
    if(!x.px.join('').replace(/\./g,'').length)fail('The design is empty.')}
  if(t==='kit'){
    for(const f of ['b','t','num'])if(!HEX6.test(x[f]||''))fail(`Kit colour "${f}" must be a #rrggbb colour.`);
    if(x.ns!=null&&!HEX6.test(x.ns))fail('Kit colour "ns" (number outline) must be a #rrggbb colour.');
    if(!KIT_PATS.includes(x.pat))fail(`Kit pattern "${x.pat}" isn't one the app draws. Use one of: ${KIT_PATS.join(', ')}.`);
    if(x.font!=null&&!KIT_FONTS.includes(x.font))fail(`Kit font "${x.font}" isn't one the app loads. Use one of: ${KIT_FONTS.join(' | ')} (or leave it out).`);
    if(x.sw!=null&&!(typeof x.sw==='number'&&x.sw>=0&&x.sw<=8))fail('Kit "sw" (number outline width) must be a number from 0 to 8.');
    if(x.fw!=null&&!(Number.isInteger(x.fw)&&x.fw>=100&&x.fw<=900))fail('Kit "fw" (font weight) must be a whole number from 100 to 900.')}
  if(t==='pbg'){
    if(!BUILTIN.pbg.has(x.base))fail(`The base "${x.base}" isn't a built-in player background.`);
    if(!x.colors||typeof x.colors!=='object'||!Object.keys(x.colors).length)fail('A player background needs at least one colour swap in "colors".');
    const baseCols=new Set([...PBG_CSS[x.base][0].matchAll(/(?:#|%23)([0-9a-fA-F]{6})([0-9a-fA-F]{2})?(?![0-9a-fA-F])/g)].flatMap(m=>[('#'+m[1]).toLowerCase(),m[2]?('#'+m[1]+m[2]).toLowerCase():null]).filter(Boolean));
    for(const [k,v] of Object.entries(x.colors)){
      if(!HEX.test(k)||!HEX.test(v))fail(`Colour swap "${k}" → "${v}": both must be #rrggbb or #rrggbbaa.`);
      if(!baseCols.has(k.toLowerCase()))fail(`The colour ${k} isn't in the "${x.base}" background.`)}}
}

// 4. save: replace any design with the same type and id
const clean=x=>{const o={type:x.type,id:x.id,name:String(x.name),rarity:x.rarity,where:x.where};
  if(x.type==='head'||x.type==='logo'){o.pal=x.pal;o.px=x.px}
  if(x.type==='kit'){o.b=x.b.toLowerCase();o.t=x.t.toLowerCase();o.num=x.num.toLowerCase();o.pat=x.pat;if(x.ns!=null)o.ns=x.ns.toLowerCase();for(const f of ['sw','font','fw'])if(x[f]!=null)o[f]=x[f]}
  if(x.type==='pbg'){o.base=x.base;o.colors=Object.fromEntries(Object.entries(x.colors).map(([k,v])=>[k.toLowerCase(),v.toLowerCase()]))}
  return o};
const same=(a,b)=>(a.type||'head')===b.type&&a.id===b.id;
const file=draft?'art/drafts.json':'art/library.json';
let lib=[];try{lib=JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){}
for(const x of items){
  const c=clean(x),i=lib.findIndex(y=>same(y,x));if(i>=0)lib[i]=c;else lib.push(c);
  if(!draft){// a draft that goes live leaves the drafts list
    try{const dr=JSON.parse(fs.readFileSync('art/drafts.json','utf8')).filter(y=>!same(y,x));fs.writeFileSync('art/drafts.json',JSON.stringify(dr,null,0)+'\n')}catch(_){}}
}
fs.writeFileSync(file,JSON.stringify(lib)+'\n');

// 5. new app version so phones pick it up on next open
if(!draft){const sw=fs.readFileSync('sw.js','utf8').replace(/habit-league-v(\d+)/,(m,n)=>'habit-league-v'+(+n+1));fs.writeFileSync('sw.js',sw)}

// 6. preview PNGs: heads and logos drawn with the auto outline on a dark tile; kits and backgrounds as colour swatches
function png(w,h,rgba){const crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcT[n]=c>>>0}
  const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0};
  const chunk=(t,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(t),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  const rows=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){rows[y*(w*4+1)]=0;rgba.copy(rows,y*(w*4+1)+1,y*w*4,(y+1)*w*4)}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])}
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
// draw a grid of '#rrggbb'/null at k pixels per cell
function gridPng(G,k){const H=G.length,W=G[0].length,buf=Buffer.alloc(W*k*H*k*4);
  for(let y=0;y<H*k;y++)for(let i=0;i<W*k;i++){const c=G[Math.floor(y/k)][Math.floor(i/k)],[r,g,b]=hex(c||'#141b2e'),o=(y*W*k+i)*4;buf[o]=r;buf[o+1]=g;buf[o+2]=b;buf[o+3]=255}
  return png(W*k,H*k,buf)}
const outlined=G=>{const n=G.length,out=G.map(r=>r.slice());for(let y=0;y<n;y++)for(let i=0;i<n;i++)if(!G[y][i]&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>G[y+b]&&G[y+b][i+a]))out[y][i]='#140b06';return out};
// a row of colour swatches, each 6 cells wide with a 1-cell dark gap
const swatches=cols=>{const G=Array.from({length:10},()=>Array(cols.length*7+1).fill(null));cols.forEach((c,i)=>{for(let y=1;y<9;y++)for(let k=0;k<6;k++)G[y][1+i*7+k]=c.slice(0,7)});return G};
fs.mkdirSync('art/previews',{recursive:true});
const prevName=x=>x.type==='head'?x.id:`${x.type}-${x.id}`;
for(const x of items){let out;
  if(x.type==='head'||x.type==='logo')out=gridPng(outlined(x.px.map(r=>[...r].map(c=>c==='.'?null:x.pal[c]))),x.type==='head'?8:16);
  if(x.type==='kit')out=gridPng(swatches([x.b,x.t,x.num].concat(x.ns?[x.ns]:[])),8);
  if(x.type==='pbg')out=gridPng(swatches(Object.values(x.colors)),8);
  fs.writeFileSync(`art/previews/${prevName(x)}.png`,out)}

// 7. reply + commit message
const repo=process.env.GITHUB_REPOSITORY||'Krismcnulty/habit-league',sha=process.env.GITHUB_REF_NAME||'main';
const pics=items.map(x=>`![${x.name}](https://raw.githubusercontent.com/${repo}/${sha}/art/previews/${prevName(x)}.png)`).join(' ');
const names=items.map(x=>`**${x.name}**${x.type==='head'?'':` (${WHAT[x.type]})`}`).join(', ');
reply(draft?`💾 Saved ${names} to the repo drafts (\`art/drafts.json\`). It isn't in the app. Open it from **Repo drafts** in Pixel Studio on any device.\n\n${pics}`
  :`✅ Added ${names} to the app (\`art/library.json\`)${items.some(x=>x.where==='shop')?'. It joins the Item Shop pool and will turn up on random days.':', held back (not for sale).'} Live in about a minute; reopen the app to see it.\n\n${pics}`);
fs.writeFileSync('.art-commit-msg',`${draft?'Art draft':'Add art'}: ${items.map(x=>x.name).join(', ')}`);
