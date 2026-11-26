"""Hotel-only mail import. Email bodies and guest details are never persisted."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from email.policy import default
from email.utils import parseaddr, parsedate_to_datetime
import email
import hashlib
import hmac
from html.parser import HTMLParser
import imaplib
import json
import re
import unicodedata
import urllib.request
from urllib.parse import urlencode

ENDPOINT = 'https://jlxquozlyjxkkhwvqxiz.supabase.co/functions/v1/mail-hotel-import'
CITIES = {'Шанхай':'shanghai', 'Пекин':'beijing', 'Чанчжоу':'changzhou',
          'Ханчжоу':'hangzhou', 'Чжанцзяцзе':'zhangjiajie', 'Чунцин':'chongqing'}
MONTHS = {'янв':1,'фев':2,'мар':3,'апр':4,'мая':5,'июн':6,'июл':7,'авг':8,'сен':9,'сент':9,'окт':10,'ноя':11,'дек':12}

def clean(text):
    return ' '.join(''.join(c for c in str(text) if unicodedata.category(c) != 'Cf').split())

class MailText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.parts=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','head'): self.skip += 1
        if tag in ('br','div','p','td','tr','li','h1','h2','h3'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script','style','head'): self.skip=max(0,self.skip-1)
        if tag in ('div','p','td','tr','li'): self.parts.append('\n')
    def handle_data(self, value):
        if not self.skip: self.parts.append(value)

def message_text(message):
    plain=[]; html=[]
    for part in message.walk():
        if part.get_content_disposition() == 'attachment': continue
        try:
            if part.get_content_type()=='text/plain': plain.append(part.get_content())
            if part.get_content_type()=='text/html': html.append(part.get_content())
        except (LookupError, UnicodeError): continue
    if plain and any(s.strip() for s in plain): return '\n'.join(plain)
    parser=MailText(); parser.feed('\n'.join(html))
    return '\n'.join(clean(line) for line in ''.join(parser.parts).splitlines() if clean(line))

def ru_date(text):
    match=re.search(r'(\d{1,2})\s+([а-я]+)\.?\s+(20\d{2})',text,re.I)
    if not match: return None
    day,month,year=match.groups()
    try: return date(int(year),MONTHS[month.lower()],int(day)).isoformat()
    except (KeyError,ValueError): return None

def digest(token, value):
    return hmac.new(token.encode(), value.encode(), hashlib.sha256).hexdigest()

def parse_hotel(message, token):
    sender=parseaddr(str(message.get('From','')))[1].lower()
    if sender != 'ru_htl_noreply@trip.com': return None
    subject=clean(message.get('Subject',''))
    if not re.search(r'подтверждение бронирования|бронирование.*отмен|изменени.*бронирован',subject,re.I): return None
    auth=' '.join(str(v) for v in message.get_all('Authentication-Results',[]))
    verified=bool(re.search(r'mxs\.mail\.ru;.*?dkim=pass\s+header\.d=trip\.com(?:;|\s)',auth,re.I|re.S))
    text=message_text(message)
    lines=[clean(line) for line in text.splitlines() if clean(line)]
    text='\n'.join(lines)
    booking=re.search(r'(?:Номер бронирования|№ бронирования:)\s*(\d{10,25})',text,re.I)
    if not booking: return None
    # Booking number is used in memory only to derive an opaque technical key.
    booking_key=digest(token,'tripcom-hotel:'+booking.group(1))
    try: received=parsedate_to_datetime(str(message['Date'])).astimezone(timezone.utc)
    except (ValueError,TypeError,OverflowError): return None
    event_id=digest(token,str(message.get('Message-ID','')) or text)
    kind='cancelled' if re.search(r'бронирование.*отмен',subject,re.I) else 'confirmed'
    match=re.search(r'\[Подтверждение бронирования\]\s*(.*?)\s*[—–]\s*ваше бронирование',subject,re.I)
    name=match.group(1) if match else ''
    city=next((code for title,code in CITIES.items() if re.search(r'в г\.\s*'+title+r'\b',text,re.I)),None)
    def following(label):
        for i,line in enumerate(lines):
            if line.casefold()==label.casefold(): return lines[i+1] if i+1<len(lines) else ''
        return ''
    checkin_line=following('Заезд'); checkout_line=following('Выезд')
    checkin=ru_date(checkin_line); checkout=ru_date(checkout_line)
    if not checkin or not checkout:
        dates=re.search(r'заезд:\s*(.*?),\s*выезд:\s*(.*?)\)',text,re.I)
        if dates: checkin=ru_date(dates.group(1));checkout=ru_date(dates.group(2))
    address=following('Адрес')
    address_zh=''
    if address:
        at=lines.index(address)
        if at+1<len(lines) and re.search(r'[\u3400-\u9fff]',lines[at+1]): address_zh=lines[at+1]
    currency=''; total_minor=None
    for i,line in enumerate(lines):
        if line=='Общая стоимость':
            for candidate in lines[i+1:i+5]:
                money=re.fullmatch(r'([\d\s]+[,.]\d{2})\s*(₽|RUB|CNY|¥|元)',candidate)
                if money:
                    total_minor=int(Decimal(money.group(1).replace(' ','').replace(',','.'))*100)
                    currency='RUB' if money.group(2) in ('₽','RUB') else 'CNY'
                    break
            break
    room=''
    for i,line in enumerate(lines):
        if line=='Имена гостей' and i>=2 and re.fullmatch(r'\d+ номер.*\d+ ноч.*',lines[i-1]):
            room=lines[i-2];break
    def clock(line):
        m=re.search(r'\b(\d{2}:\d{2})\b',line)
        return m.group(1) if m else ''
    hotel={'name':name[:300],'city':city,'checkin':checkin,'checkout':checkout,
           'address':address[:500],'addressZh':address_zh[:500], 'room':room[:300],
           'checkinTime':clock(checkin_line),'checkoutTime':clock(checkout_line),
           'totalMinor':total_minor,'currency':currency,'paid':'Оплачено' in lines}
    complete=all((name,city,checkin,checkout,address,currency,total_minor is not None))
    if checkin and checkout:
        complete=complete and 0 < (date.fromisoformat(checkout)-date.fromisoformat(checkin)).days <= 90
    return {'eventId':event_id,'bookingKey':booking_key,'sourceAt':received.isoformat(),
            'kind':kind,'verified':verified,'complete':bool(complete),'hotel':hotel}

def public_fields(hotel):
    return {'name':hotel['name'],'address':hotel['address'],'addressZh':hotel['addressZh'],
            'stay':f"{hotel['checkin']} — {hotel['checkout']}",
            'price':f"{hotel['totalMinor']/100:.2f} {hotel['currency']}",
            'url':'https://ru.trip.com/hotels/list?'+urlencode({'searchWord':hotel['name']})}

def post_event(event, token):
    request=urllib.request.Request(ENDPOINT,json.dumps(event).encode('utf-8'),
        headers={'Content-Type':'application/json','Authorization':'Bearer '+token},method='POST')
    with urllib.request.urlopen(request,timeout=25) as response: return json.load(response)

def sync_once(config, token, state_file, send=post_event):
    state=json.loads(state_file.read_text('utf-8')) if state_file.exists() else {}
    client=imaplib.IMAP4_SSL('imap.mail.ru',993,timeout=25)
    count={'applied':0,'review':0,'skipped':0,'duplicate':0}
    try:
        client.login(config['address'],config['mail_password']);client.select('INBOX',readonly=True)
        validity=client.response('UIDVALIDITY')[1][0].decode()
        last=int(state.get('uid',0)) if state.get('validity')==validity else 0
        since=(datetime.now(timezone.utc)-timedelta(days=90)).strftime('%d-%b-%Y')
        status,data=client.uid('SEARCH',None,'FROM','"RU_HTL_NoReply@trip.com"','SINCE',since)
        if status!='OK': raise RuntimeError('Mail search failed')
        for uid in sorted(int(x) for x in data[0].split() if int(x)>last):
            status,parts=client.uid('FETCH',str(uid),'(BODY.PEEK[])')
            if status!='OK': raise RuntimeError('Mail fetch failed')
            raw=next(x[1] for x in parts if isinstance(x,tuple))
            event=parse_hotel(email.message_from_bytes(raw,policy=default),token)
            # Persist only an import cursor; never mail contents or booking IDs.
            if event:
                result=send(event,token)
                action=result.get('action','skipped')
                count[action if action in count else 'skipped']+=1
            state={'validity':validity,'uid':uid}
            temporary=state_file.with_suffix('.tmp')
            temporary.write_text(json.dumps(state),'utf-8');temporary.replace(state_file)
    finally:
        try: client.logout()
        except Exception: pass
    return count

def sync_loop(config, private_folder, unprotect):
    """Run with the tray's mail process; backfill missed mail after reconnect."""
    import time
    token_path=private_folder/'import-token.dpapi'
    cursor=private_folder/'hotel-mail-cursor.json'
    report=private_folder/'hotel-sync-status.json'
    while True:
        try:
            token=unprotect(token_path.read_bytes(),decrypt=True).decode()
            counts=sync_once(config,token,cursor)
            result={'ok':True,'checkedAt':datetime.now(timezone.utc).isoformat(),'counts':counts}
        except Exception:
            # No email text, addresses, booking IDs or exception messages on disk.
            result={'ok':False,'checkedAt':datetime.now(timezone.utc).isoformat(),'error':'sync_unavailable'}
        temporary=report.with_suffix('.tmp')
        temporary.write_text(json.dumps(result),'utf-8');temporary.replace(report)
        time.sleep(120)
