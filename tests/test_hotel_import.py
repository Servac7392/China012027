import sys, unittest, json
from pathlib import Path
from email.message import EmailMessage
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools/mailru'))
from hotel_import import parse_hotel, message_text, sync_due
from datetime import datetime,timedelta,timezone

def letter(subject=None, body=None, verified=True):
    message=EmailMessage()
    message['From']='Trip.com <RU_HTL_NoReply@trip.com>'
    message['Date']='Wed, 25 Nov 2026 06:01:38 +0000'
    message['Message-ID']='<test-fixture@trip.com>'
    if verified: message['Authentication-Results']='mxs.mail.ru; dkim=pass header.d=trip.com;'
    message['Subject']=subject or '[Подтверждение бронирования] Test RIVER HOUSE — ваше бронирование подтверждено-NoReply'
    text=body or '''Номер бронирования 1234567890123
Здравствуйте, TEST GUEST! Ваше бронирование проживания в г. Шанхай подтверждено.
Test RIVER HOUSE — ваше проживание (заезд: 18 янв. 2027 г., выезд: 20 янв. 2027 г.) подтверждено
PIN-код: 1234
Заезд
18 янв. 2027 г. После 14:00 по местному времени отеля
Выезд
20 янв. 2027 г. До 12:00 по местному времени отеля
Адрес
No. 933 South Suzhou Road, Шанхай, Китай
上海黄浦区南苏州路933号
Информация о цене
27 006,74 ₽
Скидка
-4 051,02 ₽
Оплачено
18 904,70 ₽
Общая стоимость
Предоплата онлайн
18 904,70 ₽
Представительский люкс
1 номер 2 ночи
Имена гостей
TEST GUEST,PRIVATE PERSON
Контактный телефон +7 999 1234567'''
    message.set_content('<html><head><style>hidden</style></head><body>'+''.join('<p>'+line+'</p>' for line in text.splitlines())+'</body></html>',subtype='html')
    return message

class ParseTests(unittest.TestCase):
    def test_confirmed_html_and_net_price(self):
        event=parse_hotel(letter(),'test-token')
        self.assertTrue(event['complete']);self.assertTrue(event['verified'])
        self.assertEqual(event['hotel']['city'],'shanghai')
        self.assertEqual(event['hotel']['checkin'],'2027-01-18')
        self.assertEqual(event['hotel']['checkout'],'2027-01-20')
        self.assertEqual(event['hotel']['totalMinor'],1890470)
        self.assertEqual(event['hotel']['room'],'Представительский люкс')
        self.assertEqual(event['hotel']['checkinTime'],'14:00')
    def test_private_details_never_leave_parser(self):
        event=json.dumps(parse_hotel(letter(),'test-token'),ensure_ascii=False)
        for private in ('1234567890123','TEST GUEST','PRIVATE PERSON','1234','999 1234567','PIN-код'):
            self.assertNotIn(private,event)
    def test_missing_data_requires_review(self):
        event=parse_hotel(letter(body='Номер бронирования 1234567890123'),'test-token')
        self.assertFalse(event['complete'])
    def test_unverified_sender_not_auto_imported(self):
        self.assertFalse(parse_hotel(letter(verified=False),'test-token')['verified'])
    def test_cancellation_in_footer_is_not_cancellation(self):
        message=letter();self.assertEqual(parse_hotel(message,'x')['kind'],'confirmed')
    def test_subject_cancellation(self):
        event=parse_hotel(letter(subject='Бронирование отменено: Test RIVER HOUSE'),'x')
        self.assertEqual(event['kind'],'cancelled')
    def test_html_scripts_do_not_enter_text(self):
        message=letter();self.assertNotIn('hidden',message_text(message))
    def test_tracking_links_not_copied(self):
        event=json.dumps(parse_hotel(letter(),'test-token'))
        self.assertNotIn('href',event);self.assertNotIn('http',event)
    def test_event_and_booking_keys_stable(self):
        a=parse_hotel(letter(),'token');b=parse_hotel(letter(),'token')
        self.assertEqual(a['eventId'],b['eventId']);self.assertEqual(a['bookingKey'],b['bookingKey'])
    def test_daily_interval_persists_across_restarts(self):
        now=datetime(2026,11,26,12,tzinfo=timezone.utc)
        report={'lastAttemptAt':(now-timedelta(hours=23)).isoformat()}
        self.assertFalse(sync_due(report,None,now))
        self.assertTrue(sync_due(report,None,now+timedelta(hours=1)))
    def test_manual_request_overrides_daily_interval(self):
        now=datetime.now(timezone.utc)
        report={'lastAttemptAt':now.isoformat(),'completedRequestId':'old'}
        self.assertTrue(sync_due(report,'new',now))
        self.assertFalse(sync_due(report,'old',now))

if __name__=='__main__':unittest.main()

