import nodemailer from 'nodemailer'
import * as bookcarsTypes from ':bookcars-types'
import i18n from '../lang/i18n'
import * as env from '../config/env.config'
import User from '../models/User'
import Notification from '../models/Notification'
import NotificationCounter from '../models/NotificationCounter'
import * as helper from '../utils/helper'
import * as mailHelper from '../utils/mailHelper'
import { VerificationProvider } from './verificationProvider'

/**
 * Manual verification provider (P2P): every submission goes to 'pending'
 * and an admin reviews the documents in the admin panel.
 */
const manualProvider: VerificationProvider = {
  name: 'manual',

  submit: async (user: env.User): Promise<bookcarsTypes.VerificationStatus> => {
    // notify admin about the new verification request
    const admin = !!env.ADMIN_EMAIL && (await User.findOne({ email: env.ADMIN_EMAIL, type: bookcarsTypes.UserType.Admin }))
    if (admin) {
      i18n.locale = admin.language
      const message = `${user.fullName} ${i18n.t('NEW_VERIFICATION_NOTIFICATION')}`

      const notification = new Notification({ user: admin._id, message })
      await notification.save()
      let counter = await NotificationCounter.findOne({ user: admin._id })
      if (counter && typeof counter.count !== 'undefined') {
        counter.count += 1
        await counter.save()
      } else {
        counter = new NotificationCounter({ user: admin._id, count: 1 })
        await counter.save()
      }

      if (admin.enableEmailNotifications) {
        const mailOptions: nodemailer.SendMailOptions = {
          from: env.SMTP_FROM,
          to: admin.email,
          subject: message,
          html: `<p>
    ${i18n.t('HELLO')}${admin.fullName},<br><br>
    ${message}<br><br>
    ${helper.joinURL(env.ADMIN_HOST, 'verifications')}<br><br>
    ${i18n.t('REGARDS')}<br>
    </p>`,
        }
        await mailHelper.sendMail(mailOptions)
      }
    }

    return bookcarsTypes.VerificationStatus.Pending
  },
}

export default manualProvider
