export type ChatAttachmentType = 'IMAGE' | 'PDF' | 'AUDIO' | 'LINK';
export type ChatDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ';
export type ChatContactRequestStatus =
  | 'new'
  | 'read'
  | 'contacted'
  | 'proposed'
  | 'scheduled'
  | 'converted'
  | 'dismissed';

export type ChatUserSummary = {
  id: number;
  name: string;
  lastname: string | null;
  email: string | null;
  profile_picture: string | null;
};

export type ChatAttachment = {
  id: number;
  type: ChatAttachmentType;
  url: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
};

export type ChatMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  reply_to_message_id: number | null;
  reply_to: ChatMessageReply | null;
  body: string | null;
  client_message_id: string | null;
  created_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: number | null;
  delivery_status: ChatDeliveryStatus | null;
  attachments: ChatAttachment[];
};

export type ChatMessageReply = {
  id: number;
  sender_id: number;
  body: string | null;
  created_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
  attachment_count: number;
  first_attachment_type: ChatAttachmentType | null;
};

export type ChatConversation = {
  id: number;
  professional_id: number;
  client_id: number;
  participant: ChatUserSummary;
  last_message: ChatMessage | null;
  unread_count: number;
  can_send: boolean;
  contact_request_status?: ChatContactRequestStatus | null;
  contact_request_id?: number | null;
  contact_request_requested_start_at?: string | null;
  contact_request_requested_duration_minutes?: number | null;
  contact_request_proposed_start_at?: string | null;
  contact_request_proposed_duration_minutes?: number | null;
  contact_request_scheduled_appointment_id?: number | null;
  last_message_at: string | null;
  last_read_message_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ChatReadReceipt = {
  conversation_id: number;
  user_id: number;
  last_read_message_id: number | null;
  last_read_at: string;
};

export type ChatDeliveryReceipt = {
  conversation_id: number;
  user_id: number;
  last_delivered_message_id: number | null;
  last_delivered_at: string;
};
