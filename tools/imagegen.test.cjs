const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {generateImage,publicError,DEFAULT_ENDPOINT} = require('./generate-image.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKc0AAAAASUVORK5CYII=','base64');
const TEST_KEY = 'test-only-credential';
function json(body,status=200) { return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}); }
async function output(t,name='candidate.png') {
  const root = path.resolve(os.tmpdir());
  const folder = await fs.mkdtemp(path.join(root,'roles-imagegen-test-'));
  t.after(async()=>{
    const relative = path.relative(root,path.resolve(folder));
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith('..') && path.basename(folder).startsWith('roles-imagegen-test-'));
    await fs.rm(folder,{recursive:true,force:true});
  });
  return path.join(folder,name);
}

test('Base64 generation sends the documented request and saves image plus reproducible metadata',async t=>{
  const out = await output(t),calls=[];
  const result = await generateImage({prompt:'  serene background  ',key:TEST_KEY,out,
    fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return json({data:[{b64_json:PNG.toString('base64')}]});}});
  assert.equal(calls.length,1);assert.equal(calls[0].url,DEFAULT_ENDPOINT);
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+TEST_KEY);
  assert.equal(calls[0].options.redirect,'error');
  assert.deepEqual(JSON.parse(calls[0].options.body),{prompt:'serene background',size:'1*1'});
  assert.deepEqual(await fs.readFile(result.file),PNG);
  const raw = await fs.readFile(result.metadataFile,'utf8'),metadata=JSON.parse(raw);
  assert.equal(metadata.prompt,'serene background');assert.equal(metadata.sha256,createHash('sha256').update(PNG).digest('hex'));
  assert.equal(raw.includes(TEST_KEY),false);assert.equal(metadata.mime,'image/png');
});

test('Image/CDN downloads receive no API authorization and use the actual file format',async t=>{
  const out = await output(t,'candidate.jpg'),calls=[];
  const result = await generateImage({prompt:'background',key:TEST_KEY,out,
    fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return calls.length===1?
      json({data:[{url:'https://assets.example.test/generated.png?download=1'}]}):new Response(PNG);}});
  assert.equal(calls.length,2);assert.equal(calls[1].options.method,'GET');
  assert.equal(calls[1].options.headers,undefined);assert.equal(calls[1].options.redirect,'error');
  assert.ok(result.file.endsWith('.png'));assert.deepEqual(await fs.readFile(result.file),PNG);
});

test('Existing candidate files are protected before any billable API request',async t=>{
  const out = await output(t);await fs.writeFile(out,'keep');let calls=0;
  await assert.rejects(generateImage({prompt:'background',key:TEST_KEY,out,fetchImpl:async()=>{calls++;}}),/already exists/);
  assert.equal(calls,0);assert.equal(await fs.readFile(out,'utf8'),'keep');
});

test('An existing file with the detected format cannot be overwritten either',async t=>{
  const out = await output(t,'candidate.jpg'),existing=out.replace('.jpg','.png');await fs.writeFile(existing,'keep');
  await assert.rejects(generateImage({prompt:'background',key:TEST_KEY,out,
    fetchImpl:async()=>json({data:[{b64_json:PNG.toString('base64')}]} )}),/already exists/);
  assert.equal(await fs.readFile(existing,'utf8'),'keep');
});

test('Provider errors are redacted and not automatically retried',async t=>{
  const out = await output(t);let calls=0;
  for (const status of [401,502,524]) {
    const before=calls;
    await assert.rejects(generateImage({prompt:'background',key:TEST_KEY,out,fetchImpl:async()=>{
      calls++;return json({error:{message:'expired '+TEST_KEY+' sk-provider-example'}},status);
    }}),error=>{assert.ok(error.message.includes('HTTP '+status));assert.equal(error.message.includes(TEST_KEY),false);assert.equal(error.message.includes('sk-provider-example'),false);return true;});
    assert.equal(calls,before+1);await assert.rejects(fs.stat(out),{code:'ENOENT'});
  }
});

test('HTTP or credential-bearing download URLs are rejected before downloading',async t=>{
  const out = await output(t);for(const url of ['http://assets.example.test/image.png','https://user:pass@assets.example.test/image.png']){
    let calls=0;await assert.rejects(generateImage({prompt:'background',key:TEST_KEY,out,
      fetchImpl:async()=>{calls++;return json({data:[{url}]});}}),/HTTPS URLs without embedded credentials/);
    assert.equal(calls,1);
  }
});

test('Oversized responses and non-image payloads are never saved',async t=>{
  const out = await output(t);
  const bodies=[()=>new Response('{}',{headers:{'Content-Length':String(33*1024*1024)}}),
    ()=>json({data:[{b64_json:Buffer.from('<html>not an image</html>').toString('base64')}]}),
    ()=>json({data:[{b64_json:'invalid-base64!'}]})];
  for(const body of bodies)await assert.rejects(generateImage({prompt:'background',key:TEST_KEY,out,fetchImpl:async()=>body()}));
  await assert.rejects(fs.stat(out),{code:'ENOENT'});
});

test('Missing keys, invalid ratios, and insecure endpoints fail without a request',async t=>{
  const out = await output(t);let calls=0;const base={prompt:'background',key:TEST_KEY,out,fetchImpl:async()=>{calls++;}};
  for(const change of [{key:''},{size:'0*1'},{size:'1024x1024'},{endpoint:'http://api.example.test/generate'},{prompt:' '}])
    await assert.rejects(generateImage({...base,...change}));
  assert.equal(calls,0);
});

test('Timeouts do not retry; network diagnostics preserve codes but redact credentials',async t=>{
  const out = await output(t);let calls=0;
  await assert.rejects(generateImage({prompt:'background',key:TEST_KEY,out,timeout:1000,fetchImpl:async(_,options)=>{
    calls++;return new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});setTimeout(()=>{},1100);});
  }}),/timeout|aborted/i);assert.equal(calls,1);
  const error = new Error('fetch failed '+TEST_KEY,{cause:{code:'ECONNRESET'}});
  const diagnostic=publicError(error,TEST_KEY);assert.match(diagnostic,/ECONNRESET/);assert.equal(diagnostic.includes(TEST_KEY),false);
});
