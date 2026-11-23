const ticketFileUrls=new Map();

function ticketFilesCard(key,webLink){
 return '<div class="ticket-files" data-ticket-files="'+safe(key)+'">'+
  '<div class="actions">'+(webLink?linkedText(webLink):'')+'<button type="button" data-select-ticket-pdf>Прикрепить PDF</button>'+
  '<input type="file" accept=".pdf,application/pdf" multiple hidden aria-label="Выбрать билеты PDF" data-ticket-pdf></div>'+
  '<p class="muted">PDF хранится в этом браузере.</p>'+
  '<ul class="ticket-file-list" data-ticket-file-list hidden></ul>'+
  '<p class="muted" role="status" data-ticket-file-status></p></div>';
}

function openTicketFileDatabase(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('china012027-ticket-files',1);
  request.onupgradeneeded=()=>{
   const files=request.result.createObjectStore('files',{keyPath:'id',autoIncrement:true});
   files.createIndex('ticket','ticket');
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
async function readTicketFiles(ticket){
 const db=await openTicketFileDatabase();
 try{
  return await new Promise((resolve,reject)=>{
   const request=db.transaction('files','readonly').objectStore('files').index('ticket').getAll(ticket);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
 }finally{db.close();}
}
async function storeTicketFiles(ticket,files){
 const data=await Promise.all(files.map(async file=>{
  const start=await file.slice(0,1024).text();
  if(!/%PDF-\d\.\d/.test(start))throw new Error('not-pdf');
  return {ticket,name:file.name,blob:file.slice(0,file.size,'application/pdf')};
 }));
 const db=await openTicketFileDatabase();
 try{
  await new Promise((resolve,reject)=>{
   const transaction=db.transaction('files','readwrite');
   transaction.oncomplete=resolve;
   transaction.onabort=()=>reject(transaction.error);
   const store=transaction.objectStore('files');
   for(const file of data)store.add(file);
  });
 }finally{db.close();}
}
async function loadTicketFileList(card){
 const ticket=card.dataset.ticketFiles;
 const list=card.querySelector('[data-ticket-file-list]');
 const status=card.querySelector('[data-ticket-file-status]');
 try{
  const files=await readTicketFiles(ticket);
  if(!card.isConnected)return;
  list.innerHTML=files.map(file=>{
   if(!ticketFileUrls.has(file.id))ticketFileUrls.set(file.id,URL.createObjectURL(file.blob));
   const url=ticketFileUrls.get(file.id);
   return '<li>'+link(url,'Открыть PDF','plain accent')+
    ' <span>'+safe(file.name)+'</span> <a class="plain" href="'+url+'" download="'+safe(file.name)+'">Скачать</a></li>';
  }).join('');
  list.hidden=!files.length;
 }catch{
  if(card.isConnected)status.textContent='Браузер не смог открыть локальное хранилище билетов.';
 }
}
async function attachTicketFiles(input){
 const files=Array.from(input.files||[]);
 if(!files.length)return;
 const card=input.closest('[data-ticket-files]');
 const status=card.querySelector('[data-ticket-file-status]');
 const button=card.querySelector('[data-select-ticket-pdf]');
 button.disabled=true;
 status.textContent='Прикрепляю PDF…';
 try{
  await storeTicketFiles(card.dataset.ticketFiles,files);
  status.textContent=files.length===1?'PDF прикреплён.':'PDF прикреплены.';
  await loadTicketFileList(card);
 }catch(error){
  status.textContent=error?.message==='not-pdf'?'Выбери файл в формате PDF.':'Не удалось сохранить PDF в этом браузере.';
 }finally{
  input.value='';
  button.disabled=false;
 }
}
