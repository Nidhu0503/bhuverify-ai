import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

// Run using the bundled artifact-tool runtime. No application dependencies or API keys.
const sourceDir=path.dirname(fileURLToPath(import.meta.url));
const datasetPath = process.argv[2] || path.join(sourceDir,'dataset.json');
const outputDir = process.argv[3] || path.join(sourceDir,'outputs/bihar-v1');
const qaDir = process.argv[4] || path.join(sourceDir,'tmp/qa');
const datasetSource=await fs.readFile(datasetPath, 'utf8');
const dataset = JSON.parse(datasetSource);
const fieldNames = ['owner', 'seller', 'buyer', 'district', 'circle', 'mauza', 'thana', 'khata', 'khesra', 'jamabandi', 'area', 'areaUnit', 'date', 'mutationStatus', 'mortgage', 'boundaries'];
// The current application has sixteen supported evidence fields.
const fields = dataset.cases.flatMap(c => c.documents.flatMap(d => fieldNames.map(name => {
  const expected = d.expectedFields[name];
  return { caseId:c.id, docId:d.id, name, expected, file:d.filename, quality:d.quality,
    policy:expected ? 'Extract' : 'Omit', omission: d.unreadableFields.includes(name) ? 'Unreadable in this file' : 'Not stated in this file' };
})));
const docCount = dataset.cases.reduce((n,c)=>n+c.documents.length,0);
const expectedCount = fields.filter(f=>f.expected).length;
const w=Workbook.create();
const run=w.worksheets.add('Run log');
const detail=w.worksheets.add('Fields');
const guide=w.worksheets.add('Case guide');
const green='#064E3B', ink='#172B26', muted='#536760', pale='#F2F7F4', input='#FFF3CD';
const body={name:'Arial',size:11,color:ink};
function base(s,range) { s.showGridLines=false; s.getRange(range).format.font=body; s.getRange(range).format.verticalAlignment='center'; s.getRange(range).format.rowHeight=23; }
function title(s,text,last='F') { s.getRange('A2').values=[[text]]; s.getRange('A2').format.font={...body,size:16,bold:true}; s.getRange(`A3:${last}3`).format.borders={bottom:{style:'thin',color:green}}; }
function header(s,range) { s.getRange(range).format.fill=green; s.getRange(range).format.font={...body,bold:true,color:'#FFFFFF'}; s.getRange(range).format.horizontalAlignment='center'; s.getRange(range).format.wrapText=true; s.getRange(range).format.rowHeight=38; }
function width(s,col,n,last){s.getRange(`${col}1:${col}${last}`).format.columnWidth=n;}
function cell(s,a,v){s.getRange(a).values=[[v]];}
function formula(s,a,v){s.getRange(a).formulas=[[v]];}
function list(s,a,values){s.getRange(a).dataValidation={rule:{type:'list',values}};}
function bad(s,a,text){s.getRange(a).conditionalFormats.add('containsText',{text,format:{fill:'#FDE7E7',font:{color:'#991B1B',bold:true}}});}

