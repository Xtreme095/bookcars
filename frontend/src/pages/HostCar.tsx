import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Paper,
  Button,
  TextField,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Checkbox,
  MenuItem,
  Alert,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import { Delete as DeleteIcon, Visibility as ViewIcon, Upload as UploadIcon } from '@mui/icons-material'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import * as bookcarsTypes from ':bookcars-types'
import * as bookcarsHelper from ':bookcars-helper'
import Layout from '@/components/Layout'
import Footer from '@/components/Footer'
import NoMatch from './NoMatch'
import LocationSelectList from '@/components/LocationSelectList'
import DatePicker from '@/components/DatePicker'
import env from '@/config/env.config'
import { strings } from '@/lang/host-cars'
import { strings as commonStrings } from '@/lang/common'
import * as helper from '@/utils/helper'
import * as UserService from '@/services/UserService'
import * as HostService from '@/services/HostService'
import { schema, FormFields, toPayloadNumbers } from '@/models/HostCarForm'

import '@/assets/css/host-car.css'

const HostCar = () => {
  const navigate = useNavigate()

  const [visible, setVisible] = useState(false)
  const [noMatch, setNoMatch] = useState(false)
  const [car, setCar] = useState<bookcarsTypes.Car>()
  const [locations, setLocations] = useState<bookcarsTypes.Option[]>([])
  const [locationsError, setLocationsError] = useState(false)
  const [image, setImage] = useState<string>()
  const [imageIsTemp, setImageIsTemp] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [images, setImages] = useState<{ filename: string, temp: boolean }[]>([])
  const [registrationDocument, setRegistrationDocument] = useState<string>()
  const [registrationIsTemp, setRegistrationIsTemp] = useState(false)
  const [registrationError, setRegistrationError] = useState(false)
  const [unavailabilities, setUnavailabilities] = useState<bookcarsTypes.CarUnavailability[]>([])
  const [blockFrom, setBlockFrom] = useState<Date>()
  const [blockTo, setBlockTo] = useState<Date>()
  const [blockReason, setBlockReason] = useState('')
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const language = UserService.getLanguage()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: {
      aircon: true,
      unlimitedMileage: true,
      type: bookcarsTypes.CarType.Gasoline,
      gearbox: bookcarsTypes.GearboxType.Manual,
      range: bookcarsTypes.CarRange.Mini,
      fuelPolicy: bookcarsTypes.FuelPolicy.FullToFull,
      seats: '5',
      doors: '5',
      mileage: '',
      minRentalDays: '',
      maxRentalDays: '',
    },
  })

  const unlimitedMileage = watch('unlimitedMileage')
  const aircon = watch('aircon')
  const type = watch('type')
  const gearbox = watch('gearbox')
  const range = watch('range')
  const fuelPolicy = watch('fuelPolicy')

  const onLoad = async () => {
    try {
      const params = new URLSearchParams(window.location.search)
      const carId = params.get('cr')

      if (carId) {
        const _car = await HostService.getHostCar(carId)
        if (!_car) {
          setNoMatch(true)
          return
        }
        setCar(_car)
        reset({
          make: _car.make || '',
          carModel: _car.carModel || '',
          year: _car.year ? String(_car.year) : '',
          licensePlate: _car.licensePlate || '',
          dailyPrice: String(_car.dailyPrice),
          deposit: String(_car.deposit),
          minRentalDays: _car.minRentalDays ? String(_car.minRentalDays) : '',
          maxRentalDays: _car.maxRentalDays ? String(_car.maxRentalDays) : '',
          type: _car.type,
          gearbox: _car.gearbox,
          range: _car.range,
          aircon: _car.aircon,
          seats: String(_car.seats),
          doors: String(_car.doors),
          fuelPolicy: _car.fuelPolicy,
          unlimitedMileage: _car.mileage === -1,
          mileage: _car.mileage === -1 ? '' : String(_car.mileage),
        })
        setLocations((_car.locations as unknown as bookcarsTypes.Location[]).map((l) => ({ _id: l._id, name: l.name })))
        setImage(_car.image)
        setImages((_car.images || []).map((filename) => ({ filename, temp: false })))
        setRegistrationDocument(_car.registrationDocument)
        const periods = await HostService.getCarUnavailabilities(carId)
        setUnavailabilities(periods)
      }

      setVisible(true)
    } catch (err) {
      helper.error(err)
    }
  }

  const uploadImage = async (file: Blob, main: boolean) => {
    try {
      const filename = await HostService.createHostCarImage(file)
      if (main) {
        if (image && imageIsTemp) {
          await HostService.deleteTempHostCarImage(image)
        }
        setImage(filename)
        setImageIsTemp(true)
        setImageError(false)
      } else {
        setImages((prev) => [...prev, { filename, temp: true }])
      }
    } catch (err) {
      helper.error(err)
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, main: boolean) => {
    if (!e.target.files || e.target.files.length === 0) {
      return
    }
    uploadImage(e.target.files[0], main)
    e.target.value = ''
  }

  const handleRegistrationChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return
    }
    try {
      const file = e.target.files[0]
      if (registrationDocument && registrationIsTemp) {
        await HostService.deleteTempHostDocument(bookcarsTypes.HostDocumentType.VehicleRegistration, registrationDocument)
      }
      const filename = await HostService.createHostDocument(bookcarsTypes.HostDocumentType.VehicleRegistration, file)
      setRegistrationDocument(filename)
      setRegistrationIsTemp(true)
      setRegistrationError(false)
    } catch (err) {
      helper.error(err)
    }
    e.target.value = ''
  }

  const buildPayload = (data: FormFields): bookcarsTypes.UpsertHostCarPayload => ({
    _id: car?._id,
    make: data.make,
    carModel: data.carModel,
    licensePlate: data.licensePlate,
    locations: locations.map((l) => l._id),
    type: data.type,
    gearbox: data.gearbox,
    range: data.range,
    aircon: data.aircon,
    fuelPolicy: data.fuelPolicy,
    ...toPayloadNumbers(data),
    image,
    images: images.map((i) => i.filename),
    registrationDocument,
  })

  const save = async (data: FormFields, submitForReview: boolean) => {
    try {
      setSubmitting(true)

      if (!locations || locations.length === 0) {
        setLocationsError(true)
        return
      }

      if (submitForReview) {
        let invalid = false
        if (!image) {
          setImageError(true)
          invalid = true
        }
        if (!registrationDocument) {
          setRegistrationError(true)
          invalid = true
        }
        if (invalid) {
          return
        }
      }

      const payload = buildPayload(data)
      const savedCar = car
        ? await HostService.updateHostCar(payload)
        : await HostService.createHostCar(payload)

      if (!savedCar || !savedCar._id) {
        helper.error()
        return
      }

      if (submitForReview) {
        const status = await HostService.submitHostCar(savedCar._id)
        if (status === 200) {
          helper.info(strings.SUBMITTED)
          navigate('/host/cars')
        } else {
          helper.error()
        }
      } else {
        helper.info(strings.SAVED)
        navigate('/host/cars')
      }
    } catch (err) {
      helper.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    try {
      setOpenDeleteDialog(false)
      const status = await HostService.deleteHostCar(car!._id)
      if (status === 200) {
        helper.info(strings.DELETED)
        navigate('/host/cars')
      } else {
        helper.error(null, strings.DELETE_HAS_BOOKINGS)
      }
    } catch (err) {
      helper.error(err, strings.DELETE_HAS_BOOKINGS)
    }
  }

  const addUnavailability = async () => {
    try {
      if (!car || !blockFrom || !blockTo || blockFrom >= blockTo) {
        helper.error(null, strings.INVALID_PERIOD)
        return
      }
      const unavailability = await HostService.createCarUnavailability({
        car: car._id,
        from: blockFrom,
        to: blockTo,
        reason: blockReason || undefined,
      })
      setUnavailabilities((prev) => [...prev, unavailability].sort((a, b) => new Date(a.from).getTime() - new Date(b.from).getTime()))
      setBlockFrom(undefined)
      setBlockTo(undefined)
      setBlockReason('')
      helper.info(strings.PERIOD_ADDED)
    } catch (err) {
      helper.error(err)
    }
  }

  const removeUnavailability = async (id: string) => {
    try {
      const status = await HostService.deleteCarUnavailability(id)
      if (status === 200) {
        setUnavailabilities((prev) => prev.filter((u) => u._id !== id))
        helper.info(strings.PERIOD_DELETED)
      } else {
        helper.error()
      }
    } catch (err) {
      helper.error(err)
    }
  }

  const statusInfo = () => {
    if (!car) {
      return <Alert severity="info">{strings.STATUS_INFO_DRAFT}</Alert>
    }
    switch (car.status) {
      case bookcarsTypes.CarStatus.Draft:
        return <Alert severity="info">{strings.STATUS_INFO_DRAFT}</Alert>
      case bookcarsTypes.CarStatus.PendingReview:
        return <Alert severity="warning">{strings.STATUS_INFO_PENDING}</Alert>
      case bookcarsTypes.CarStatus.Rejected:
        return (
          <Alert severity="error">
            {`${strings.REJECTION_REASON}: ${car.rejectionReason || ''}`}
            <br />
            {strings.STATUS_INFO_REJECTED}
          </Alert>
        )
      case bookcarsTypes.CarStatus.Suspended:
        return <Alert severity="warning">{strings.STATUS_INFO_SUSPENDED}</Alert>
      default:
        return null
    }
  }

  const canSubmitForReview = !car || (car.status && [bookcarsTypes.CarStatus.Draft, bookcarsTypes.CarStatus.Rejected].includes(car.status))

  return (
    <Layout onLoad={onLoad} strict>
      {visible && !noMatch && (
        <>
          <div className="host-car">
            <Paper className="host-car-form" elevation={10}>
              <div className="host-car-form-header">
                <h1>{car ? car.name : strings.NEW_VEHICLE}</h1>
                {car && <Chip size="small" label={helper.getCarStatusLabel(car.status)} color={helper.getCarStatusColor(car.status)} />}
              </div>

              {statusInfo()}

              <form onSubmit={handleSubmit((data) => save(data, false))}>
                <div className="form-row">
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.MAKE} variant="standard" {...register('make')} error={!!errors.make} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.MODEL} variant="standard" {...register('carModel')} error={!!errors.carModel} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.YEAR} variant="standard" type="number" {...register('year')} error={!!errors.year} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                </div>

                <div className="form-row">
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.LICENSE_PLATE} variant="standard" {...register('licensePlate')} error={!!errors.licensePlate} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense" error={locationsError}>
                    <LocationSelectList
                      label={strings.LOCATIONS}
                      multiple
                      required
                      variant="standard"
                      value={locations as unknown as bookcarsTypes.Location[]}
                      onChange={(values) => {
                        setLocations(values)
                        if (values.length > 0) {
                          setLocationsError(false)
                        }
                      }}
                    />
                    {locationsError && <FormHelperText>{strings.LOCATIONS_REQUIRED}</FormHelperText>}
                  </FormControl>
                </div>

                <div className="form-row">
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.DAILY_PRICE} variant="standard" type="number" {...register('dailyPrice')} error={!!errors.dailyPrice} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.DEPOSIT} variant="standard" type="number" {...register('deposit')} error={!!errors.deposit} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.MIN_RENTAL_DAYS} variant="standard" type="number" {...register('minRentalDays')} error={!!errors.minRentalDays} InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.MAX_RENTAL_DAYS} variant="standard" type="number" {...register('maxRentalDays')} error={!!errors.maxRentalDays} InputLabelProps={{ shrink: true }} />
                  </FormControl>
                </div>

                <div className="form-row">
                  <FormControl fullWidth margin="dense">
                    <TextField select label={strings.CAR_TYPE} variant="standard" value={type} onChange={(e) => setValue('type', e.target.value)} required>
                      {Object.values(bookcarsTypes.CarType).map((value) => (
                        <MenuItem key={value} value={value}>{helper.getCarType(value)}</MenuItem>
                      ))}
                    </TextField>
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField select label={strings.GEARBOX} variant="standard" value={gearbox} onChange={(e) => setValue('gearbox', e.target.value)} required>
                      {Object.values(bookcarsTypes.GearboxType).map((value) => (
                        <MenuItem key={value} value={value}>{helper.getGearboxType(value)}</MenuItem>
                      ))}
                    </TextField>
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField select label={strings.RANGE} variant="standard" value={range} onChange={(e) => setValue('range', e.target.value)} required>
                      {Object.values(bookcarsTypes.CarRange).map((value) => (
                        <MenuItem key={value} value={value}>{helper.getCarRange(value)}</MenuItem>
                      ))}
                    </TextField>
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField select label={strings.FUEL_POLICY} variant="standard" value={fuelPolicy} onChange={(e) => setValue('fuelPolicy', e.target.value)} required>
                      {Object.values(bookcarsTypes.FuelPolicy).map((value) => (
                        <MenuItem key={value} value={value}>{helper.getFuelPolicy(value)}</MenuItem>
                      ))}
                    </TextField>
                  </FormControl>
                </div>

                <div className="form-row">
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.SEATS} variant="standard" type="number" {...register('seats')} error={!!errors.seats} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense">
                    <TextField label={strings.DOORS} variant="standard" type="number" {...register('doors')} error={!!errors.doors} required InputLabelProps={{ shrink: true }} />
                  </FormControl>
                  <FormControl fullWidth margin="dense" className="checkbox-field">
                    <FormControlLabel
                      control={<Checkbox checked={aircon} onChange={(e) => setValue('aircon', e.target.checked)} color="primary" />}
                      label={strings.AIRCON}
                    />
                  </FormControl>
                </div>

                <div className="form-row">
                  <FormControl fullWidth margin="dense" className="checkbox-field">
                    <FormControlLabel
                      control={<Checkbox checked={unlimitedMileage} onChange={(e) => setValue('unlimitedMileage', e.target.checked)} color="primary" />}
                      label={`${strings.MILEAGE}: ${strings.UNLIMITED}`}
                    />
                  </FormControl>
                  {!unlimitedMileage && (
                    <FormControl fullWidth margin="dense">
                      <TextField label={strings.LIMITED_KM} variant="standard" type="number" {...register('mileage')} error={!!errors.mileage} InputLabelProps={{ shrink: true }} />
                    </FormControl>
                  )}
                </div>

                <div className="upload-section">
                  <FormControl fullWidth margin="dense" error={imageError}>
                    <div className="upload-row">
                      <span className="upload-label">{strings.MAIN_IMAGE}</span>
                      <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                        {strings.UPLOAD_IMAGE}
                        <input type="file" hidden accept="image/*" onChange={(e) => handleImageChange(e, true)} />
                      </Button>
                    </div>
                    {image && (
                      <img
                        className="image-preview"
                        alt=""
                        src={bookcarsHelper.joinURL(imageIsTemp ? env.CDN_TEMP_CARS : env.CDN_CARS, image)}
                      />
                    )}
                    {imageError && <FormHelperText>{strings.IMAGE_REQUIRED}</FormHelperText>}
                  </FormControl>

                  <FormControl fullWidth margin="dense">
                    <div className="upload-row">
                      <span className="upload-label">{strings.ADDITIONAL_IMAGES}</span>
                      <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                        {strings.UPLOAD_IMAGE}
                        <input type="file" hidden accept="image/*" onChange={(e) => handleImageChange(e, false)} />
                      </Button>
                    </div>
                    <div className="image-gallery">
                      {images.map((img) => (
                        <div key={img.filename} className="gallery-item">
                          <img alt="" src={bookcarsHelper.joinURL(img.temp ? env.CDN_TEMP_CARS : env.CDN_CARS, img.filename)} />
                          <IconButton
                            size="small"
                            className="gallery-delete"
                            onClick={async () => {
                              if (img.temp) {
                                await HostService.deleteTempHostCarImage(img.filename)
                              }
                              setImages((prev) => prev.filter((i) => i.filename !== img.filename))
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  </FormControl>

                  <FormControl fullWidth margin="dense" error={registrationError}>
                    <div className="upload-row">
                      <span className="upload-label">{strings.REGISTRATION_DOCUMENT}</span>
                      <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                        {commonStrings.UPLOAD_FILE}
                        <input type="file" hidden accept="image/jpeg,image/png,application/pdf" onChange={handleRegistrationChange} />
                      </Button>
                      {registrationDocument && <ViewIcon color="success" />}
                    </div>
                    {registrationError && <FormHelperText>{strings.REGISTRATION_REQUIRED}</FormHelperText>}
                  </FormControl>
                </div>

                <div className="buttons">
                  <Button type="submit" variant="contained" className="btn-primary" disabled={isSubmitting || submitting}>
                    {car ? strings.SAVE : strings.SAVE_DRAFT}
                  </Button>
                  {canSubmitForReview && (
                    <Button variant="contained" color="success" disabled={isSubmitting || submitting} onClick={handleSubmit((data) => save(data, true))}>
                      {strings.SUBMIT_FOR_REVIEW}
                    </Button>
                  )}
                  {car && (
                    <Button variant="outlined" color="error" onClick={() => setOpenDeleteDialog(true)}>
                      {strings.DELETE_VEHICLE}
                    </Button>
                  )}
                  <Button variant="outlined" color="primary" onClick={() => navigate('/host/cars')}>
                    {strings.BACK_TO_VEHICLES}
                  </Button>
                </div>
              </form>
            </Paper>

            {car && (
              <Paper className="host-car-form availability-section" elevation={10}>
                <h2>{strings.AVAILABILITY}</h2>
                <p className="availability-info">{strings.AVAILABILITY_INFO}</p>

                <div className="block-period">
                  <FormControl margin="dense" className="date-field">
                    <DatePicker
                      label={strings.FROM}
                      value={blockFrom}
                      minDate={new Date()}
                      variant="standard"
                      onChange={(date) => setBlockFrom(date || undefined)}
                      language={language}
                    />
                  </FormControl>
                  <FormControl margin="dense" className="date-field">
                    <DatePicker
                      label={strings.TO}
                      value={blockTo}
                      minDate={blockFrom || new Date()}
                      variant="standard"
                      onChange={(date) => setBlockTo(date || undefined)}
                      language={language}
                    />
                  </FormControl>
                  <FormControl margin="dense" className="reason-field">
                    <TextField label={strings.REASON} variant="standard" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
                  </FormControl>
                  <Button variant="contained" className="btn-primary" onClick={addUnavailability} disabled={!blockFrom || !blockTo}>
                    {strings.ADD_PERIOD}
                  </Button>
                </div>

                {unavailabilities.length === 0 ? (
                  <p className="no-periods">{strings.NO_PERIODS}</p>
                ) : (
                  <ul className="periods">
                    {unavailabilities.map((u) => (
                      <li key={u._id}>
                        <span>
                          {`${format(new Date(u.from), 'dd.MM.yyyy')} — ${format(new Date(u.to), 'dd.MM.yyyy')}`}
                          {u.reason ? ` (${u.reason})` : ''}
                        </span>
                        <IconButton size="small" onClick={() => removeUnavailability(u._id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
              </Paper>
            )}
          </div>
          <Footer />

          <Dialog disableEscapeKeyDown maxWidth="xs" open={openDeleteDialog}>
            <DialogTitle className="dialog-header">{strings.DELETE_VEHICLE}</DialogTitle>
            <DialogContent>{strings.DELETE_CONFIRM}</DialogContent>
            <DialogActions className="dialog-actions">
              <Button onClick={() => setOpenDeleteDialog(false)} variant="outlined" color="primary">
                {commonStrings.CANCEL}
              </Button>
              <Button onClick={handleDelete} variant="contained" color="error">
                {commonStrings.DELETE}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      {noMatch && <NoMatch hideHeader />}
    </Layout>
  )
}

export default HostCar
