import { createHmac, timingSafeEqual } from 'node:crypto';
export const b64 = x => Buffer.from(JSON.stringify(x)).toString('base64url');
export function sign(payload, secret) {const data=b64(payload);const signature=createHmac('sha256',secret).update(data).digest('base64url'); return `${data}.${signature}`;}
export function verify(token,secret,now=Date.now()) {
  if(typeof token!=='string'||token.length>3000) throw new Error('Invalid token');
  const [data,signature,extra]=token.split('.');if(!data||!signature||extra) throw new Error('Invalid token');
  const expected=createHmac('sha256',secret).update(data).digest();
  const provided=Buffer.from(signature,'base64url');if(provided.length!==expected.length||!timingSafeEqual(provided,expected)) throw new Error('Invalid token');
  const result=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
  if(!result||typeof result!=='object'||!Number.isFinite(result.exp)||result.exp<now||result.exp>now+7*86400000) throw new Error('Expired token');
  return result;
}
