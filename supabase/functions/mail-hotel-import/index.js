const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function database(path,options={}){
 const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
 const key=keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const headers={apikey:key,'Content-Type':'application/json'};
 if(!keys.default)headers.Authorization='Bearer '+key;
 return fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{...options,headers,signal:AbortSignal.timeout(15000)});
}
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.length<=max;
function validate(e){
 if(!e||!hex(e.eventId)||!hex(e.bookingKey)||!['confirmed','cancelled'].includes(e.kind)||
 typeof e.verified!=='boolean'||typeof e.complete!=='boolean'||!Number.isFinite(Date.parse(e.sourceAt)))return false;
 if(Date.parse(e.sourceAt)>Date.now()+86400000)return false;
 const h=e.hotel;if(!h||typeof h!=='object')return false;
 const allowed=['name','city','checkin','checkout','address','addressZh','room','checkinTime','checkoutTime','totalMinor','currency','paid'];
 if(Object.keys(h).some(k=>!allowed.includes(k))||Object.keys(e).some(k=>!['eventId','bookingKey','sourceAt','kind','verified','complete','hotel'].includes(k)))return false;
 if(!text(h.name,300)||!text(h.address,500)||!text(h.addressZh,500)||!text(h.room,300)||!text(h.checkinTime,5)||!text(h.checkoutTime,5)||typeof h.paid!=='boolean')return false;
 const cities=['beijing','changzhou','hangzhou','shanghai','zhangjiajie','chongqing'];
 if(h.city!==null&&!cities.includes(h.city))return false;
 for(const field of ['checkin','checkout'])if(h[field]!==null&&(!/^20\d\d-\d\d-\d\d$/.test(h[field])||!Number.isFinite(Date.parse(h[field]))))return false;
 if(!['','RUB','CNY'].includes(h.currency))return false;
 if(h.totalMinor!==null&&(!Number.isSafeInteger(h.totalMinor)||h.totalMinor<0||h.totalMinor>100000000))return false;
 for(const field of ['checkinTime','checkoutTime'])if(h[field]&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(h[field]))return false;
 if(e.complete){
  if(!['beijing','changzhou','hangzhou','shanghai','zhangjiajie','chongqing'].includes(h.city)||
   !/^20\d\d-\d\d-\d\d$/.test(h.checkin)||!/^20\d\d-\d\d-\d\d$/.test(h.checkout)||
   !(Date.parse(h.checkout)>Date.parse(h.checkin))||!Number.isSafeInteger(h.totalMinor)||h.totalMinor<0||h.totalMinor>100000000||!['RUB','CNY'].includes(h.currency))return false;
 }
 return true;
}
Deno.serve(async request=>{
 if(request.method!=='POST')return reply({error:'method'},405);
 try{
  const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return reply({error:'unauthorized'},401);
  const devices=await database('hotel_import_devices?select=id&enabled=eq.true&token_hash=eq.'+await hash(token));
  if(!devices.ok||!(await devices.json()).length)return reply({error:'unauthorized'},401);
  const raw=await request.text();if(raw.length>10000)return reply({error:'size'},413);
  const event=JSON.parse(raw);if(!validate(event))return reply({error:'invalid'},400);
  const result=await database('rpc/import_mail_hotel',{method:'POST',body:JSON.stringify({e:event})});
  if(!result.ok)return reply({error:'storage'},502);
  return reply(await result.json());
 }catch{return reply({error:'storage'},502);}
});
