import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    NEW_BOOKING_HEADING: 'Nouvelle réservation',
  },
  en: {
    NEW_BOOKING_HEADING: 'New booking',
  },
  es: {
    NEW_BOOKING_HEADING: 'Nueva reserva',
  },
  hr: {
    NEW_BOOKING_HEADING: 'Nova rezervacija',
  },
})

langHelper.setLanguage(strings)
export { strings }
