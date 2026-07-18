import path from 'node:path'
import * as helper from './helper'

/**
 * Unicode fonts for PDF generation (P2P statements and rental agreements).
 *
 * DejaVu Sans is bundled under src/assets/fonts so Croatian diacritics
 * (č ć đ š ž) render correctly; PDFs fall back to Helvetica if the font
 * files are missing.
 */

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')

export const FONT_REGULAR_FILE = path.join(FONT_DIR, 'DejaVuSans.ttf')
export const FONT_BOLD_FILE = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf')

/**
 * Resolve the fonts to use for a PDF document.
 *
 * @export
 * @async
 * @returns {Promise<{ regular: string, bold: string }>}
 */
export const getFonts = async (): Promise<{ regular: string, bold: string }> => {
  const hasUnicodeFonts = await helper.pathExists(FONT_REGULAR_FILE) && await helper.pathExists(FONT_BOLD_FILE)
  return {
    regular: hasUnicodeFonts ? FONT_REGULAR_FILE : 'Helvetica',
    bold: hasUnicodeFonts ? FONT_BOLD_FILE : 'Helvetica-Bold',
  }
}
