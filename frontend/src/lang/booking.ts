import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    TOTAL: 'Total :',
    RENTAL_AGREEMENT: 'Télécharger le contrat de location',
  },
  en: {
    TOTAL: 'Total:',
    RENTAL_AGREEMENT: 'Download rental agreement',
  },
  es: {
    TOTAL: 'Total:',
    RENTAL_AGREEMENT: 'Descargar el contrato de alquiler',
  },
  hr: {
    TOTAL: 'Ukupno:',
    RENTAL_AGREEMENT: 'Preuzmi ugovor o najmu',
  },
})

langHelper.setLanguage(strings)
export { strings }
