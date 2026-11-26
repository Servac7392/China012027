const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../';
const app={addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,contains:()=>false,innerHTML:''};
const clock={textContent:'',hidden:true};
const context={document:{getElementById:id=>id==='app'?app:clock,querySelectorAll:()=>[],activeElement:null},window:{addEventListener(){},setInterval(){}},
location:{hash:'#trip'},localStorage:{getItem:()=>null},navigator:{userAgent:''},fetch:async()=>{throw Error('offline')},AbortSignal,URLSearchParams,Intl,Date,Object,Map,Set,crypto,console};
vm.createContext(context);for(const name of ['guide.js','ticket-pdf.js','app.js'])vm.runInContext(fs.readFileSync(root+name,'utf8'),context);
vm.runInContext(`sharedTrip.records['18–20:hotel']={key:'18–20:hotel',revision:'test',value:{name:'River hotel',address:'Shanghai',addressZh:'上海',stay:'2027-01-18 — 2027-01-20',price:'18904.70 RUB',url:''}};
sharedTrip.hotelMeta['18–20:hotel']={sourceAt:'2026-11-25T06:01:38Z',state:'confirmed',room:'River view suite',paid:true,checkinTime:'14:00',checkoutTime:'12:00',needsAttention:false};render();`,context);
assert.match(app.innerHTML,/River hotel/);
context.location.hash='#stay/18%E2%80%9320';vm.runInContext('render()',context);
assert.match(app.innerHTML,/Из письма Trip.com/);assert.match(app.innerHTML,/River view suite/);assert.match(app.innerHTML,/14:00/);assert.match(app.innerHTML,/上海/);
context.location.hash='#expenses';vm.runInContext('render()',context);const confirmed=app.innerHTML;
vm.runInContext(`sharedTrip.hotelMeta['18–20:hotel'].state='cancelled';render()`,context);
assert.notEqual(app.innerHTML,confirmed,'Cancellation must alter budget');
context.location.hash='#trip';vm.runInContext(`sharedTrip.hotelMeta['18–20:hotel'].state='review';sharedTrip.hotelMeta['18–20:hotel'].needsAttention=true;sharedTrip.hotelMeta['18–20:hotel'].reason='Проверьте бронь';sharedTrip.hotelMeta['18–20:hotel'].proposal={name:'<script>alert(1)</script>',checkin:'2027-01-18',checkout:'2027-01-20',currency:'RUB',totalMinor:100};render()`,context);
assert.match(app.innerHTML,/Требует внимания/);
context.location.hash='#stay/18%E2%80%9320';vm.runInContext('render()',context);
assert.match(app.innerHTML,/Принять данные из письма/);assert.match(app.innerHTML,/Оставить текущий отель/);
assert.doesNotMatch(app.innerHTML,/<script>alert/);assert.match(app.innerHTML,/&lt;script&gt;/);
console.log('Hotel placement, source, budget, conflict and escaping checks passed');

