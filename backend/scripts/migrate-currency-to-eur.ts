import * as databaseHelper from '../src/utils/databaseHelper'
import Car from '../src/models/Car'
import Booking from '../src/models/Booking'
import * as env from '../src/config/env.config'

const HRK_TO_EUR = 7.53450

const migrateCarsToEUR = async () => {
  console.log('Starting car price migration to EUR...')

  const cars = await Car.find({ $or: [{ currency: 'HRK' }, { currency: { $exists: false } }] })

  let updated = 0
  for (const car of cars) {
    try {
      const updates: any = { currency: 'EUR' }

      if (car.price) {
        updates.price = Math.round((car.price / HRK_TO_EUR) * 100) / 100
      }

      await Car.findByIdAndUpdate(car._id, updates)
      updated++
    } catch (err) {
      console.error(`Failed to migrate car ${car._id}:`, err)
    }
  }

  console.log(`Migrated ${updated} cars to EUR`)
}

const migrateBookingsToEUR = async () => {
  console.log('Starting booking price migration to EUR...')

  const bookings = await Booking.find({ $or: [{ currency: 'HRK' }, { currency: { $exists: false } }] })

  let updated = 0
  for (const booking of bookings) {
    try {
      const updates: any = {}

      if (booking.price) {
        updates.price = Math.round((booking.price / HRK_TO_EUR) * 100) / 100
      }

      await Booking.findByIdAndUpdate(booking._id, updates)
      updated++
    } catch (err) {
      console.error(`Failed to migrate booking ${booking._id}:`, err)
    }
  }

  console.log(`Migrated ${updated} bookings to EUR`)
}

const run = async () => {
  try {
    const connectedToDB = await databaseHelper.Connect()
    if (!connectedToDB) {
      console.error('Failed to connect to database')
      process.exit(1)
    }

    console.log('Connected to database')
    console.log(`Conversion rate: 1 EUR = ${HRK_TO_EUR} HRK`)

    await migrateCarsToEUR()
    await migrateBookingsToEUR()

    console.log('Migration completed successfully!')

    await databaseHelper.Close()
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

run()
