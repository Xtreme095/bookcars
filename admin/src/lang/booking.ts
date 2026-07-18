import LocalizedStrings from 'localized-strings'
import * as langHelper from '@/utils/langHelper'

const strings = new LocalizedStrings({
  fr: {
    TOTAL: 'Total :',
    RENTAL_AGREEMENT: 'Contrat de location',
    REGENERATE_AGREEMENT: 'Régénérer le contrat',
    AGREEMENT_REGENERATED: 'Le contrat a été régénéré.',
    DELETE_BOOKING: 'Êtes-vous sûr de vouloir supprimer cette réservation ?',
  },
  en: {
    TOTAL: 'Total:',
    DELETE_BOOKING: 'Are you sure you want to delete this booking?',
    RENTAL_AGREEMENT: 'Rental agreement',
    REGENERATE_AGREEMENT: 'Regenerate agreement',
    AGREEMENT_REGENERATED: 'Agreement regenerated.',
  },
  es: {
    TOTAL: 'Total:',
    DELETE_BOOKING: '¿Estás seguro de que quieres eliminar esta reserva?',
    RENTAL_AGREEMENT: 'Contrato de alquiler',
    REGENERATE_AGREEMENT: 'Regenerar el contrato',
    AGREEMENT_REGENERATED: 'Contrato regenerado.',
  },
  hr: {
    TOTAL: 'Ukupno:',
    DELETE_BOOKING: 'Jeste li sigurni da želite izbrisati ovu rezervaciju?',
    RENTAL_AGREEMENT: 'Ugovor o najmu',
    REGENERATE_AGREEMENT: 'Regeneriraj ugovor',
    AGREEMENT_REGENERATED: 'Ugovor je regeneriran.',
  },
})

langHelper.setLanguage(strings)
export { strings }
