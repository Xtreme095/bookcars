import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Paper } from '@mui/material'
import {
  AssignmentTurnedIn as ApplyIcon,
  Verified as ReviewIcon,
  DirectionsCar as CarIcon,
  Payments as PaymentsIcon,
} from '@mui/icons-material'
import * as bookcarsTypes from ':bookcars-types'
import Layout from '@/components/Layout'
import Footer from '@/components/Footer'
import { strings } from '@/lang/host'

import '@/assets/css/become-a-host.css'

const BecomeAHost = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState<bookcarsTypes.User>()

  const onLoad = (_user?: bookcarsTypes.User) => {
    setUser(_user)
  }

  const handleApply = () => {
    if (user) {
      navigate('/host')
    } else {
      navigate('/sign-in?from=host')
    }
  }

  return (
    <Layout onLoad={onLoad} strict={false}>
      <div className="become-a-host">
        <div className="hero">
          <h1>{strings.BECOME_A_HOST_TITLE}</h1>
          <p>{strings.BECOME_A_HOST_SUBTITLE}</p>
          <Button variant="contained" className="btn-primary btn-apply" size="large" onClick={handleApply}>
            {user ? strings.CTA_APPLY : strings.CTA_SIGN_IN}
          </Button>
        </div>

        <div className="how-it-works">
          <h2>{strings.HOW_IT_WORKS}</h2>
          <div className="steps">
            <Paper className="step" elevation={4}>
              <ApplyIcon className="step-icon" />
              <h3>{strings.STEP_1_TITLE}</h3>
              <p>{strings.STEP_1_TEXT}</p>
            </Paper>
            <Paper className="step" elevation={4}>
              <ReviewIcon className="step-icon" />
              <h3>{strings.STEP_2_TITLE}</h3>
              <p>{strings.STEP_2_TEXT}</p>
            </Paper>
            <Paper className="step" elevation={4}>
              <CarIcon className="step-icon" />
              <h3>{strings.STEP_3_TITLE}</h3>
              <p>{strings.STEP_3_TEXT}</p>
            </Paper>
            <Paper className="step" elevation={4}>
              <PaymentsIcon className="step-icon" />
              <h3>{strings.STEP_4_TITLE}</h3>
              <p>{strings.STEP_4_TEXT}</p>
            </Paper>
          </div>
          <p className="revenue-note">{strings.REVENUE_NOTE}</p>
        </div>
      </div>
      <Footer />
    </Layout>
  )
}

export default BecomeAHost
