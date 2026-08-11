import { describe, expect, it } from 'vitest'
import { isAudioFileName } from '../audio'

describe('isAudioFileName', () => {
  it('识别白名单音频后缀', () => {
    expect(isAudioFileName('demo.mp3')).toBe(true)
    expect(isAudioFileName('伴奏.WAV')).toBe(true)
    expect(isAudioFileName('take.flac')).toBe(true)
    expect(isAudioFileName('song.OGG')).toBe(true)
  })

  it('拒绝非音频与空名', () => {
    expect(isAudioFileName('工程文件.mid')).toBe(false)
    expect(isAudioFileName('notes.txt')).toBe(false)
    expect(isAudioFileName('archive.zip')).toBe(false)
    expect(isAudioFileName('')).toBe(false)
    expect(isAudioFileName('noext')).toBe(false)
  })
})