const first=8, last=first+fields.length-1;
base(detail,`A1:O${last}`); title(detail,'Field-by-field answer key','O');
cell(detail,'A4',`Source: fictional dataset v1, 9 October 2026. ${docCount} documents; ${fieldNames.length} fields each; ${expectedCount} expected values.`);
cell(detail,'A5','Score only successful document responses. API failures stay unscored. A blank actual value is not automatically a correct omission. Never copy facts from another document.');
cell(detail,'A6','Extract: Correct / Wrong / Missing. Omit: Correctly omitted / Invented. Evidence: Supported / Unsupported / Missing. Blank means unscored.');
detail.getRange('A4:O6').format.font={...body,color:muted};
detail.getRange('A7:O7').values=[['Case','Document','Field','Policy','Expected value','Page','Expected evidence quote','Actual value','Actual page','Actual evidence quote','Value verdict','Evidence verdict','Reviewer notes','Upload file','Omission reason / quality']];
header(detail,'A7:O7');
detail.getRange(`A${first}:O${last}`).values=fields.map(f=>[f.caseId,f.docId,f.name,f.policy,f.expected?.value??null,f.expected?.page??null,f.expected?.quote??null,null,null,null,null,null,null,f.file,f.expected?f.quality:f.omission]);
detail.getRange(`E${first}:E${last}`).setNumberFormat('@');
detail.getRange(`H${first}:H${last}`).setNumberFormat('@');
detail.getRange(`F${first}:F${last}`).setNumberFormat('0');
detail.getRange(`I${first}:I${last}`).setNumberFormat('0');
detail.getRange(`A${first}:O${last}`).format.wrapText=true;
detail.getRange(`A${first}:O${last}`).format.rowHeight=60;
detail.getRange(`H${first}:M${last}`).format.fill=input;
for(let i=0;i<fields.length;i++){
  const row=first+i,f=fields[i];
  list(detail,`K${row}`,f.expected?['Correct','Wrong','Missing']:['Correctly omitted','Invented']);
  list(detail,`L${row}`,f.expected?['Supported','Unsupported','Missing']:['Not applicable']);
  if (f.expected && /^0[0-9]+$/.test(f.expected.value)) detail.getRange(`E${row}`).setNumberFormat('0'.repeat(f.expected.value.length));
  if(i===0||fields[i-1].docId!==f.docId) detail.getRange(`A${row}:O${row}`).format.borders={top:{style:'thin',color:'#A8BBB2'}};
}
for(const [c,n] of Object.entries({A:10,B:14,C:18,D:12,E:30,F:8,G:56,H:30,I:10,J:56,K:21,L:21,M:36,N:36,O:30}))width(detail,c,n,last);
bad(detail,`K${first}:K${last}`,'Wrong');bad(detail,`K${first}:K${last}`,'Missing');bad(detail,`K${first}:K${last}`,'Invented');bad(detail,`L${first}:L${last}`,'Unsupported');
detail.freezePanes.freezeRows(7);detail.freezePanes.freezeColumns(2);
detail.tables.add(`A7:O${last}`,true,'FieldAnswerKey').style='TableStyleLight1';

