export interface Remote {
  name: string
  type: string
  details: Record<string, string>
}

export interface Mount {
  fs: string
  mountPoint: string
}

export interface RcloneFile {
  Name: string
  Size: number
  IsDir: boolean
  ModTime: string
  MimeType: string
}
