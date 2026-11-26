/** Offline asset tool for the user-provided TeleAPI image endpoint. Never bundled into the game. */
const fs = require('node:fs/promises');
const path = require('node:path');
const {parseArgs} = require('node:util');
const {createHash} = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENDPOINT = 'https://ai01.teleapi.top/draw-api/v1/images/generations';
const MAX_BYTES = 32 * 1024 * 1024;
const TIMEOUT_MS = 180000;

function publicError(error, key) {
  let message = String(error && error.message || error || 'Image generation failed.');
  if (error && error.cause && error.cause.code) message += ' (' + error.cause.code + ')';
  if (key) message = message.split(key).join('[redacted]');
  return message.replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted]').slice(0, 400);
}
function httpsURL(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('The provider returned an invalid image URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only HTTPS URLs without embedded credentials are accepted.');
  return url;
}
async function readLimited(response) {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_BYTES) throw new Error('Image response exceeds the 32 MB limit.');
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) throw new Error('Image response exceeds the 32 MB limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}
function imageType(bytes) {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {extension:'.png',mime:'image/png'};
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return {extension:'.jpg',mime:'image/jpeg'};
  if (bytes.length > 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return {extension:'.webp',mime:'image/webp'};
  throw new Error('The provider did not return a PNG, JPEG or WebP image.');
}
function outputPath(requested, extension) {
  const current = path.extname(requested).toLowerCase();
  if (['.png','.jpg','.jpeg','.webp'].includes(current)) return requested.slice(0,-current.length) + extension;
  return requested + extension;
}
async function ensureNew(file) {
  try { await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Output already exists; choose a new filename.');
}
async function generateImage({prompt,size='1*1',out,endpoint=DEFAULT_ENDPOINT,key,timeout=TIMEOUT_MS,fetchImpl=fetch}) {
  if (!key || !key.trim()) throw new Error('Set TELEAPI_IMAGEGEN_API_KEY in .env.imagegen.local before generating images.');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('A non-empty prompt is required.');
  if (prompt.length > 12000) throw new Error('The prompt exceeds 12000 characters.');
  if (!/^\d{1,2}\*\d{1,2}$/.test(size) || size.split('*').some(n=>Number(n)<1)) throw new Error('Use a positive size ratio such as 1*1.');
  if (!out) throw new Error('An output filename is required.');
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) throw new Error('Timeout must be between 1000 and 600000 milliseconds.');
  const apiURL = httpsURL(endpoint), requested = path.resolve(out);
  await ensureNew(requested);
  const signal = AbortSignal.timeout(timeout);
  try {
    const response = await fetchImpl(apiURL, {
      method:'POST', redirect:'error', signal,
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({prompt:prompt.trim(),size}),
    });
    const raw = await readLimited(response);
    if ([502,503,504,524].includes(response.status)) throw new Error('Image API returned HTTP '+response.status+' (provider gateway failure). No automatic retry was sent; generation may still be running.');
    let body;
    try { body = JSON.parse(raw.toString('utf8')); }
    catch (_) { throw new Error('Image API returned HTTP '+response.status+' without valid JSON.'); }
    if (!body || typeof body !== 'object') throw new Error('Image API returned HTTP '+response.status+' with an unsupported JSON response.');
    if (!response.ok || body.error) {
      const detail = typeof body.error === 'string' ? body.error : body.error && body.error.message || body.message;
      throw new Error('Image API returned HTTP '+response.status+(detail ? ': '+detail : '.'));
    }
    const image = Array.isArray(body.data) && body.data[0];
    if (!image) throw new Error('Image API did not include data[0]; no asset was saved.');
    let bytes;
    if (typeof image.b64_json === 'string') {
      if (image.b64_json.length > Math.ceil(MAX_BYTES/3)*4 || !/^[A-Za-z0-9+/\s]+={0,2}$/.test(image.b64_json)) throw new Error('The provider returned invalid or oversized image Base64.');
      bytes = Buffer.from(image.b64_json,'base64');
    } else if (typeof image.url === 'string') {
      const imageURL = httpsURL(image.url);
      // The API credential is sent only to the generation endpoint, never to image/CDN URLs.
      const download = await fetchImpl(imageURL,{method:'GET',redirect:'error',signal});
      if (!download.ok) throw new Error('Generated image download returned HTTP '+download.status+'.');
      bytes = await readLimited(download);
    } else throw new Error('Image API did not include b64_json or url.');
    if (bytes.length > MAX_BYTES) throw new Error('Image response exceeds the 32 MB limit.');
    const type = imageType(bytes), file = outputPath(requested,type.extension), metadataFile = file+'.json';
    await ensureNew(file); await ensureNew(metadataFile);
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,bytes,{flag:'wx'});
    const metadata = {provider:'TeleAPI',endpoint:apiURL.href,prompt:prompt.trim(),size,mime:type.mime,
      bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),createdAt:new Date().toISOString(),file:path.basename(file)};
    await fs.writeFile(metadataFile,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
    return {file,metadataFile,bytes:bytes.length,mime:type.mime};
  } catch (error) {
    throw new Error(publicError(error,key));
  }
}
function help() {
  console.log('Generate a local candidate asset using TeleAPI.\n\n'+
    'npm run imagegen -- --prompt-file tools/imagegen/prompts/bg-deep.txt --out tools/.image-preview/bg-deep-v2.png\n\n'+
    'Options: --prompt TEXT or --prompt-file FILE, --out FILE, --size 1*1, --timeout 180000\n'+
    'Configure TELEAPI_IMAGEGEN_API_KEY in the ignored .env.imagegen.local file.\n'+
    'No automatic retries. Existing files are never overwritten. The actual image format determines the extension.');
}
async function main() {
  const {values} = parseArgs({options:{prompt:{type:'string'},'prompt-file':{type:'string'},out:{type:'string'},size:{type:'string',default:'1*1'},timeout:{type:'string',default:String(TIMEOUT_MS)},help:{type:'boolean'}}});
  if (values.help) { help(); return; }
  if (Boolean(values.prompt) === Boolean(values['prompt-file'])) throw new Error('Use exactly one of --prompt or --prompt-file.');
  if (!values.out) throw new Error('Use --out to choose a new candidate filename.');
  try { process.loadEnvFile(path.join(ROOT,'.env.imagegen.local')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not load .env.imagegen.local.'); }
  if (process.env.NODE_USE_ENV_PROXY === '1') {
    const http = require('node:http');
    if (typeof http.setGlobalProxyFromEnv !== 'function') throw new Error('Proxy support requires Node 24.15+ for this tool.');
    http.setGlobalProxyFromEnv();
  }
  const prompt = values['prompt-file'] ? await fs.readFile(values['prompt-file'],'utf8') : values.prompt;
  const result = await generateImage({prompt,size:values.size,out:values.out,timeout:Number(values.timeout),
    key:process.env.TELEAPI_IMAGEGEN_API_KEY,endpoint:process.env.TELEAPI_IMAGEGEN_ENDPOINT||DEFAULT_ENDPOINT});
  console.log(JSON.stringify(result,null,2));
}
module.exports = {generateImage,imageType,publicError,DEFAULT_ENDPOINT};
if (require.main === module) main().catch(error=>{console.error(publicError(error,process.env.TELEAPI_IMAGEGEN_API_KEY));process.exitCode=1;});