const endRun=19+dataset.cases.length;
base(run,`A1:N${endRun}`);title(run,'BhuVerify Gemini evaluation','N');run.tabColor=green;
cell(run,'A4','Fictional Bihar documents. No Gemini calls have been run. Make a fresh copy of this workbook for each evaluation run.');
cell(run,'A5','Amber cells accept results. Save raw output before corrections. Do not upload this answer key to Gemini.');
run.getRange('A4:N5').format.font={...body,color:muted};
run.getRange('A6:C6').values=[['Measure','Result','How to interpret it']];header(run,'A6:C6');
const fRange=`'Fields'!$K$${first}:$K$${last}`,pRange=`'Fields'!$D$${first}:$D$${last}`,eRange=`'Fields'!$L$${first}:$L$${last}`;
const summary=[
 ['Extract fields scored',`=COUNTIFS(${pRange},"Extract",${fRange},"Correct")+COUNTIFS(${pRange},"Extract",${fRange},"Wrong")+COUNTIFS(${pRange},"Extract",${fRange},"Missing")`,'Correct + wrong + missing values.'],
 ['Value accuracy',`=IF(B7=0,"Not run",COUNTIFS(${pRange},"Extract",${fRange},"Correct")/B7)`,'Correct values / extract fields scored.'],
 ['Omit fields scored',`=COUNTIFS(${pRange},"Omit",${fRange},"Correctly omitted")+COUNTIFS(${pRange},"Omit",${fRange},"Invented")`,'Correct omissions + invented values.'],
 ['Safe abstention rate',`=IF(B9=0,"Not run",COUNTIFS(${pRange},"Omit",${fRange},"Correctly omitted")/B9)`,'Correct omissions / omit fields scored.'],
 ['Evidence fields scored',`=COUNTIFS(${pRange},"Extract",${eRange},"Supported")+COUNTIFS(${pRange},"Extract",${eRange},"Unsupported")+COUNTIFS(${pRange},"Extract",${eRange},"Missing")`,'Supported + unsupported + missing evidence.'],
 ['Evidence support rate',`=IF(B11=0,"Not run",COUNTIFS(${pRange},"Extract",${eRange},"Supported")/B11)`,'Supported quotes and page numbers / evidence fields scored.'],
 ['Field scoring coverage',`=(B7+B9)/${fields.length}`,`${fields.length} total value decisions. Unscored rows are excluded from rates.`],
 ['Cases marked completed',`=COUNTIFS(D20:D${endRun},"Completed")`,'Human status only; check all documents and field rows before completing.'],
 ['Cases with provider errors',`=COUNTIFS(H20:H${endRun},">0")`,'Log all failed requests. Do not silently discard them.'],
];
summary.forEach(([label,f,note],i)=>{const r=7+i;cell(run,`A${r}`,label);formula(run,`B${r}`,f);cell(run,`C${r}`,note);});
run.getRange('A7:C15').format.rowHeight=32;run.getRange('A7:C15').format.wrapText=true;
run.getRange('B7:B15').format.horizontalAlignment='center';
for(const r of [8,10,12,13])run.getRange(`B${r}`).setNumberFormat('0.0%');
cell(run,'A17','Rates cover scored rows only, not overall model accuracy. Keep holdout cases untouched until the development protocol is frozen.');
cell(run,'A18','Completed requires saved raw responses, all document results, field scoring, both rule checks and the assistant review. Keep provider failures unscored.');
run.getRange('A17:N18').format.font={...body,color:muted};
run.getRange('A19:N19').values=[['Case','Split','Title','Run status','Run date','Model ID','Successful docs','Failed docs','Elapsed seconds','Checks: raw extraction','Checks: reviewed gold','Assistant verdict','Raw-output file/link','Error / reviewer notes']];
header(run,'A19:N19');
run.getRange(`A20:N${endRun}`).values=dataset.cases.map(c=>[c.id,c.split,c.title,'Not run',null,null,null,null,null,null,null,null,null,null]);
run.getRange(`A20:N${endRun}`).format.wrapText=true;run.getRange(`A20:N${endRun}`).format.rowHeight=52;
run.getRange(`D20:N${endRun}`).format.fill=input;
run.getRange(`E20:E${endRun}`).setNumberFormat('yyyy-mm-dd');
run.getRange(`G20:H${endRun}`).setNumberFormat('0');run.getRange(`I20:I${endRun}`).setNumberFormat('0.0');
list(run,`D20:D${endRun}`,['Not run','In progress','Completed','Provider error','Blocked']);
for(const col of ['J','K','L'])list(run,`${col}20:${col}${endRun}`,['Pass','Fail','Not run','Blocked']);
bad(run,`D20:D${endRun}`,'Provider error');for(const col of ['J','K','L'])bad(run,`${col}20:${col}${endRun}`,'Fail');
for(const [c,n]of Object.entries({A:30,B:16,C:55,D:20,E:16,F:25,G:16,H:14,I:17,J:22,K:22,L:20,M:38,N:52}))width(run,c,n,endRun);
run.getRange('E6:F6').values=[['Run metadata','Value']];header(run,'E6:F6');
run.getRange('E7:F14').values=[['Run ID',null],['Reviewer',null],['App commit',null],['Prompt/config',null],['Dataset version',dataset.version],['Dataset SHA-256',createHash('sha256').update(datasetSource).digest('hex')],['Assistant input',null],['Start time (UTC)',null]];
run.getRange('E7:F14').format.wrapText=true;run.getRange('F7:F10').format.fill=input;run.getRange('F13:F14').format.fill=input;
run.getRange('F11:F12').format.fill=pale;run.getRange('F7:F13').setNumberFormat('@');run.getRange('F14').setNumberFormat('yyyy-mm-dd hh:mm:ss');
width(run,'F',52,endRun);list(run,'F13',['Raw extraction','Corrected gold']);
run.freezePanes.freezeColumns(2);run.tables.add(`A19:N${endRun}`,true,'EvaluationRuns').style='TableStyleLight1';

const guideRows=[];
for(const c of dataset.cases){
 const setup=Object.entries(c.caseMetadata).map(([k,v])=>`${k}: ${v}`).join('; ');
 const checkText=stage=>`${c.checks[stage].required.map(x=>`${x.idPrefix}: ${x.severity}`).join('\n')}\nForbidden prefixes: ${c.checks[stage].forbiddenPrefixes.join(', ')}`;
 guideRows.push([c.id,'Case',`${c.title} (${c.split}; ${c.category})`],
 [c.id,'Upload files',c.documents.map(d=>`${d.filename} (${d.kind}; ${d.language}; ${d.quality})`).join('\n')],
 [c.id,'Case setup',setup],
 [c.id,'Expected behavior',c.expectedBehavior.join('\n')],
 [c.id,'Assistant question',c.assistantQuestion],
 [c.id,'Assistant must mention',c.assistantMustMention.join('\n')],
 [c.id,'Must not claim',c.mustNotClaim.join('\n')],
 [c.id,'Before review',checkText('unreviewed')],
 [c.id,'After gold review',checkText('reviewed')]);
}
const guideLast=6+guideRows.length;
base(guide,`A1:C${guideLast}`);title(guide,'Case review guide','C');
cell(guide,'A4','Compare extraction first, then deterministic findings, then the assistant answer. Reviewed gold assumes corrected values with high confidence.');
cell(guide,'A5','Rule IDs are expected patterns, not a complete list. Actual document IDs may differ. Official verification must remain not performed.');
guide.getRange('A4:C5').format.font={...body,color:muted};
guide.getRange('A6:C6').values=[['Case','Review item','Expected answer / instruction']];header(guide,'A6:C6');
guide.getRange(`A7:C${guideLast}`).values=guideRows;guide.getRange(`A7:C${guideLast}`).format.wrapText=true;
width(guide,'A',10,guideLast);width(guide,'B',27,guideLast);width(guide,'C',132,guideLast);
guideRows.forEach((row,i)=>{const n=7+i;const text=row[2];const lines=text.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/122)),0);guide.getRange(`A${n}:C${n}`).format.rowHeight=Math.max(30,lines*17+10);if(i%9===0){guide.getRange(`A${n}:C${n}`).format.fill=pale;guide.getRange(`A${n}:C${n}`).format.font={...body,bold:true};}});
guide.freezePanes.freezeRows(6);guide.freezePanes.freezeColumns(1);

