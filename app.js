const app = document.getElementById('app');
const state = {category:'places', starts:{}, presets:{}, modes:{}};
const categories = {places:'Достопримечательности',food:'Еда',routes:'Вечерние прогулки',tours:'Экскурсии'};
const rub = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(n);
const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const map = query => 'https://www.amap.com/search?query=' + encodeURIComponent(query);
const link = (url,label,style='btn') => '<a class="'+style+'" target="_blank" rel="noopener noreferrer" href="'+safe(url)+'">'+safe(label)+'</a>';
const cityPhotos={
 beijing:'beijing-cover.webp',
 chongqing:'chongqing-night.webp',
 changzhou:'changzhou-cover.webp',
 hangzhou:'hangzhou-cover.webp',
 shanghai:'shanghai-cover.webp',
 zhangjiajie:'zhangjiajie-cover.webp'
};
function cityPhoto(id,lazy=false){
 return '<img class="city-photo" src="'+cityPhotos[id]+'" alt=""'+(lazy?' loading="lazy"':'')+' decoding="async">';
}
const hero = (title,sub,style='',cityId='') => '<div class="hero'+(style?' '+style:'')+'">'+
 (cityId?cityPhoto(cityId):'')+'<h1>'+safe(title)+'</h1><p>'+safe(sub)+'</p></div>';
const cityCards = () => '<div class="grid">'+Object.entries(cities).map(([id,c])=>
 '<a class="card citylink city-cover" href="#city/'+id+'">'+cityPhoto(id,true)+
 '<div class="city-cover-text"><h3>'+safe(c.name)+'</h3><p>'+safe(c.dates)+'</p></div></a>'
).join('')+'</div>';
function favorites(){
 try { const value=JSON.parse(localStorage.getItem('china-trip-favorites')||'[]'); return Array.isArray(value)?value:[]; }
 catch { return []; }
}
const missingDetails = {
 '17':['transfer','ticket'], '18–20':['hotel'],
 '20':['transfer','ticket','hotel'], '21–22':[], '23–24':['transfer','ticket','hotel'],
 '25':['hotel'], '26':['ticket']
};
const detailFields = {
 transfer: {label:'Переезд', fields:{route:'Откуда и куда', transport:'Вид транспорта', time:'Дата и местное время'}},
 flight: {label:'Перелёт', fields:{service:'Номер рейса',airline:'Авиакомпания',departureAirport:'Аэропорт вылета',departureTime:'Местное время вылета',arrivalAirport:'Аэропорт прилёта',arrivalTime:'Местное время прилёта',time:'Уточнения по рейсу',price:'Цена и валюта',url:'Ссылка на билет'}},
 ticket: {label:'Билет', fields:{service:'Номер рейса или поезда', time:'Время и место отправления / прибытия', price:'Цена и валюта', url:'Ссылка на билет'}},
 hotel: {label:'Отель', fields:{name:'Название отеля', address:'Адрес',addressZh:'Адрес для такси на китайском', stay:'Даты заезда и выезда', price:'Цена и валюта', url:'Ссылка на отель'}}
};
const flightBookings=[
 {days:['15','16'],totalRub:31324},
 {days:['25','26'],totalRub:60306}
];
const detailKey = 'china-trip-details-v1';
const detailBackupKey = 'china-trip-details-backup-v1';
const tripDataUrl = 'https://jlxquozlyjxkkhwvqxiz.supabase.co/functions/v1/trip-data';
const sharedTrip = {records:{}};
async function tripData(payload){
 const options={cache:'no-store',signal:AbortSignal.timeout(10000)};
 if(payload)Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const result=await fetch(tripDataUrl,options);
 const data=await result.json();
 if(!result.ok)throw new Error(data.error||'storage');
 for(const row of data.records)sharedTrip.records[row.key]=row;
}
function tripSaveMessage(error){
 const messages={
  password:'Пароль неверный.',
  conflict:'Запись уже изменилась на сайте. Обнови страницу перед сохранением.',
  setup:'Пароль для сохранения на сайте ещё не настроен.',
  invalid:'Запись содержит неподдерживаемые данные.'
 };
 return messages[error.message]||'Не удалось сохранить на сайте. Проверь подключение и попробуй снова.';
}
function passwordField(){
 return '<label>Пароль для сохранения<input type="password" name="editPassword" autocomplete="current-password" required></label>';
}
function readTripDetails(key){
 try {
  const data=JSON.parse(localStorage.getItem(key)||'{}');
  return data && typeof data==='object' && !Array.isArray(data) ? data : {};
 } catch { return {}; }
}
function localTripDetails(){
 const records=readTripDetails(detailKey);
 const backup=readTripDetails(detailBackupKey);
 for(const key of ['20:transfer','20:ticket']){
  if(!Object.hasOwn(records,key)&&backup[key]&&Object.values(backup[key]).some(Boolean))records[key]=backup[key];
 }
 // Older versions used both itinerary cards for transport. Reassign the view without rewriting browser storage.
 const inboundCities=/ханчжоу|нанкин|чанчжоу|hangzhou|nanjing|changzhou/i;
 const flightDestination=/чжанц|zhangjiajie|\bdyg\b/i;
 const transferText=Object.values(records['18–20:transfer']||{}).join(' ');
 const inboundTransfer=inboundCities.test(transferText)&&!flightDestination.test(transferText);
 const shanghaiEntries=[];
 for(const type of ['transfer','ticket']){
  const key='18–20:'+type;
  const record=records[key];
  const values=Object.values(record||{}).filter(Boolean);
  if(!values.length)continue;
  const description=values.join(' ');
  if(!flightDestination.test(description)&&(inboundTransfer||inboundCities.test(description)))continue;

  const destination='20:'+type;
  records[destination]={...record,...records[destination]};
  shanghaiEntries.push(key);
 }
 return Object.fromEntries(Object.entries(records).filter(([key])=>!shanghaiEntries.includes(key)));
}

