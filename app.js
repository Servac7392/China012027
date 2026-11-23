const app = document.getElementById('app');
const state = {category:'places', starts:{}, presets:{}, modes:{}};
const categories = {places:'Достопримечательности',food:'Еда',routes:'Вечерние прогулки',tours:'Экскурсии'};
const rub = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(n);
const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const map = query => 'https://www.amap.com/search?query=' + encodeURIComponent(query);
const link = (url,label) => '<a class="btn" target="_blank" rel="noopener noreferrer" href="'+safe(url)+'">'+safe(label)+'</a>';
const hero = (title,sub) => '<div class="hero"><h1>'+safe(title)+'</h1><p>'+safe(sub)+'</p></div>';
const cityCards = () => '<div class="grid">'+Object.entries(cities).map(([id,c])=>'<a class="card citylink" href="#city/'+id+'"><p class="date">'+c.dates+'</p><h3>'+c.name+'</h3><span class="muted">Маршруты и 10 мест</span></a>').join('')+'</div>';
function favorites(){
 try { const value=JSON.parse(localStorage.getItem('china-trip-favorites')||'[]'); return Array.isArray(value)?value:[]; }
 catch { return []; }
}
const missingDetails = {
 '17':['transfer','ticket'], '18–20':['transfer','ticket','hotel'],
 '20':['transfer','ticket','hotel'], '21–22':[], '23–24':['transfer','ticket','hotel'],
 '25':['hotel'], '26':['ticket']
};
const detailFields = {
 transfer: {label:'Переезд', fields:{route:'Откуда и куда', transport:'Вид транспорта', time:'Дата и местное время'}},
 ticket: {label:'Билет', fields:{service:'Номер рейса или поезда', time:'Время и место отправления / прибытия', price:'Цена и валюта', url:'Ссылка на отель'}},
 hotel: {label:'Отель', fields:{name:'Название отеля', address:'Адрес', stay:'Даты заезда и выезда', price:'Цена и валюта'}}
};
const detailKey = 'china-trip-details-v1';
function tripDetails(){
 try {
  const data=JSON.parse(localStorage.getItem(detailKey)||'{}');
  return data && typeof data==='object' && !Array.isArray(data) ? data : {};
 } catch { return {}; }
}

