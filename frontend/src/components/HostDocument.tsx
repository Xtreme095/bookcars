import React, { useState } from 'react'
import { IconButton, OutlinedInput } from '@mui/material'
import { Upload as UploadIcon, Delete as DeleteIcon } from '@mui/icons-material'
import * as bookcarsTypes from ':bookcars-types'
import * as HostService from '@/services/HostService'
import * as helper from '@/utils/helper'

import '@/assets/css/host-document.css'

interface HostDocumentProps {
  type: bookcarsTypes.HostDocumentType
  label: string
  filename?: string
  onUpload?: (filename: string) => void
  onDelete?: () => void
}

const HostDocument = ({
  type,
  label,
  filename,
  onUpload,
  onDelete,
}: HostDocumentProps) => {
  const [document, setDocument] = useState<string | null>(filename || null)
  // filenames uploaded in this session live in the temp folder and can be deleted
  const [isTemp, setIsTemp] = useState(false)

  const inputId = `upload-host-document-${type}`

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    const upload = window.document.getElementById(inputId) as HTMLInputElement
    upload.value = ''
    setTimeout(() => {
      upload.click()
    }, 0)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) {
      helper.error()
      return
    }

    const file = e.target.files[0]

    const upload = async () => {
      try {
        if (document && isTemp) {
          await HostService.deleteTempHostDocument(type, document)
        }
        const _filename = await HostService.createHostDocument(type, file)
        setDocument(_filename)
        setIsTemp(true)
        if (onUpload) {
          onUpload(_filename)
        }
      } catch (err) {
        helper.error(err)
      }
    }

    upload()
  }

  return (
    <div className="host-document">
      <OutlinedInput
        value={document || label}
        readOnly
        onClick={handleClick}
        className="filename"
        fullWidth
      />
      <div className="actions">
        <IconButton onClick={handleClick}>
          <UploadIcon className="icon" />
        </IconButton>

        {document && isTemp && (
          <IconButton
            onClick={async () => {
              try {
                await HostService.deleteTempHostDocument(type, document)
                setDocument(null)
                setIsTemp(false)
                if (onDelete) {
                  onDelete()
                }
              } catch (err) {
                helper.error(err)
              }
            }}
          >
            <DeleteIcon className="icon" />
          </IconButton>
        )}
      </div>
      <input id={inputId} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={handleChange} />
    </div>
  )
}

export default HostDocument
