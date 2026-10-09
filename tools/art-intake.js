// Art intake: run by .github/workflows/art.yml when an "art" or "art-draft" issue is opened from HL Studio.
// Reads the Studio code from the issue body, checks it, and adds it to art/library.json (live in the app)
// or art/drafts.json (saved, not in the app). Writes a preview PNG and a reply for the issue.
const fs=require('fs'),zlib=require('zlib');
const N=32,body=process.env.BODY||'',labels=JSON.parse(process.env.LABELS||'[]'),draft=labels.includes('art-draft');
const reply=t=>fs.writeFileSync('.art-result.md',t);
function fail(why){reply(`❌ **Couldn't add this design.** ${why}\n\nFix it in HL Studio and press *Submit* again (or edit this issue's code).`);process.exit(1)}

// 1. find the JSON (inside a ```json block, or the first {...})
let raw=(body.match(/```(?:json)?\s*([\s\S]*?)```/)||[])[1];
if(!raw){const a=body.indexOf('{'),b=body.lastIndexOf('}');if(a>=0&&b>a)raw=body.slice(a,b+1)}
if(!raw)fail('No Studio code found in the issue.');
let d;try{d=JSON.parse(raw)}catch(_){fail("The code isn't valid JSON.")}
const items=Array.isArray(d)?d:[d];

// 2. check each design
const appSrc=fs.readFileSync('index.html','utf8');
for(const x of items){
  if(x.type!=='head')fail(`Only heads are supported so far (got type "${x.type}").`);
  if(!/^[a-z0-9]{2,20}$/.test(x.id||''))fail(`The id "${x.id}" must be 2–20 lowercase letters or numbers.`);
  if(new RegExp(`\\{id:'${x.id}'`).test(appSrc))fail(`The id "${x.id}" is already used by a built-in head. Pick another name.`);
  if(!x.name||String(x.name).length>20)fail('The name must be 1–20 characters.');
  if(!['rare','epic','leg'].includes(x.rarity))fail('Rarity must be rare, epic or leg.');
  if(!['shop','none'].includes(x.where))fail('Where must be shop or none.');
  if(!Array.isArray(x.px)||x.px.length!==N||x.px.some(r=>typeof r!=='string'||r.length!==N))fail('The grid must be exactly 32 rows of 32 characters.');
  for(const [k,v] of Object.entries(x.pal||{}))if(k.length!==1||!/^#[0-9a-fA-F]{6}$/.test(v))fail(`Palette entry "${k}": "${v}" isn't a #rrggbb colour.`);
  const bad=[...new Set(x.px.join('').replace(/\./g,''))].filter(c=>!(c in x.pal));if(bad.length)fail(`These letters aren't in the palette: ${bad.join(' ')}`);
  if(!x.px.join('').replace(/\./g,'').length)fail('The design is empty.');
}

// 3. save: replace any design with the same id
const file=draft?'art/drafts.json':'art/library.json';
let lib=[];try{lib=JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){}
for(const x of items){
  const clean={type:'head',id:x.id,name:String(x.name),rarity:x.rarity,where:x.where,pal:x.pal,px:x.px};
  const i=lib.findIndex(y=>y.id===x.id);if(i>=0)lib[i]=clean;else lib.push(clean);
  if(!draft){// a draft that goes live leaves the drafts list
    try{const dr=JSON.parse(fs.readFileSync('art/drafts.json','utf8')).filter(y=>y.id!==x.id);fs.writeFileSync('art/drafts.json',JSON.stringify(dr,null,0)+'\n')}catch(_){}}
}
fs.writeFileSync(file,JSON.stringify(lib)+'\n');

// 4. new app version so phones pick it up on next open
if(!draft){const sw=fs.readFileSync('sw.js','utf8').replace(/habit-league-v(\d+)/,(m,n)=>'habit-league-v'+(+n+1));fs.writeFileSync('sw.js',sw)}

// 5. preview PNG, drawn the way the app draws it (auto outline), at 8x on a dark tile
function png(w,h,rgba){const crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcT[n]=c>>>0}
  const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0};
  const chunk=(t,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(t),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  const rows=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){rows[y*(w*4+1)]=0;rgba.copy(rows,y*(w*4+1)+1,y*w*4,(y+1)*w*4)}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])}
fs.mkdirSync('art/previews',{recursive:true});
const S=8,hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
for(const x of items){
  const G=x.px.map(r=>[...r].map(c=>c==='.'?null:x.pal[c]));
  const out=G.map(r=>r.slice());for(let y=0;y<N;y++)for(let i=0;i<N;i++)if(!G[y][i]&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>G[y+b]&&G[y+b][i+a]))out[y][i]='#140b06';
  const W=N*S,buf=Buffer.alloc(W*W*4);
  for(let y=0;y<W;y++)for(let i=0;i<W;i++){const c=out[Math.floor(y/S)][Math.floor(i/S)],[r,g,b]=c?hex(c):hex('#141b2e'),o=(y*W+i)*4;buf[o]=r;buf[o+1]=g;buf[o+2]=b;buf[o+3]=255}
  fs.writeFileSync(`art/previews/${x.id}.png`,png(W,W,buf));
}

// 6. reply + commit message
const repo=process.env.GITHUB_REPOSITORY||'Krismcnulty/habit-league',sha=process.env.GITHUB_REF_NAME||'main';
const pics=items.map(x=>`![${x.name}](https://raw.githubusercontent.com/${repo}/${sha}/art/previews/${x.id}.png)`).join(' ');
const names=items.map(x=>`**${x.name}**`).join(', ');
reply(draft?`💾 Saved ${names} to the repo drafts (\`art/drafts.json\`). It isn't in the app. Open it from **Repo drafts** in HL Studio on any device.\n\n${pics}`
  :`✅ Added ${names} to the app (\`art/library.json\`)${items.some(x=>x.where==='shop')?'. It joins the Item Shop pool and will turn up on random days.':', held back (not for sale).'} Live in about a minute; reopen the app to see it.\n\n${pics}`);
fs.writeFileSync('.art-commit-msg',`${draft?'Art draft':'Add art'}: ${items.map(x=>x.name).join(', ')}`);
