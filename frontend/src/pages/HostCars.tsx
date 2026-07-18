import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardContent, Chip, Typography } from '@mui/material'
import { AddCircle as AddIcon, DirectionsCar as CarIcon } from '@mui/icons-material'
import * as bookcarsTypes from ':bookcars-types'
import * as bookcarsHelper from ':bookcars-helper'
import Layout from '@/components/Layout'
import Footer from '@/components/Footer'
import env from '@/config/env.config'
import { strings } from '@/lang/host-cars'
import { strings as carsStrings } from '@/lang/cars'
import * as helper from '@/utils/helper'
import * as UserService from '@/services/UserService'
import * as HostService from '@/services/HostService'

import '@/assets/css/host-cars.css'

const HostCars = () => {
  const navigate = useNavigate()

  const [visible, setVisible] = useState(false)
  const [cars, setCars] = useState<bookcarsTypes.Car[]>([])

  const onLoad = async () => {
    try {
      const data = await HostService.getHostCars({}, '', 1, 100)
      setCars((data && data.length > 0 && data[0]?.resultData) || [])
      setVisible(true)
    } catch (err) {
      helper.error(err)
    }
  }

  return (
    <Layout onLoad={onLoad} strict>
      {visible && (
        <>
          <div className="host-cars">
            <div className="host-cars-header">
              <h1>{strings.MY_VEHICLES}</h1>
              <Button variant="contained" className="btn-primary" startIcon={<AddIcon />} onClick={() => navigate('/host/car')}>
                {strings.NEW_VEHICLE}
              </Button>
            </div>

            {cars.length === 0 ? (
              <div className="empty-list">
                <CarIcon className="empty-icon" />
                <p>{strings.EMPTY_LIST}</p>
              </div>
            ) : (
              <div className="car-cards">
                {cars.map((car) => (
                  <Card key={car._id} className="car-card" onClick={() => navigate(`/host/car?cr=${car._id}`)}>
                    {car.image ? (
                      <img alt={car.name} src={bookcarsHelper.joinURL(env.CDN_CARS, car.image)} className="car-card-image" />
                    ) : (
                      <div className="car-card-image car-card-image-placeholder">
                        <CarIcon />
                      </div>
                    )}
                    <CardContent className="car-card-content">
                      <Typography variant="h6" className="car-card-title">{car.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {car.licensePlate}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {`${bookcarsHelper.formatPrice(car.dailyPrice, '€', UserService.getLanguage())}/${carsStrings.PRICE_DAYS_PART_2}`}
                      </Typography>
                      <Chip size="small" className="car-card-status" label={helper.getCarStatusLabel(car.status)} color={helper.getCarStatusColor(car.status)} />
                      {car.status === bookcarsTypes.CarStatus.Rejected && car.rejectionReason && (
                        <Typography variant="body2" color="error" className="car-card-rejection">
                          {`${strings.REJECTION_REASON}: ${car.rejectionReason}`}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
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

export default HostCars
