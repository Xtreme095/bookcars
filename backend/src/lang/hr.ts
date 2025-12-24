import * as env from '../config/env.config'

export const hr = {
  ERROR: 'Interna greška: ',
  DB_ERROR: 'Greška baze podataka: ',
  SMTP_ERROR: 'SMTP greška - Slanje e-maila nije uspjelo: ',
  ACCOUNT_ACTIVATION_SUBJECT: 'Aktivacija računa',
  HELLO: 'Pozdrav ',
  ACCOUNT_ACTIVATION_LINK: 'Molimo aktivirajte svoj račun klikom na link:',
  REGARDS: `S poštovanjem,<br>${env.WEBSITE_NAME} tim`,
  ACCOUNT_ACTIVATION_TECHNICAL_ISSUE: 'Tehnički problem! Molimo kliknite na pošalji ponovno kako biste validirali svoj e-mail.',
  ACCOUNT_ACTIVATION_LINK_EXPIRED: 'Vaš link za validaciju je možda istekao. Molimo kliknite na pošalji ponovno kako biste validirali svoj e-mail.',
  ACCOUNT_ACTIVATION_LINK_ERROR: 'Nismo mogli pronaći korisnika za ovu verifikaciju. Molimo registrirajte se.',
  ACCOUNT_ACTIVATION_SUCCESS: 'Vaš račun je uspješno verificiran.',
  ACCOUNT_ACTIVATION_RESEND_ERROR: 'Nismo mogli pronaći korisnika s tom e-mail adresom. Provjerite je li vaša e-mail adresa točna.',
  ACCOUNT_ACTIVATION_ACCOUNT_VERIFIED: 'Ovaj račun je već verificiran. Molimo prijavite se.',
  ACCOUNT_ACTIVATION_EMAIL_SENT_PART_1: 'E-mail za validaciju poslan je na ',
  ACCOUNT_ACTIVATION_EMAIL_SENT_PART_2: ". Isteći će nakon jednog dana. Ako niste primili e-mail za validaciju, kliknite na pošalji ponovno.",
  CAR_IMAGE_REQUIRED: "Polje za sliku automobila ne može biti prazno: ",
  CAR_IMAGE_NOT_FOUND: 'Datoteka slike nije pronađena: ',
  PASSWORD_RESET_SUBJECT: 'Resetiranje lozinke',
  PASSWORD_RESET_LINK: 'Molimo resetirajte svoju lozinku klikom na link:',
  BOOKING_CONFIRMED_SUBJECT_PART1: 'Vaša rezervacija',
  BOOKING_CONFIRMED_SUBJECT_PART2: 'je potvrđena.',
  BOOKING_CONFIRMED_PART1: 'Vaša rezervacija',
  BOOKING_CONFIRMED_PART2: 'je potvrđena i plaćanje je uspješno izvršeno.',
  BOOKING_CONFIRMED_PART3: ' Molimo javite se našoj agenciji ',
  BOOKING_CONFIRMED_PART4: ' (',
  BOOKING_CONFIRMED_PART5: ') dana ',
  BOOKING_CONFIRMED_PART6: ` (${env.TIMEZONE}) kako biste preuzeli svoje vozilo `,
  BOOKING_CONFIRMED_PART7: '.',
  BOOKING_CONFIRMED_PART8: "Molimo donesite svoju osobnu iskaznicu, vozačku dozvolu i garancijski ček.",
  BOOKING_CONFIRMED_PART9: 'Vozilo morate vratiti našoj agenciji ',
  BOOKING_CONFIRMED_PART10: ' (',
  BOOKING_CONFIRMED_PART11: ') dana ',
  BOOKING_CONFIRMED_PART12: ` (${env.TIMEZONE}).`,
  BOOKING_CONFIRMED_PART13: 'Molimo poštujte datume i vrijeme preuzimanja i vraćanja.',
  BOOKING_CONFIRMED_PART14: 'Svoju rezervaciju možete pratiti na: ',
  BOOKING_PAY_LATER_NOTIFICATION: 'potvrdio/la je rezervaciju',
  BOOKING_PAID_NOTIFICATION: 'platio/la je rezervaciju',
  CANCEL_BOOKING_NOTIFICATION: 'poslao/la je zahtjev za otkazivanje rezervacije',
  BOOKING_UPDATED_NOTIFICATION_PART1: 'Status rezervacije',
  BOOKING_UPDATED_NOTIFICATION_PART2: 'je ažuriran.',
  CONTACT_SUBJECT: 'Nova poruka iz kontakt forme',
  SUBJECT: 'Predmet',
  FROM: 'Od',
  MESSAGE: 'Poruka',
  LOCATION_IMAGE_NOT_FOUND: 'Slika lokacije nije pronađena',
  NEW_CAR_NOTIFICATION_PART1: 'Dobavljač ',
  NEW_CAR_NOTIFICATION_PART2: ' je kreirao novi automobil.',

  NEW_REVIEW_SUBJECT: 'Nova recenzija primljena',
  NEW_REVIEW_BODY:
    `Pozdrav {{supplierName}},<br><br>`
    + `Primili ste novu recenziju od {{customerName}} za vaše vozilo <strong>{{carName}}</strong>.<br><br>`
    + `Ocjena: {{rating}}/5 zvjezdica<br>`
    + `Rezervacija: #{{bookingId}}<br><br>`
    + `Recenzija trenutno čeka moderaciju i bit će objavljena nakon odobrenja.<br>`
    + `Možete vidjeti i odgovoriti na ovu recenziju na svojoj nadzornoj ploči.<br><br>`
    + `Srdačan pozdrav,<br>BookCars Tim`,
}
