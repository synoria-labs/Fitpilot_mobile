import Constants from 'expo-constants';
import { nutritionApi, nutritionClient, getAccessToken } from './api';
import type {
  ChatConversation,
  ChatDeliveryReceipt,
  ChatMessage,
  ChatReadReceipt,
} from '../types/chat';

export type ChatUploadFile = {
  uri: string;
  name: string;
  type: string;
};

const normalizeUploadMimeType = (file: ChatUploadFile) => {
  const mimeType = file.type.trim().toLowerCase();
  const fileName = file.name.trim().toLowerCase();

  if (mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a' || fileName.endsWith('.m4a')) {
    return 'audio/mp4';
  }

  return mimeType || file.type;
};

export const getChatConversations = () =>
  nutritionClient.get<ChatConversation[]>('/chat/conversations');

export const getOrCreateChatConversation = (payload: { professional_id?: number } = {}) =>
  nutritionClient.post<ChatConversation>('/chat/conversations', payload);

export const getChatMessages = (conversationId: number) =>
  nutritionClient.get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`);

export const markChatConversationRead = (conversationId: number) =>
  nutritionClient.patch<ChatReadReceipt>(`/chat/conversations/${conversationId}/read`);

export const sendChatMessage = async (
  conversationId: number,
  payload: {
    body?: string;
    files?: ChatUploadFile[];
    clientMessageId?: string;
    replyToMessageId?: number;
  },
) => {
  const formData = new FormData();

  if (payload.body) {
    formData.append('body', payload.body);
  }
  if (payload.clientMessageId) {
    formData.append('client_message_id', payload.clientMessageId);
  }
  if (payload.replyToMessageId) {
    formData.append('reply_to_message_id', String(payload.replyToMessageId));
  }
  payload.files?.forEach((file) => {
    formData.append('files', {
      uri: file.uri,
      name: file.name,
      type: normalizeUploadMimeType(file),
    } as unknown as Blob);
  });

  const response = await nutritionApi.post<ChatMessage>(
    `/chat/conversations/${conversationId}/messages`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    },
  );

  return response.data;
};

export const markChatConversationDelivered = (conversationId: number, messageId: number) =>
  nutritionClient.patch<ChatDeliveryReceipt>(
    `/chat/conversations/${conversationId}/delivered`,
    { message_id: messageId },
  );

export const getChatSocketToken = () => getAccessToken();

export const deleteChatMessage = (conversationId: number, messageId: number) =>
  nutritionClient.delete<ChatMessage>(
    `/chat/conversations/${conversationId}/messages/${messageId}`,
  );

export const resolveChatSocketUrl = () => {
  const extra = (Constants.expoConfig?.extra ?? {}) as { nutritionApiUrl?: string };
  const baseURL = process.env.EXPO_PUBLIC_NUTRITION_API_URL || extra.nutritionApiUrl || '';
  const url = new URL(baseURL);
  return `${url.origin}/chat`;
};
