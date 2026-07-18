import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, IconButton, Paper, Tooltip } from '@mui/material'
import { Download as StatementIcon } from '@mui/icons-material'
import { format } from 'date-fns'
import * as bookcarsTypes from ':bookcars-types'
import * as bookcarsHelper from ':bookcars-helper'
import Layout from '@/components/Layout'
import Footer from '@/components/Footer'
import { strings } from '@/lang/host-earnings'
import { strings as hostCarsStrings } from '@/lang/host-cars'
import * as helper from '@/utils/helper'
import * as UserService from '@/services/UserService'
import * as HostService from '@/services/HostService'

import '@/assets/css/host-earnings.css'

const HostEarnings = () => {
  const navigate = useNavigate()

  const [visible, setVisible] = useState(false)
  const [payouts, setPayouts] = useState<bookcarsTypes.Payout[]>([])

  const language = UserService.getLanguage()
  const eur = (value: number) => `${bookcarsHelper.formatNumber(value, language)} €`

  const onLoad = async () => {
    try {
      const _payouts = await HostService.getHostPayouts()
      setPayouts(_payouts || [])
      setVisible(true)
    } catch (err) {
      helper.error(err)
    }
  }

  const downloadStatement = async (payout: bookcarsTypes.Payout) => {
    try {
      const blob = await HostService.getPayoutStatement(payout._id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `statement-${payout.year}-${String(payout.month).padStart(2, '0')}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      helper.error(err)
    }
  }

  return (
    <Layout onLoad={onLoad} strict>
      {visible && (
        <>
          <div className="host-earnings">
            <div className="host-earnings-header">
              <h1>{strings.EARNINGS}</h1>
              <Button variant="outlined" color="primary" onClick={() => navigate('/host/cars')}>
                {hostCarsStrings.MY_VEHICLES}
              </Button>
            </div>

            {payouts.length === 0 ? (
              <p className="empty-list">{strings.EMPTY_LIST}</p>
            ) : (
              <div className="payout-cards">
                {payouts.map((payout) => (
                  <Paper key={payout._id} className="payout-card" elevation={4}>
                    <div className="payout-card-header">
                      <span className="period">{`${String(payout.month).padStart(2, '0')}/${payout.year}`}</span>
                      <Chip
                        size="small"
                        label={payout.status === bookcarsTypes.PayoutStatus.Paid ? strings.STATUS_PAID : strings.STATUS_PENDING}
                        color={payout.status === bookcarsTypes.PayoutStatus.Paid ? 'success' : 'warning'}
                      />
                    </div>
                    <div className="payout-card-rows">
                      <div className="row">
                        <span>{strings.BOOKINGS}</span>
                        <span>{payout.bookingsCount}</span>
                      </div>
                      <div className="row">
                        <span>{strings.GROSS}</span>
                        <span>{eur(payout.grossTotal)}</span>
                      </div>
                      <div className="row">
                        <span>{strings.COMMISSION}</span>
                        <span>{`- ${eur(payout.commissionTotal)}`}</span>
                      </div>
                      <div className="row">
                        <span>{strings.SHARE}</span>
                        <span>{eur(payout.shareTotal)}</span>
                      </div>
                      {payout.guaranteedMinimum > 0 && (
                        <div className="row">
                          <span>{strings.MINIMUM}</span>
                          <span>{eur(payout.guaranteedMinimum)}</span>
                        </div>
                      )}
                      <div className="row amount">
                        <span>{strings.AMOUNT}</span>
                        <span>{eur(payout.amount)}</span>
                      </div>
                      {payout.paidAt && (
                        <div className="row paid-at">
                          <span>{strings.PAID_AT}</span>
                          <span>{format(new Date(payout.paidAt), 'dd.MM.yyyy')}</span>
                        </div>
                      )}
                    </div>
                    {payout.statementFile && (
                      <Tooltip title={strings.STATEMENT}>
                        <IconButton className="statement-btn" onClick={() => downloadStatement(payout)}>
                          <StatementIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Paper>
                ))}
              </div>
            )}
          </div>
          <Footer />
        </>
      )}
    </Layout>
  )
}

export default HostEarnings