w.recalculate();
for(let i=0;i<fields.length;i++)if(fields[i].expected)assert.equal(detail.getRange(`E${first+i}`).values[0][0],fields[i].expected.value);
assert.equal(run.getRange('B7').values[0][0],0);
assert.equal(run.getRange('B8').values[0][0],'Not run');
assert.equal(run.getRange('B10').values[0][0],'Not run');
assert.equal(run.getRange('B12').values[0][0],'Not run');
const extractIndex=fields.findIndex(f=>f.expected);
const omitIndex=fields.findIndex(f=>!f.expected);
cell(detail,`K${first+extractIndex}`,'Correct');cell(detail,`L${first+extractIndex}`,'Supported');cell(detail,`K${first+omitIndex}`,'Invented');
w.recalculate();
assert.equal(run.getRange('B7').values[0][0],1);
assert.equal(run.getRange('B8').values[0][0],1);
assert.equal(run.getRange('B10').values[0][0],0);
assert.equal(run.getRange('B12').values[0][0],1);
cell(detail,`K${first+extractIndex}`,'Missing');cell(detail,`L${first+extractIndex}`,'Missing');cell(detail,`K${first+omitIndex}`,'Correctly omitted');
w.recalculate();assert.equal(run.getRange('B8').values[0][0],0);assert.equal(run.getRange('B10').values[0][0],1);assert.equal(run.getRange('B12').values[0][0],0);
cell(detail,`K${first+extractIndex}`,null);cell(detail,`L${first+extractIndex}`,null);cell(detail,`K${first+omitIndex}`,null);
w.recalculate();
assert.equal(run.getRange('B8').values[0][0],'Not run');assert.equal(run.getRange('B10').values[0][0],'Not run');assert.equal(run.getRange('B13').values[0][0],0);
await fs.mkdir(outputDir,{recursive:true});await fs.mkdir(qaDir,{recursive:true});
const inspections=[];
for(const range of ['Run log!A6:C15','Run log!E6:F14','Fields!A7:G12',`Fields!A${last-5}:G${last}`,'Case guide!A6:C10']){
 const r=await w.inspect({kind:'table',range,include:'values,formulas',tableMaxRows:12,tableMaxCols:7,maxChars:4500});inspections.push(r.ndjson);
}
const errors=await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},summary:'Final formula error scan'});
inspections.push(errors.ndjson);
await fs.writeFile(path.join(qaDir,'verification.txt'),inspections.join('\n'));
for(const [sheetName,range,name] of [['Run log','A1:C15','run-summary'],['Run log','E6:F14','run-metadata'],['Run log','A19:H24','run-inputs'],['Fields','A1:G16','field-answer-key'],['Fields','H7:M16','field-inputs'],['Fields','A280:G295','hindi-fields'],['Case guide','A1:C15','case-guide'],['Case guide','A88:C96','hindi-case-guide']]){
 const preview=await w.render({sheetName,range,scale:1.4,format:'png'});await fs.writeFile(path.join(qaDir,`${name}.png`),new Uint8Array(await preview.arrayBuffer()));
}
const output=await SpreadsheetFile.exportXlsx(w);const outputPath=path.join(outputDir,'expected-answers.xlsx');await output.save(outputPath);
console.log(JSON.stringify({output:outputPath,cases:dataset.cases.length,documents:docCount,supportedFields:fieldNames.length,decisions:fields.length,expectedValues:expectedCount,omissions:fields.length-expectedCount,qa:qaDir,formulaTests:'passed',results:'Not run'},null,2));
