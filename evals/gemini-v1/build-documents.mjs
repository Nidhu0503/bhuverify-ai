#!/usr/bin/env node
// Offline fixtures only. Uses the project's installed Playwright and local Chrome.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(root, '../../package.json'));
const { chromium } = require('@playwright/test');
const dataset = JSON.parse(await readFile(path.join(root, 'dataset.json'), 'utf8'));
const out = path.join(root, 'output/pdf');
const qa = path.join(root, 'tmp/pdfs');
await mkdir(out, { recursive: true });
await mkdir(qa, { recursive: true });
// Embedding the font keeps Hindi shaping reproducible without network requests.
const fontPath = process.env.EVAL_HINDI_FONT || '/Library/Fonts/NotoSansDevanagari-Regular.ttf';
const font = (await readFile(fontPath)).toString('base64');
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const plain = (s) => s.replace(/[—–]/g, '-');
function html(doc) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Hindi;src:url(data:font/ttf;base64,${font})}
  *{box-sizing:border-box}body{margin:0;color:#162c25;font-family:Arial,Hindi,sans-serif}
  @page{size:A4;margin:0}.sheet{width:794px;height:1122px;padding:46px 48px;position:relative;page-break-after:always;background:#fff}
  .sheet:last-child{page-break-after:auto}.banner{background:#064e3b;color:white;padding:17px 20px;font-size:17px;font-weight:bold;line-height:1.5}
  .banner span{display:block;font-size:15px;font-weight:normal}.meta{margin:24px 0 9px;color:#52675e;font-size:13px;letter-spacing:1px}
  h1{font-size:25px;line-height:1.5;margin:0 0 25px;max-width:660px;font-weight:600}
  .body{border-top:2px solid #a7c4b9}.line{padding:12px 10px;font-size:18px;line-height:1.65;border-bottom:1px solid #dce6e0;min-height:49px}
  .narrative .line{padding:11px 10px}.mild-blur .body{filter:blur(.62px);opacity:.87}
  .mask{display:inline-block;background:#777;width:215px;height:23px;vertical-align:middle;color:transparent}
  .severe .mask{width:90%;height:25px;background:#8a8a8a;filter:blur(3px)}
  footer{position:absolute;left:48px;right:48px;bottom:40px;border-top:1px solid #a7c4b9;padding-top:14px;font-size:12px;line-height:1.7;color:#52675e}
  footer b{color:#064e3b}
  </style></head><body>${doc.pages.map((p,i)=>`<section class="sheet ${doc.layout} ${doc.quality}">
  <div class="banner">FICTIONAL TEST DOCUMENT - NOT A GOVERNMENT RECORD<span lang="hi">काल्पनिक परीक्षण दस्तावेज़ - सरकारी रिकॉर्ड नहीं</span></div>
  <div class="meta">BHUVERIFY OFFLINE TEST PACK / ${esc(doc.id)}</div>
  <h1>${esc(plain(p.heading))}</h1>
  <div class="body">${p.lines.map(line=>`<div class="line">${doc.quality==='severe'?'<span class="mask" aria-label="unreadable"></span>':esc(plain(line)).replace(/\[(unreadable|अस्पष्ट)\]/g,'<span class="mask" aria-label="unreadable"></span>')}</div>`).join('')}</div>
  <footer><b>Fictional names and invented parcel data. Testing only.</b><br>No legal validity. No official verification. No seal or signature. <span style="float:right">Page ${i+1} of ${doc.pages.length}</span></footer>
  </section>`).join('')}</body></html>`;
}
const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
const manifest = [];
try {
  const page = await browser.newPage({viewport:{width:794,height:1122},deviceScaleFactor:1});
  await page.route('**/*', route => route.abort());
  for (const c of dataset.cases) {
    const folder = path.join(out,c.id);
    await mkdir(folder,{recursive:true});
    for (const doc of c.documents) {
      const destination = path.join(folder,doc.filename);
      if (doc.format==='txt') {
        const content = ['FICTIONAL TEST DOCUMENT - NOT A GOVERNMENT RECORD','काल्पनिक परीक्षण दस्तावेज़ - सरकारी रिकॉर्ड नहीं',`BhuVerify offline fixture ${doc.id}`,'',...doc.pages.flatMap(p=>[plain(p.heading),'',...p.lines,'']),'Fictional names and invented parcel data. No legal validity. No official verification.',''].join('\n');
        await writeFile(destination,content);
      } else {
        await page.setContent(html(doc));
        await page.evaluate(()=>document.fonts.ready);
        const layout = await page.locator('.sheet').evaluateAll(sheets=>sheets.map(s=>({bodyEnd:s.querySelector('.body').getBoundingClientRect().bottom-s.getBoundingClientRect().top,footerTop:s.querySelector('footer').getBoundingClientRect().top-s.getBoundingClientRect().top,overflow:s.scrollWidth>s.clientWidth})));
        if(layout.some(x=>x.overflow || x.bodyEnd+12>x.footerTop)) throw new Error(`Overflow: ${doc.id} ${JSON.stringify(layout)}`);
        if(doc.format==='pdf' && doc.quality!=='severe') {
          await page.pdf({path:destination,preferCSSPageSize:true,printBackground:true});
        } else {
          const imagePath=doc.format==='pdf'?path.join(qa,`${doc.id}-raster.png`):destination;
          await page.screenshot({path:imagePath,type:doc.format==='jpeg'?'jpeg':'png',...(doc.format==='jpeg'?{quality:76}:{}),fullPage:false});
          if(doc.format==='pdf') {
            const python=process.env.EVAL_PYTHON || 'python3';
            const result=spawnSync(python,[path.join(root,'wrap-image-pdf.py'),imagePath,destination],{encoding:'utf8'});
            if(result.status!==0) throw new Error(result.stderr || 'Image-only PDF creation failed');
          }
        }
      }
      const bytes=await readFile(destination);
      if(bytes.length>10*1024*1024) throw new Error(`Upload too large: ${doc.id}`);
      manifest.push({caseId:c.id,documentId:doc.id,split:c.split,kind:doc.kind,path:path.relative(root,destination),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),pages:doc.pages.length,quality:doc.quality});
      console.log(`${doc.id}: ${doc.format}, ${bytes.length} bytes`);
    }
  }
} finally { await browser.close(); }
await writeFile(path.join(root,'manifest.json'),JSON.stringify({version:dataset.version,created:dataset.created,datasetSha256:createHash('sha256').update(await readFile(path.join(root,'dataset.json'))).digest('hex'),documents:manifest},null,2)+'\n');
console.log(`Created ${manifest.length} offline documents. No API calls.`);