function linkedText(value){
 return String(value).split(/(https?:\/\/[^\s<>"']+)/g).map(part=>/^https?:\/\//i.test(part)?link(part,'Открыть ссылку'):safe(part)).join('');
}
function baseRecord(date,type){
 const day=days.find(d=>d[0]===date);
 if(!day)return {};
 if(type==='hotel'&&day[5]){
  const h=hotels[day[5]];
  return {name:h[0],price:String(h[2]),stay:h[4]+'–'+h[5]+' января 2027',url:hotelAddresses[day[5]]?.url||''};
 }
 return {};
}

function detailCards(date){
 const types=[...(missingDetails[date]||[])], records=tripDetails();
 const day=days.find(d=>d[0]===date);
 if(day?.[5]&&!types.includes('hotel'))types.push('hotel');
 if(!types.length)return '';
 return '<div class="detail-list">'+types.map(type=>detailCard(date+':'+type,type,{...baseRecord(date,type),...records[date+':'+type]})).join('')+'</div>';
}
function detailCard(key,type,record){
  const {label,fields}=detailFields[type];
  const pairs=Object.entries(fields);
  const summary=pairs.filter(([name])=>record[name]).map(([name,title])=>'<div><dt>'+safe(title)+'</dt><dd>'+linkedText(record[name])+'</dd></div>').join('');
  return '<section class="detail-card" data-detail="'+key+'" aria-label="'+label+'"><h4>'+label+'</h4>'+
   (summary?'<dl>'+summary+'</dl>':'')+
   '<details'+(summary?' class="saved-detail"':'')+'><summary>'+(summary?'Изменить':'Добавить данные')+'</summary>'+
   '<form data-trip-detail="'+key+'"><div class="detail-fields">'+pairs.map(([name,title])=>
    '<label>'+safe(title)+'<input name="'+name+'" maxlength="200" value="'+safe(record[name]||'')+'"></label>'
   ).join('')+'</div><div class="actions"><button class="primary" type="submit">Сохранить</button></div></form></details><p role="status" class="muted" data-status></p></section>';
}
function parseTripPrice(value){
 if(typeof value!=='string')return null;
 const aliases={RUB:'RUB','₽':'RUB','РУБ':'RUB','РУБ.':'RUB',CNY:'CNY','¥':'CNY','元':'CNY','ЮАНЬ':'CNY','ЮАНЯ':'CNY','ЮАНЕЙ':'CNY',USD:'USD','$':'USD',EUR:'EUR','€':'EUR'};
 const match=value.trim().toUpperCase().match(/^(?:(₽|¥|€|\$)\s*)?([0-9]+(?:[ \u00a0\u202f][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*([A-Z]{3}|РУБ\.?|ЮАНЬ|ЮАНЯ|ЮАНЕЙ|[₽¥€$元])?$/u);
 if(!match || (match[1]&&match[3]))return null;
 const currency=aliases[match[1]||match[3]||'RUB'];
 const cents=Math.round(Number(match[2].replace(/\s/g,'').replace(',','.'))*100);
 return currency && Number.isSafeInteger(cents) ? {currency,cents} : null;
}
const yuanRate={value:null, date:null, attemptedAt:0, status:'idle'};
async function refreshYuanRate(){
 if(yuanRate.status==='loading'||Date.now()-yuanRate.attemptedAt<3600000)return;
 yuanRate.status='loading';
 yuanRate.attemptedAt=Date.now();
 try {
  const response=await fetch('https://open.er-api.com/v6/latest/CNY',{signal:AbortSignal.timeout(8000),credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('Exchange rate unavailable');
  const data=await response.json();
  const rate=data.rates?.RUB, date=new Date(data.time_last_update_unix*1000);
  if(data.result!=='success'||data.base_code!=='CNY'||!Number.isFinite(rate)||rate<=0||!Number.isFinite(date.getTime()))throw new Error('Invalid exchange rate');
  Object.assign(yuanRate,{value:rate,date,status:'ready'});
 }catch{
  yuanRate.status='error';
 }
 if(location.hash==='#expenses')render();
}
function yuanConversion(cents,rubCents){
 if(!cents)return '';
 const rate=yuanRate.value;
 if(!rate)return '<p class="muted" role="status">'+(yuanRate.status==='error'?'Курс юаня недоступен. Сумма в юанях показана отдельно.':'Загружаем курс юаня…')+'</p>';
 const converted=Math.round(cents*rate);
 const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Vladivostok',dateStyle:'medium'}).format(yuanRate.date);
 const shownRate=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:6}).format(rate);
 return '<p><strong>Итого в рублях с учётом юаней: ≈ '+rub((rubCents+converted)/100)+'</strong></p><p>Сумма в юанях: ≈ '+rub(converted/100)+'</p><p class="muted">1 CNY = '+shownRate+' ₽ · курс на '+date+' · <a href="https://www.exchangerate-api.com/" target="_blank" rel="noopener noreferrer">ExchangeRate-API</a>'+(yuanRate.status==='error'?' · последнее доступное значение':'')+'</p>';
}
function expenseSummary(){
 const flights=31324+60306;
 const records=tripDetails();
 const bookedHotels=days.reduce((sum,day)=>sum+(day[5]&&!parseTripPrice(records[day[0]+':hotel']?.price)?Math.round(hotels[day[5]][2]*100):0),0);
 const totals=new Map([['RUB',flights*100+bookedHotels]]);
 let uncounted=0;
 for(const [key,record] of Object.entries(tripDetails())){
  if(!record?.price)continue;
  const [date,type]=key.split(':');
  if(!detailFields[type])continue;
  if(key==='26:ticket')continue;
  const money=parseTripPrice(record.price);
  if(!money){uncounted++;continue;}
  totals.set(money.currency,(totals.get(money.currency)||0)+money.cents);
 }
 const yuan=totals.get('CNY');
 if(yuan)void refreshYuanRate();
 const amounts=Array.from(totals,([currency,cents])=>'<strong>'+new Intl.NumberFormat('ru-RU',{style:'currency',currency}).format(cents/100)+'</strong>').join('');
 return '<section class="card expense-card"><h2>Известные расходы</h2><div class="expense-totals">'+amounts+'</div>'+yuanConversion(yuan,totals.get('RUB'))+'<p>Подтверждённые бронирования: авиабилеты '+rub(flights)+' · отели '+rub(bookedHotels/100)+'.</p><p class="muted">Для юаней укажите валюту, например 350 CNY или 350 юаней. Сумма без валюты считается рублёвой. Каждый подтверждённый заказ учтён один раз.</p>'+(uncounted?'<p class="muted">Цен вне итога: '+uncounted+'. Укажите сумму и валюту, например 350 CNY.</p>':'')+'</section>';
}
function hotelDates(id){
 const [, , , , checkIn,checkOut]=hotels[id];
 return '<p class="stay-dates"><strong>Заезд</strong> '+checkIn+' января 2027 · <strong>Выезд</strong> '+(checkOut?checkOut+' января 2027':'уточняется')+'</p>';
}
function dayInfo(date,text){
 const records=tripDetails();
 const present=type=>Object.values(records[date+':'+type]||{}).some(Boolean);
 if(date==='20'&&present('ticket'))return '';
 if(date==='26'&&present('ticket')&&/уточн/.test(text))return '';
 if(date==='18–20'&&present('hotel'))return present('transfer')?'':'Переезд из Ханчжоу уточнить';
 if(date==='23–24'&&present('hotel'))return 'Выезд из Manyuan Resort Hotel 23 января'+(present('transfer')?'':' · транспорт и время уточнить');
 if(date==='25'&&present('hotel'))return text.replace(' · отель на 25 января уточнить','');
 return text;
}
function trip(){
 return hero('Китай · 15–26 января','Ваш маршрут на январь 2027 года')+'<section><h2>Дни поездки</h2><p class="muted">Добавленные данные сохраняются в этом браузере. Цена без валюты — рубли; юани указывайте как CNY или юаней.</p><button type="button" data-export>Скачать резервную копию</button><div class="days">'+days.map(([date,title,info,cost,city,hotel])=>'<article class="card day"><div class="date">'+date+' янв.</div><div><h3>'+safe(title)+'</h3><p>'+safe(dayInfo(date,info))+'</p>'+(cost?'<p class="muted">'+safe(dayInfo(date,cost))+'</p>':'')+''+(city?'<a class="plain accent" href="#city/'+city+'">Путеводитель: '+cities[city].name+'</a>':'')+detailCards(date)+'</div></article>').join('')+'</div></section><section><h2>Города</h2>'+cityCards()+'</section>';
}
function hotel(id){
 const [name,cityName,price,room]=hotels[id];
 const associated=Object.entries(cities).find(([,c])=>c.hotel===id);
 const taxi=hotelAddresses[id];
 const taxiText=taxi.local ? taxi.local : name+'\n'+taxi.address;
 return hero(name,cityName)+'<article class="card">'+hotelDates(id)+'<section class="taxi-card"><h2>Адрес для такси</h2><textarea aria-label="Адрес отеля для такси" '+(taxi.local?'lang="zh" ':'')+'rows="3" readonly>'+safe(taxiText)+'</textarea>'+(taxi.local?'<p class="muted">'+safe(taxi.address)+'</p>':'')+'<div class="actions"><button type="button" class="primary" data-copy-taxi>Скопировать адрес</button>'+link(map(taxi.local?.split('\n').at(-1)||name),'На карте')+'</div><p role="status" class="muted" data-taxi-status></p></section><span class="tag">Подтверждено</span><h2>'+rub(price)+'</h2>'+(room?'<p>'+safe(room)+'</p>':'')+'<div class="actions">'+link(taxi.url,'Страница отеля на Trip.com')+(associated?'<a class="btn primary" href="#city/'+associated[0]+'">Маршруты по городу</a>':'')+'</div></article>';
}
function directions(origin,stops,mode){
 const params=new URLSearchParams({api:'1',origin,destination:origin,waypoints:stops.join('|'),travelmode:mode});
 return 'https://www.google.com/maps/dir/?'+params;
}
function savedHotelStart(id){
 const date={shanghai:'18–20',chongqing:'23–24',beijing:'25',zhangjiajie:'20'}[id];
 if(!date)return '';
 const hotel=tripDetails()[date+':hotel'];
 return hotel ? (hotel.address||hotel.name||'') : '';
}
function startPoint(id,c){
 return state.starts[id] || savedHotelStart(id) || (c.hotel&&id!=='beijing'?hotels[c.hotel][0]:c.base);
}
function routeCard(id,c,route){
 const [title,travel,indices]=route, origin=startPoint(id,c), mode=state.modes[id]||'walking';
 const stops=indices.map(i=>c.places[i]);
 return '<article class="card route"><h3>'+safe(title)+'</h3><p>'+safe(travel)+'</p><ol><li><strong>Старт.</strong> '+safe(origin)+'</li>'+stops.map(([name,query])=>'<li><a class="plain" target="_blank" rel="noopener noreferrer" href="'+map(query+' '+c.name)+'">'+safe(name)+'</a></li>').join('')+'<li>Возвращение к точке старта</li></ol>'+link(directions(origin,stops.map(p=>p[1]+' '+c.name),mode),'Маршрут и время в Google Maps')+'</article>';
}
function placeCard(id,i,place,saved){
 const [name,zh,desc]=place, key=id+':'+i;
 return '<article class="card"><h3>'+safe(name)+'</h3><p class="muted" lang="zh">'+safe(zh)+'</p><p>'+safe(desc)+'</p><div class="actions">'+link(map(zh+' '+cities[id].name),'На карте')+'<button data-save="'+key+'" aria-pressed="'+saved.includes(key)+'">'+(saved.includes(key)?'В избранном':'Сохранить')+'</button></div></article>';
}
function city(id){
 const c=cities[id], saved=favorites(), category=state.category, preset=state.presets[id]||0;
 const defaultName=savedHotelStart(id) || c.baseName || hotels[c.hotel][0];
 let html=hero(c.name,c.dates)+'<section><h2>Маршруты от вашей точки старта</h2><div class="card route"><form id="route-options"><label>Точка старта<input name="start" placeholder="'+safe(defaultName)+'" value="'+safe(state.starts[id]||'')+'"></label><label>План<select name="preset">'+c.routes.map(([name],i)=>'<option value="'+i+'" '+(i===preset?'selected':'')+'>'+safe(name)+'</option>').join('')+'</select></label><label>Режим карты<select name="mode"><option value="walking">Пешком</option><option value="driving" '+(state.modes[id]==='driving'?'selected':'')+'>На машине</option></select></label><button class="primary">Показать</button>'+(c.hotel?'<a class="btn" href="#hotel/'+c.hotel+'">Карточка отеля</a>':'')+'</form><p class="muted">'+(savedHotelStart(id)?'Старт взят из данных отеля в маршруте.':id==='beijing'?'Для 25 января старт по умолчанию — PEK T3. Подтверждённый отель относится к 15 января.':c.hotel?'По умолчанию используется подтверждённый отель.':'Пока отель уточняется, старт — '+safe(defaultName)+'.')+' Порядок остановок предложен заранее. Карта рассчитывает время в пути. В парках проверьте часы работы и правила входа.</p></div>'+routeCard(id,c,c.routes[preset])+'</section><section><h2>Путеводитель</h2><div class="filters">'+Object.entries(categories).map(([key,label])=>'<button data-category="'+key+'" aria-pressed="'+(key===category)+'">'+label+'</button>').join('')+'</div><div class="grid">';
 if(category==='places') html+=c.places.map((p,i)=>placeCard(id,i,p,saved)).join('');
 if(category==='food') html+=c.food.map(([n,q,d])=>'<article class="card"><h3>'+safe(n)+'</h3><p lang="zh">'+safe(q)+'</p><p>'+safe(d)+'</p>'+link(map(q+' '+c.name),'Где попробовать')+'</article>').join('');
 if(category==='routes'||category==='tours') html+=c[category].map(r=>routeCard(id,c,r)).join('');
 return html+'</div></section>';
}
function render(){
 const [page,id]=location.hash.slice(1).split('/');
 if(page==='city'&&Object.hasOwn(cities,id)){app.innerHTML=city(id);return;}
 if(page==='hotel'&&Object.hasOwn(hotels,id)){app.innerHTML=hotel(id);return;}
 if(page==='cities'){app.innerHTML=hero('Города','Пять путеводителей по маршруту')+cityCards();return;}
 if(page==='expenses'){app.innerHTML=hero('Расходы','Китай · 15–26 января 2027')+expenseSummary();return;}
 if(page==='saved'){
  const cards=favorites().map(key=>{const [id,i]=key.split(':');return Object.hasOwn(cities,id)&&cities[id].places[i]?placeCard(id,Number(i),cities[id].places[i],favorites()):''}).join('');
  app.innerHTML=hero('Избранное','Места, сохранённые на этом устройстве')+(cards?'<div class="grid">'+cards+'</div>':'<p class="empty">Откройте путеводитель и нажмите «Сохранить» рядом с местом.</p>');return;
 }
 app.innerHTML=trip();
}
app.addEventListener('click',async event=>{
 const button=event.target.closest('button');
 if(!button)return;
 if(button.hasAttribute('data-export')){
 const data={details:tripDetails(),favorites:favorites(),version:1};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='china-trip-backup.json';a.click();URL.revokeObjectURL(url);return;
 }
 if(button.hasAttribute('data-copy-taxi')){
  const card=button.closest('.taxi-card'), address=card.querySelector('textarea'), status=card.querySelector('[data-taxi-status]');
  try{
   await navigator.clipboard.writeText(address.value);
   status.textContent='Адрес скопирован.';
  }catch{
   address.focus();
   address.select();
   status.textContent='Адрес выделен. Скопируйте его через меню устройства.';
  }
  return;
 }
 if(button.dataset.category){state.category=button.dataset.category;render();app.querySelector('[data-category="'+state.category+'"]').focus();return;}
 if(button.dataset.save){
  const key=button.dataset.save, items=favorites();
  const active=!items.includes(key);
  try{localStorage.setItem('china-trip-favorites',JSON.stringify(active?[...items,key]:items.filter(k=>k!==key)));}
  catch{button.textContent='Сохранение недоступно';return;}
  if(location.hash==='#saved'){render();return;}
  button.setAttribute('aria-pressed',String(active));button.textContent=active?'В избранном':'Сохранить';
 }
});
app.addEventListener('submit',event=>{
 const key=event.target.dataset.tripDetail;
 if(key){
  event.preventDefault();
  const [date,type]=key.split(':');
  if(!detailFields[type])return;
  const form=new FormData(event.target), card=event.target.closest('.detail-card'), status=card.querySelector('[data-status]');
  const record={...(tripDetails()[key]||{}),...Object.fromEntries(Object.keys(detailFields[type].fields).map(name=>[name,String(form.get(name)||'').trim()]))};
  const all=tripDetails();
  if(Object.values(record).some(Boolean))all[key]=record;
  else {status.textContent='Пустая запись не изменяет сохранённые данные.';return;}
  try{if(!localStorage.getItem('china-trip-details-backup-v1'))localStorage.setItem('china-trip-details-backup-v1',localStorage.getItem(detailKey)||'{}');localStorage.setItem(detailKey,JSON.stringify(all));}
  catch{status.textContent='Не удалось сохранить данные в этом браузере.';return;}
  render();
  const savedCard=app.querySelector('[data-detail="'+key+'"]');
  savedCard.querySelector('[data-status]').textContent='Данные сохранены.';
  savedCard.querySelector('summary').focus();
  return;
 }
 if(event.target.id!=='route-options')return;
 event.preventDefault();
 const id=location.hash.split('/')[1], form=new FormData(event.target);
 state.starts[id]=String(form.get('start')).trim();
 state.presets[id]=Number(form.get('preset'));
 state.modes[id]=String(form.get('mode'));
 render();
});
window.addEventListener('hashchange',()=>{state.category='places';render();window.scrollTo(0,0);});
render();
