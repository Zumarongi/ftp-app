import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography
} from '@mui/material'

export default function DownloadResultDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [localPath, setLocalPath] = useState(null)

  useEffect(() => {
    const offCompleted = window.electronAPI.onCompleted(({ localPath }) => {
      setTitle('下载完成')
      setMessage(`文件已成功下载`)
      setLocalPath(localPath)
      setOpen(true)

      window.electronAPI.openPath(localPath)
    })

    const offError = window.electronAPI.onError(({ error }) => {
      setTitle('下载失败')
      setMessage(error || '未知错误')
      setLocalPath(null)
      setOpen(true)
    })

    const offCancelled = window.electronAPI.onCancelled(() => {
      setTitle('下载已取消')
      setMessage('下载任务已被取消')
      setLocalPath(null)
      setOpen(true)
    })

    return () => {
      offCompleted?.()
      offError?.()
      offCancelled?.()
    }
  }, [])

  return (
    <Dialog open={open} onClose={() => setOpen(false)}>
      <DialogTitle>{title}</DialogTitle>

      <DialogContent dividers>
        <Typography>{message}</Typography>
        {localPath && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            保存位置：{localPath}
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        {localPath && (
          <Button
            onClick={() =>
              window.electronAPI.openPath(localPath)
            }
          >
            打开文件夹
          </Button>
        )}
        <Button onClick={() => setOpen(false)} autoFocus>
          确定
        </Button>
      </DialogActions>
    </Dialog>
  )
}
