import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import * as DocumentPicker from 'expo-document-picker'
import { MaterialIcons } from '@expo/vector-icons'
import * as bookcarsTypes from ':bookcars-types'
import * as VerificationService from '@/services/VerificationService'
import * as helper from '@/utils/helper'

interface VerificationDocumentProps {
  type: bookcarsTypes.RenterDocumentType
  label: string
  filename?: string
  style?: object
  onUpload?: (filename: string) => void
  onDelete?: () => void
}

const iconSize = 32
const iconColor = '#676767'

const VerificationDocument = ({
  type,
  label,
  filename,
  style,
  onUpload,
  onDelete,
}: VerificationDocumentProps) => {
  const [document, setDocument] = useState<string | null>(filename || null)
  // filenames uploaded in this session live in the temp folder and can be deleted
  const [isTemp, setIsTemp] = useState(false)

  const handleUpload = async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })

      if (pickerResult.canceled) {
        return
      }

      const { uri } = pickerResult.assets[0]
      const name = helper.getFileName(uri)
      const mimeType = helper.getMimeType(name)
      const file: BlobInfo = { uri, name, type: mimeType }

      if (document && isTemp) {
        await VerificationService.deleteTempVerificationDocument(type, document)
      }
      const _filename = await VerificationService.createVerificationDocument(type, file)
      setDocument(_filename)
      setIsTemp(true)
      if (onUpload) {
        onUpload(_filename)
      }
    } catch (err) {
      helper.error(err)
    }
  }

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 10,
      paddingLeft: 10,
    },
    component: {
      flex: 1,
      marginRight: 5,
    },
    label: {
      backgroundColor: '#F5F5F5',
      color: 'rgba(0, 0, 0, 0.6)',
      fontSize: 12,
      fontWeight: '400',
      paddingRight: 5,
      paddingLeft: 5,
      marginLeft: 15,
      position: 'absolute',
      top: -9,
      zIndex: 1,
    },
    inputContainer: {
      flexDirection: 'row',
    },
    input: {
      flex: 1,
      height: 55,
      borderWidth: 1,
      borderRadius: 10,
      borderColor: 'rgba(0, 0, 0, 0.23)',
      fontSize: 16,
      paddingTop: 15,
      paddingRight: 40,
      paddingBottom: 15,
      paddingLeft: 15,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    action: {
      marginRight: 5,
      marginLeft: 5,
    },
  })

  return (
    <View style={{ ...styles.container, ...style }}>
      <Pressable hitSlop={15} onPress={handleUpload} style={styles.component}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.input} numberOfLines={1} ellipsizeMode="tail">{document || ''}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          hitSlop={15}
          onPress={handleUpload}
        >
          <MaterialIcons name="upload" size={iconSize} color={iconColor} />
        </Pressable>
        {document && isTemp && (
          <Pressable
            style={styles.action}
            hitSlop={15}
            onPress={async () => {
              try {
                await VerificationService.deleteTempVerificationDocument(type, document)
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
            <MaterialIcons name="delete" size={iconSize} color={iconColor} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

export default VerificationDocument
