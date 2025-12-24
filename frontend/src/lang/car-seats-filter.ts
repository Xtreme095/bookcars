import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    SEATS: 'Sièges',
    TWO: '2 sièges',
    FOUR: '4 sièges',
    FIVE: '5 sièges',
    FIVE_PLUS: '5+ sièges',
  },
  en: {
    SEATS: 'Seats',
    TWO: '2 seats',
    FOUR: '4 seats',
    FIVE: '5 seats',
    FIVE_PLUS: '5+ seats',
  },
  es: {
    SEATS: 'Asientos',
    TWO: '2 asientos',
    FOUR: '4 asientos',
    FIVE: '5 asientos',
    FIVE_PLUS: '5+ asientos',
  },
  hr: {
    SEATS: 'Sjedala',
    TWO: '2 sjedala',
    FOUR: '4 sjedala',
    FIVE: '5 sjedala',
    FIVE_PLUS: '5+ sjedala',
  },
})

langHelper.setLanguage(strings)
export { strings }