function tripDetails(){
 return {...localTripDetails(),...Object.fromEntries(Object.entries(sharedTrip.records).map(([key,row])=>[key,row.value]))};
}

function linkedText(value){
 return String(value).split(/(https?:\/\/[^\s<>"']+)/g).map(part=>/^https?:\/\//i.test(part)?link(part,'Открыть ссылку'):safe(part)).join('');
}
function hotelBookingLink(key,record){
 const url=[record.url,record.name,record.address,record.stay]
  .flatMap(value=>String(value||'').match(/https?:\/\/[^\s<>"']+/gi)||[])
  .find(value=>{
   try{
    const {hostname}=new URL(value);
    return hostname==='trip.com'||hostname.endsWith('.trip.com');
   }
   catch{return false;}
  });
 const name=String(record.name).replace(/https?:\/\/[^\s<>"']+/gi,'').trim()||'Открыть отель';
 if(url)return link(url,'Открыть на Trip.com');
 const date=key.split(':')[0];
 const city=days.find(day=>day[0]===date)?.[4];
 const tripCities={beijing:[1,'Beijing'],shanghai:[2,'Shanghai'],chongqing:[4,'Chongqing'],
  hangzhou:[17,'Hangzhou'],zhangjiajie:[27,'Zhangjiajie'],changzhou:[213,'Changzhou']};
 const [cityId,cityName]=tripCities[city]||[];
 const search=new URLSearchParams({city:cityId,cityName,country:'1',searchWord:name});
 return link(record.name&&cityId?'https://ru.trip.com/hotels/list?'+search:'https://ru.trip.com/hotels/','Найти на Trip.com');
}
function baseRecord(date,type){
 const day=days.find(d=>d[0]===date);
 if(!day)return {};
 if(type==='ticket'&&Object.hasOwn(flights,date))return flights[date];
 if(date==='20'&&type==='transfer')return {route:day[1],transport:'Перелёт'};
 if(type==='hotel'&&day[5]){
  const h=hotels[day[5]], address=hotelAddresses[day[5]];
  return {name:h[0],price:String(h[2]),stay:h[4]+'–'+h[5]+' января 2027',address:address.address,addressZh:address.local,url:address.url};
 }
 return {};
}
function detailRecord(date,type,saved){
 const defaults=baseRecord(date,type);
 if(type==='hotel'&&saved?.name&&saved.name!==defaults.name)return saved;
 return {...defaults,...saved};
}

function detailCards(date){
 const types=[...(missingDetails[date]||[])], records=tripDetails();
 const day=days.find(d=>d[0]===date);
 if(date==='18–20'){
  const existing=['transfer','ticket'].filter(type=>Object.values(records[date+':'+type]||{}).some(Boolean));
  types.unshift(...existing);
 }
 if(day?.[5]&&!types.includes('hotel'))types.push('hotel');
 if(Object.hasOwn(flights,date)&&!types.includes('ticket'))types.unshift('ticket');
 if(!types.length)return '';
 return '<div class="detail-list">'+types.map(type=>{
  const key=date+':'+type;
  const record=detailRecord(date,type,records[key]);
  const id=encodeURIComponent(date);
  if(type==='transfer'&&date==='20')return '';
  if(type==='ticket'&&Object.hasOwn(flights,date))return itineraryCard('flight',id,'Перелёт');
  if(type==='hotel')return itineraryCard('stay',id,'Отель',record.name);
  return detailCard(key,type,record);
 }).join('')+'</div>';
}
const itineraryIcons={
 flight:'<path d="M17 21v-8l2.8-2.8a2 2 0 0 0-2.8-2.8L14 10H6l-4 4h7l-4 4H3l-1 1 3 1 1 3 1-1v-2l4-4v7z"/>',
 stay:'<path d="M3 18v-9m18 9v-7a2 2 0 0 0-2-2h-8v6M3 15h18M3 11h4a2 2 0 0 1 2 2v2m-6 3v2m18-2v2"/>'
};
function itineraryCard(page,id,label,name){
 const icon='<svg class="itinerary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+itineraryIcons[page]+'</svg>';
 return '<a class="detail-card itinerary-link" href="#'+page+'/'+id+'">'+icon+'<div class="itinerary-text"><strong>'+label+'</strong>'+
  (name?'<span>'+safe(name)+'</span>':'')+'</div><span aria-hidden="true" class="itinerary-chevron">›</span></a>';
}
function fieldsFor(date,type){
 if(type!=='ticket'||!Object.hasOwn(flights,date))return detailFields[type];
 if(date==='20')return detailFields.flight;
 const {price,...fields}=detailFields.flight.fields;
 return {label:detailFields.flight.label,fields};
}
function detailCard(key,type,record){
  const {label,fields}=fieldsFor(key.split(':')[0],type);
  const pairs=Object.entries(fields);
  const summary=pairs.filter(([name])=>record[name]&&(type!=='hotel'||(name!=='url'&&name!=='addressZh'))).map(([name,title])=>{
   const amount=name==='price'&&parseTripPrice(record[name]);
   const value=amount?new Intl.NumberFormat('ru-RU',{style:'currency',currency:amount.currency}).format(amount.cents/100):record[name];
   return '<div><dt>'+safe(title)+'</dt><dd>'+linkedText(value)+'</dd></div>';
  }).join('');
  return '<section class="detail-card" data-detail="'+key+'" aria-label="'+label+'"><h4>'+label+'</h4>'+
   (summary?'<dl>'+summary+'</dl>':'')+
   '<details'+(summary?' class="saved-detail"':'')+'><summary>'+(summary?'Изменить':'Добавить данные')+'</summary>'+
   '<form data-trip-detail="'+key+'" data-revision="'+(sharedTrip.records[key]?.revision||'')+'"><div class="detail-fields">'+pairs.map(([name,title])=>
    '<label>'+safe(title)+(name==='addressZh'?'<textarea name="addressZh" lang="zh" rows="3">'+safe(record[name]||'')+'</textarea>':
     '<input name="'+name+'" maxlength="200" value="'+safe(record[name]||'')+'">')+'</label>'
   ).join('')+passwordField()+'</div><div class="actions"><button class="primary" type="submit">Сохранить</button></div></form></details><p role="status" class="muted" data-status></p></section>';
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
 const records=tripDetails();
 const bookedHotels=days.reduce((sum,day)=>sum+(day[5]&&!parseTripPrice(records[day[0]+':hotel']?.price)?Math.round(hotels[day[5]][2]*100):0),0);
 const flightBookingCents=flightBookings.reduce((sum,booking)=>sum+booking.totalRub*100,0);
 const categories={ticket:new Map([['RUB',flightBookingCents]]),hotel:new Map([['RUB',bookedHotels]]),transfer:new Map()};
 let uncounted=0;
 for(const [key,record] of Object.entries(records)){
  if(!record?.price||key==='26:ticket')continue;
  const type=key.split(':')[1];
  if(!Object.hasOwn(categories,type))continue;
  const money=parseTripPrice(record.price);
  if(!money){uncounted++;continue;}
  const category=categories[type];
  category.set(money.currency,(category.get(money.currency)||0)+money.cents);
 }
 const totals=new Map();
 for(const category of Object.values(categories)){
  for(const [currency,cents] of category)totals.set(currency,(totals.get(currency)||0)+cents);
 }
 const yuan=totals.get('CNY');
 if(yuan)void refreshYuanRate();
 const format=([currency,cents])=>new Intl.NumberFormat('ru-RU',{style:'currency',currency}).format(cents/100);
 const amounts=Array.from(totals,amount=>'<strong>'+format(amount)+'</strong>').join('');
 const labels={ticket:'Авиабилеты и другие билеты',hotel:'Отели',transfer:'Переезды'};
 const breakdown=Object.entries(categories).filter(([,category])=>category.size).map(([type,category])=>
  '<li>'+labels[type]+' · '+Array.from(category,format).join(' + ')+'</li>').join('');
 return '<section class="card expense-card"><h2>Известные расходы</h2><div class="expense-totals">'+amounts+'</div>'+yuanConversion(yuan,totals.get('RUB'))+'<h3>В составе итога</h3><ul>'+breakdown+'</ul><p class="muted">Для юаней укажите валюту, например 350 CNY или 350 юаней. Сумма без валюты считается рублёвой.</p>'+(uncounted?'<p class="muted">Цен вне итога: '+uncounted+'. Укажите сумму и валюту, например 350 CNY.</p>':'')+'</section>';
}
function dayInfo(date,text){
 if(Object.hasOwn(flights,date))return '';
 const records=tripDetails();
 const present=type=>Object.values(records[date+':'+type]||{}).some(Boolean);
 if(date==='18–20'&&present('hotel'))return present('transfer')?'':'Переезд из Ханчжоу уточнить';
 if(date==='23–24'&&present('hotel'))return 'Выезд из Manyuan Resort Hotel 23 января'+(present('transfer')?'':' · транспорт и время уточнить');
 return text;
}
function trip(){
 const itinerary=days.map(([date,title,description,cost,city])=>{
  const info=dayInfo(date,description);
  const costInfo=dayInfo(date,cost);
  return '<article class="card day"><div class="date">'+date+' янв.</div><div><h3>'+safe(title)+'</h3>'+
   (info?'<p>'+safe(info)+'</p>':'')+(costInfo?'<p class="muted">'+safe(costInfo)+'</p>':'')+
   (city?'<a class="plain accent" href="#city/'+city+'">Путеводитель: '+cities[city].name+'</a>':'')+
   detailCards(date)+'</div></article>';
 }).join('');
 return hero('Китай · 15–26 января','Ваш маршрут на январь 2027 года','trip-hero')+
  '<section><h2>Дни поездки</h2>'+
  '<div class="days">'+itinerary+'</div></section><section><h2>Города</h2>'+cityCards()+'</section>'+
  '<div class="backup-download"><small>Сохранённые на сайте записи видны по обычной ссылке. Цена без валюты считается в рублях. Для юаней указывайте CNY или пишите «юаней».</small>'+
  '<button type="button" data-export>Скачать резервную копию</button></div>'+localImportForm();
}
const backToTrip='<p><a class="plain accent" href="#trip">← К маршруту</a></p>';
function savedHotel(id){
 const day=days.find(([date])=>encodeURIComponent(date)===id);
 if(!day)return '';
 const [date,title,,,city,hotelId]=day, key=date+':hotel';
 const record=detailRecord(date,'hotel',tripDetails()[key]);
 const cityName=hotels[hotelId]?.[1]||cities[city]?.name||title;
 const chineseAddress=record.addressZh||(/\p{Script=Han}/u.test(record.address||'')?record.address:'');
 const address=chineseAddress||record.address;
 const room=record.name===hotels[hotelId]?.[0]?hotels[hotelId]?.[3]:'';
 const taxi=chineseAddress?'<textarea aria-label="Адрес отеля для такси" lang="zh" rows="3" readonly>'+safe(chineseAddress)+'</textarea>'+
  '<div class="actions"><button type="button" class="primary" data-copy-taxi>Скопировать для такси</button></div><p role="status" class="muted" data-taxi-status></p>':
  '<p class="muted">Китайский адрес можно добавить через «Изменить».</p>';
 return hero(record.name||'Отель',cityName)+'<article class="card">'+backToTrip+
  detailCard(key,'hotel',record)+(room?'<p>'+safe(room)+'</p>':'')+
  '<section class="taxi-card"><h2>Адрес для такси</h2>'+taxi+'</section>'+
  '<div class="actions">'+(address?link(map(address.split('\n').at(-1)),'На карте'):'')+
   hotelBookingLink(key,record)+(city?'<a class="btn" href="#city/'+city+'">Маршруты по городу</a>':'')+'</div></article>';
}
function flight(id){
 const day=days.find(([date])=>date===id);
 if(!day||!Object.hasOwn(flights,id))return '';
 const records=tripDetails(), key=id+':ticket';
 const record=detailRecord(id,'ticket',records[key]);
 const booking=flightBookings.find(item=>item.days.includes(id));
 const cost=booking
  ?'<div class="flight-cost"><strong>'+rub(booking.totalRub)+'</strong> · за оба рейса в одном заказе, '+booking.days.join('–')+' января</div>'
  :record.price?'':'<p class="muted">Стоимость перелёта пока не указана.</p>';
 return hero(day[1],id+' января 2027 · Перелёт')+'<article class="card">'+backToTrip+
  '<p class="muted">Время вылета и прилёта указано местное. Недостающие данные можно добавить в карточку.</p>'+
  detailCard(key,'ticket',record)+cost+(id==='16'?'<p>'+safe(day[3].split(' · ')[0])+'</p>':'')+
  (id==='20'&&records['20:transfer']?detailCard('20:transfer','transfer',records['20:transfer']):'')+'</article>';
}
const dateInRussian=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'});
const dayPlural=new Intl.PluralRules('ru');
const dayWords={one:'день',few:'дня',many:'дней',other:'дня'};
function updateTripClock(now=new Date()){
 const year=now.getFullYear(), month=now.getMonth(), day=now.getDate();
 const dateLabel=document.getElementById('today');
 dateLabel.dateTime=[year,String(month+1).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
 dateLabel.textContent=dateInRussian.format(now);
 const countdown=document.getElementById('trip-countdown');
 if(!countdown)return;
 const daysLeft=(Date.UTC(2027,0,15)-Date.UTC(year,month,day))/86400000;
 countdown.hidden=daysLeft<0;
 countdown.textContent=daysLeft>0?'До поездки '+daysLeft+' '+dayWords[dayPlural.select(daysLeft)]:daysLeft===0?'Сегодня вылет':'';
}
function directions(origin,stops,mode){
 const params=new URLSearchParams({api:'1',origin,destination:origin,waypoints:stops.join('|'),travelmode:mode});
 return 'https://www.google.com/maps/dir/?'+params;
}
function savedHotelStart(id){
 const date={changzhou:'16',shanghai:'18–20',chongqing:'23–24',beijing:'25',zhangjiajie:'20'}[id];
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
 let html=hero(c.name,c.dates,'city-cover city-hero',id)+'<section><h2>Маршруты от вашей точки старта</h2><div class="card route"><form id="route-options"><label>Точка старта<input name="start" placeholder="'+safe(defaultName)+'" value="'+safe(state.starts[id]||'')+'"></label><label>План<select name="preset">'+c.routes.map(([name],i)=>'<option value="'+i+'" '+(i===preset?'selected':'')+'>'+safe(name)+'</option>').join('')+'</select></label><label>Режим карты<select name="mode"><option value="walking">Пешком</option><option value="driving" '+(state.modes[id]==='driving'?'selected':'')+'>На машине</option></select></label><button class="primary">Показать</button>'+(c.hotel?'<a class="btn" href="#hotel/'+c.hotel+'">Карточка отеля</a>':'')+'</form><p class="muted">'+(savedHotelStart(id)?'Старт взят из данных отеля в маршруте.':id==='beijing'?'Для 25 января старт по умолчанию — PEK T3. Подтверждённый отель относится к 15 января.':c.hotel?'По умолчанию используется подтверждённый отель.':'Пока отель уточняется, старт — '+safe(defaultName)+'.')+' Порядок остановок предложен заранее. Карта рассчитывает время в пути. В парках проверьте часы работы и правила входа.</p></div>'+routeCard(id,c,c.routes[preset])+'</section><section><h2>Путеводитель</h2><div class="filters">'+Object.entries(categories).map(([key,label])=>'<button data-category="'+key+'" aria-pressed="'+(key===category)+'">'+label+'</button>').join('')+'</div><div class="grid">';
 if(category==='places') html+=c.places.map((p,i)=>placeCard(id,i,p,saved)).join('');
 if(category==='food') html+=c.food.map(([n,q,d])=>'<article class="card"><h3>'+safe(n)+'</h3><p lang="zh">'+safe(q)+'</p><p>'+safe(d)+'</p>'+link(map(q+' '+c.name),'Где попробовать')+'</article>').join('');
 if(category==='routes'||category==='tours') html+=c[category].map(r=>routeCard(id,c,r)).join('');
 return html+'</div></section>';
}
function render(){
 const [page,id]=location.hash.slice(1).split('/');
 const activePage=page==='city'?'cities':['cities','saved','expenses'].includes(page)?page:'trip';
 for(const tab of document.querySelectorAll('header nav a')){
  if(tab.hash==='#'+activePage)tab.setAttribute('aria-current','page');
  else tab.removeAttribute('aria-current');
 }
 if(page==='city'&&Object.hasOwn(cities,id)){app.innerHTML=city(id);return;}
 if(page==='hotel'&&Object.hasOwn(hotels,id)){
  app.innerHTML=savedHotel(encodeURIComponent(days.find(day=>day[5]===id)[0]));return;
 }
 if(page==='stay'||page==='flight'){
  const content=page==='stay'?savedHotel(id):flight(id);
  if(content){app.innerHTML=content;return;}
 }
 if(page==='cities'){app.innerHTML=hero('Города','Путеводители по маршруту')+cityCards();return;}
 if(page==='expenses'){app.innerHTML=hero('Расходы','Китай · 15–26 января 2027')+expenseSummary();return;}
 if(page==='saved'){
  const cards=favorites().map(key=>{const [id,i]=key.split(':');return Object.hasOwn(cities,id)&&cities[id].places[i]?placeCard(id,Number(i),cities[id].places[i],favorites()):''}).join('');
  app.innerHTML=hero('Избранное','Места, сохранённые на этом устройстве')+(cards?'<div class="grid">'+cards+'</div>':'<p class="empty">Откройте путеводитель и нажмите «Сохранить» рядом с местом.</p>');return;
 }
 app.innerHTML=trip();
 updateTripClock();
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
function localImportForm(){
 const pending=Object.keys(localTripDetails()).some(key=>!Object.hasOwn(sharedTrip.records,key));
 if(!pending)return '';
 return '<details class="detail-card local-import"><summary>Перенести записи из этого браузера на сайт</summary>'+
  '<form data-publish-local><p>Записи, которые уже есть на сайте, сохранятся.</p><div class="detail-fields">'+passwordField()+'</div>'+
  '<div class="actions"><button type="submit" class="primary">Перенести записи</button></div><p role="status" data-status></p></form></details>';
}
app.addEventListener('submit',async event=>{
 const element=event.target;
 const key=element.dataset.tripDetail;
 if(key||element.hasAttribute('data-publish-local')){
  event.preventDefault();
  const form=new FormData(element);
  const status=(key?element.closest('.detail-card'):element).querySelector('[data-status]');
  const button=element.querySelector('button[type="submit"]');
  const password=String(form.get('editPassword')||'');
  let payload;
  if(key){
   const [date,type]=key.split(':');
   if(!Object.hasOwn(detailFields,type))return;
   const value={...(tripDetails()[key]||{}),...Object.fromEntries(Object.keys(fieldsFor(date,type).fields).map(name=>[name,String(form.get(name)||'').trim()]))};
   if(!Object.values(value).some(Boolean)){status.textContent='Заполни хотя бы одно поле.';return;}
   payload={key,value,password,revision:element.dataset.revision||null};
  }else{
   payload={operation:'import',records:localTripDetails(),password};
  }
  element.querySelector('[name=editPassword]').value='';
  button.disabled=true;
  status.textContent='Сохраняю на сайте…';
  try{
   await tripData(payload);
   render();
   const savedStatus=key?app.querySelector('[data-detail="'+key+'"] [data-status]'):document.getElementById('trip-sync-status');
   if(savedStatus)savedStatus.textContent=key?'Сохранено на сайте.':'Записи перенесены на сайт.';
  }catch(error){
   status.textContent=tripSaveMessage(error);
  }finally{button.disabled=false;}
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
window.addEventListener('focus',()=>updateTripClock());
window.setInterval(updateTripClock,30000);
window.addEventListener('hashchange',()=>{state.category='places';render();window.scrollTo(0,0);});
updateTripClock();
render();
tripData().then(()=>{
 if(!app.querySelector('details[open]'))render();
}).catch(()=>{
 document.getElementById('trip-sync-status').textContent='Сайт с общими записями пока недоступен.';
});
