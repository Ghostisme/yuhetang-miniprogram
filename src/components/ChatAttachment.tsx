import Taro from '@tarojs/taro'
import { Image, Text, Video, View } from '@tarojs/components'
import type { ChatMessage } from '../types'

const mediaUrl = (url?: string) => url?.startsWith('/api/chat-media/') ? API_BASE_URL.replace(/\/$/, '') + url : ''

export default function ChatAttachment({ message }: { message: ChatMessage }) {
  const attachment = message.attachment, url = mediaUrl(attachment?.url)
  if (!attachment || !url) return <Text>{message.content}</Text>
  return <View className='chat-attachment'>
    {message.kind === 'image'
      ? <Image className='chat-attachment-image' src={url} mode='widthFix' onClick={() => { void Taro.previewImage({ current: url, urls: [url] }) }} />
      : <Video className='chat-attachment-video' src={url} poster={mediaUrl(attachment.thumbnailUrl)} controls autoplay={false} showFullscreenBtn />}
    <Text className='chat-attachment-name'>{attachment.name}</Text>
  </View>
}
