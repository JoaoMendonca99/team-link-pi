export const maxFileSize = 10 * 1024 * 1024
export const acceptedFiles = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.docx'
export type FileInfo = {name:string;size:number;mime:string;sha256:string}
const decoder = new TextDecoder('utf-8', {fatal:true})
function pngValid(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let pos=8,header=false,image=false,end=false
 while(pos+12<=bytes.length){const length=view.getUint32(pos),type=new TextDecoder().decode(bytes.subarray(pos+4,pos+8));if(length>maxFileSize||pos+length+12>bytes.length)return false
  let crc=0xffffffff;for(const byte of bytes.subarray(pos+4,pos+8+length)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}if((crc^0xffffffff)>>>0!==view.getUint32(pos+8+length))return false
  if(pos===8){if(type!=='IHDR'||length!==13||!view.getUint32(pos+8)||!view.getUint32(pos+12)||view.getUint32(pos+8)*view.getUint32(pos+12)>40_000_000)return false;header=true}
  if(type==='IDAT')image=true;pos+=length+12;if(type==='IEND'){end=length===0;break}
 }
 return header&&image&&end&&pos===bytes.length
}
function jpegValid(bytes:Uint8Array){
 let pos=2,frame=false
 while(pos+4<bytes.length){if(bytes[pos++]!==255)return false;while(bytes[pos]===255)pos++;const marker=bytes[pos++];if(marker===0xda)return frame&&bytes.at(-2)===255&&bytes.at(-1)===217
  const length=(bytes[pos]<<8)|bytes[pos+1];if(length<2||pos+length>bytes.length)return false
  if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)return false;const h=(bytes[pos+3]<<8)|bytes[pos+4],w=(bytes[pos+5]<<8)|bytes[pos+6];if(!w||!h||w*h>40_000_000)return false;frame=true}pos+=length
 }return false
}
export function safeFileName(name:string) {
  return name.split(/[\\/]/).at(-1)!.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,150) || 'arquivo'
}
// The caller must bound ZIP expansion before extracting it. No macros, embeds or external relationships.
export function validateFile(bytes:Uint8Array,name:string,reference=false,unzip?:(bytes:Uint8Array)=>Record<string,Uint8Array>):string {
  if(!bytes.length||bytes.length>maxFileSize)throw Error('Cada arquivo deve ter entre 1 byte e 10 MB.')
  const ext=name.split('.').at(-1)?.toLowerCase(),head=new TextDecoder().decode(bytes.subarray(0,16))
  if(reference&&!['pdf','docx'].includes(ext??''))throw Error('A biblioteca aceita PDF e DOCX.')
  if(ext==='png'&&bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'&&pngValid(bytes))return 'image/png'
  if(['jpg','jpeg'].includes(ext??'')&&bytes[0]===255&&bytes[1]===216&&jpegValid(bytes))return 'image/jpeg'
  if(ext==='webp'&&head.startsWith('RIFF')&&head.slice(8,12)==='WEBP'&&bytes.length>=30&&new DataView(bytes.buffer,bytes.byteOffset).getUint32(4,true)+8===bytes.length&&['VP8 ','VP8L','VP8X'].includes(head.slice(12,16)))return 'image/webp'
  if(ext==='pdf'&&head.startsWith('%PDF-')&&new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF')){
    // References are downloaded, never executed or embedded in the app. Reject active PDF actions.
    if(/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|AA)\b|\/OpenAction\s*<</.test(new TextDecoder('latin1').decode(bytes)))throw Error('PDF com conteúdo ativo não é permitido.')
    return 'application/pdf'
  }
  if(ext==='txt'){
    let text:string;try{text=decoder.decode(bytes)}catch{throw Error('Envie TXT codificado em UTF-8.')}
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('O arquivo não é um texto válido.')
    return 'text/plain'
  }
  if(ext==='docx'&&unzip&&bytes[0]===80&&bytes[1]===75){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
    let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break}
    if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('DOCX inválido.')
    const count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),total=0
    if(!count||count>1000)throw Error('DOCX excede o limite de conteúdo.')
    const names=new Set<string>()
    for(let i=0;i<count;i++){
      if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('DOCX inválido.')
      const size=view.getUint32(pos+24,true),length=view.getUint16(pos+28,true)
      const path=decoder.decode(bytes.subarray(pos+46,pos+46+length))
      total+=size
      if(total>30*1024*1024||size>20*1024*1024||view.getUint16(pos+8,true)&1||names.has(path)||path.includes('..')||path.startsWith('/')||/\\|vbaProject|embeddings\//i.test(path))throw Error('DOCX com conteúdo não permitido.')
      names.add(path);pos+=46+length+view.getUint16(pos+30,true)+view.getUint16(pos+32,true)
    }
    if(!names.has('[Content_Types].xml')||!names.has('word/document.xml'))throw Error('O arquivo não é um DOCX válido.')
    const entries=unzip(bytes)
    for(const [path,body] of Object.entries(entries))if(path.endsWith('.rels')&&/TargetMode\s*=\s*["']External/i.test(decoder.decode(body)))throw Error('DOCX com referências externas não é permitido.')
    const types=decoder.decode(entries['[Content_Types].xml'])
    if(!types.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')||/macroEnabled|vbaProject/i.test(types))throw Error('DOCX inválido ou com macros.')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  throw Error('Formato inválido. Use PNG, JPEG, WebP, PDF, TXT ou DOCX válidos.')
}
export async function inspectFile(file:File,reference=false,unzip?:(bytes:Uint8Array)=>Record<string,Uint8Array>){
  if(file.size>maxFileSize)throw Error('Cada arquivo deve ter no máximo 10 MB.')
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=validateFile(bytes,file.name,reference,unzip)
  const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource)
  return {bytes,info:{name:safeFileName(file.name),size:bytes.length,mime,sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}}
}
