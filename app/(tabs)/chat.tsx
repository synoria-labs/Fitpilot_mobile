import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import { AudioMessagePlayer } from '../../src/components/chat/AudioMessagePlayer';
import { ChatComposer } from '../../src/components/chat/ChatComposer';
import { ListItemSkeleton, ProfileShortcutButton, TabScreenWrapper } from '../../src/components/common';
import { AuroraBackdrop } from '../../src/components/aurora';
import { auroraFont, getAuroraTokens, useAurora } from '../../src/theme/aurora';
import { mergeDistinctText } from '../../src/utils/careTeam';
import {
  borderRadius,
  fontSize,
  spacing,
} from '../../src/constants/colors';
import { useBottomTabBarVisibility } from '../../src/hooks/useBottomTabBarVisibility';
import { useCareTeam } from '../../src/hooks/useCareTeam';
import {
  deleteChatMessage,
  confirmProfessionalContactRequestSchedule,
  getChatConversations,
  getChatMessages,
  getChatSocketToken,
  getOrCreateChatConversation,
  markChatConversationDelivered,
  markChatConversationRead,
  resolveChatSocketUrl,
  sendChatMessage,
  type ChatUploadFile,
} from '../../src/services/chat';
import { useAuthStore } from '../../src/store/authStore';
import { toast } from '../../src/store/toastStore';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import type { AssignedProfessionalSummary } from '../../src/types';
import type {
  ChatAttachment,
  ChatConversation,
  ChatDeliveryStatus,
  ChatMessage,
  ChatMessageReply,
} from '../../src/types/chat';
import { hapticError, hapticImpactLight, hapticSuccess } from '../../src/utils/haptics';

const MAX_FILES_PER_MESSAGE = 4;
const MAX_AUDIO_SECONDS = 300;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const CHAT_COMPOSER_PADDING = 12;
const ANDROID_NAV_BAR_FALLBACK_INSET = 16;
const NEW_MESSAGE_BOTTOM_THRESHOLD = 96;
const MESSAGE_HIGHLIGHT_DURATION_MS = 1400;

type PendingChatFile = ChatUploadFile & {
  id: string;
  size?: number;
  durationMillis?: number;
};

type ProfessionalChatOption = {
  id: number;
  name: string;
  roleLabel: string | null;
};

const makeLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Mensajes optimistas: estado local mientras el servidor confirma el envío.
type LocalMessageStatus = 'sending' | 'failed';

type LocalChatMessage = ChatMessage & {
  localStatus?: LocalMessageStatus;
};

// Ids numéricos locales fuera del rango de ids reales del servidor para que
// no choquen con mensajes existentes y queden al final al ordenar por id.
const LOCAL_MESSAGE_ID_BASE = 9_000_000_000_000;
let localMessageIdCounter = 0;
const makeLocalMessageId = () => LOCAL_MESSAGE_ID_BASE + ++localMessageIdCounter;

const toReplyPreviewMessage = (message: ChatMessage): ChatMessageReply => ({
  id: message.id,
  sender_id: message.sender_id,
  external_sender_contact_id: message.external_sender_contact_id,
  sender_type: message.sender_type,
  body: message.body,
  created_at: message.created_at,
  is_deleted: message.is_deleted,
  deleted_at: message.deleted_at,
  attachment_count: message.attachments.length,
  first_attachment_type: message.attachments[0]?.type ?? null,
});

const matchesPendingMessage = (
  item: LocalChatMessage,
  serverMessage: ChatMessage,
  localMessageId?: number,
) =>
  Boolean(item.localStatus) &&
  ((localMessageId != null && item.id === localMessageId) ||
    Boolean(
      serverMessage.client_message_id &&
        item.client_message_id === serverMessage.client_message_id,
    ));

// El backend incluye client_message_id tanto en la respuesta HTTP como en el
// evento 'message:new' del socket; el eco del socket puede llegar antes que
// la respuesta HTTP, así que ambos caminos reemplazan al pendiente sin duplicar.
const mergeServerMessage = (
  currentMessages: LocalChatMessage[],
  serverMessage: ChatMessage,
  localMessageId?: number,
): LocalChatMessage[] => {
  if (currentMessages.some((item) => item.id === serverMessage.id)) {
    const withoutPending = currentMessages.filter(
      (item) => !matchesPendingMessage(item, serverMessage, localMessageId),
    );
    return withoutPending.length === currentMessages.length
      ? currentMessages
      : withoutPending;
  }

  const pendingIndex = currentMessages.findIndex((item) =>
    matchesPendingMessage(item, serverMessage, localMessageId),
  );
  if (pendingIndex >= 0) {
    const nextMessages = [...currentMessages];
    nextMessages[pendingIndex] = serverMessage;
    return nextMessages;
  }

  return [...currentMessages, serverMessage];
};

const buildDisplayName = (user: ChatConversation['participant']) => {
  const name = [user.name, user.lastname].filter(Boolean).join(' ').trim();
  return name || user.email || 'Profesional';
};

const normalizeFileName = (name: string | null | undefined, fallback: string) => {
  const safeName = (name ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safeName || fallback;
};

const guessMimeType = (uri: string, fallback = 'application/octet-stream') => {
  const lowerUri = uri.toLowerCase();

  if (lowerUri.endsWith('.jpg') || lowerUri.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lowerUri.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerUri.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lowerUri.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lowerUri.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (lowerUri.endsWith('.webm')) {
    return 'audio/webm';
  }
  if (lowerUri.endsWith('.aac')) {
    return 'audio/aac';
  }
  if (lowerUri.endsWith('.m4a') || lowerUri.endsWith('.mp4')) {
    return 'audio/mp4';
  }

  return fallback;
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getLocalDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const formatMessageDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateKey = getLocalDateKey(date);

  if (dateKey === getLocalDateKey(today)) {
    return 'Hoy';
  }

  if (dateKey === getLocalDateKey(yesterday)) {
    return 'Ayer';
  }

  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

const formatScheduleLabel = (value?: string | null, duration?: number | null) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const label = date.toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${label}${duration ? ` · ${duration} min` : ''}`;
};

const sortConversations = (items: ChatConversation[]) =>
  [...items].sort((left, right) => {
    const leftDate = left.last_message_at ?? left.updated_at;
    const rightDate = right.last_message_at ?? right.updated_at;
    return new Date(rightDate).getTime() - new Date(leftDate).getTime();
  });

const hasConversationHistory = (conversation: ChatConversation) =>
  Boolean(conversation.last_message);

const deliveryStatusRank: Record<ChatDeliveryStatus, number> = {
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

const promoteDeliveryStatus = (
  currentStatus: ChatDeliveryStatus | null,
  nextStatus: ChatDeliveryStatus,
) => {
  const currentRank = currentStatus ? deliveryStatusRank[currentStatus] : 0;
  return deliveryStatusRank[nextStatus] > currentRank ? nextStatus : currentStatus;
};

const applyReceiptStatus = (
  messages: ChatMessage[],
  conversationId: number,
  receiptUserId: number,
  lastMessageId: number | null,
  status: ChatDeliveryStatus,
) => {
  if (!lastMessageId) return messages;

  return messages.map((message) => {
    if (
      message.conversation_id !== conversationId ||
      message.sender_id === receiptUserId ||
      message.id > lastMessageId
    ) {
      return message;
    }

    const nextStatus = promoteDeliveryStatus(message.delivery_status, status);
    return nextStatus === message.delivery_status
      ? message
      : { ...message, delivery_status: nextStatus };
  });
};

const getDeliveryReceiptLabel = (status: ChatDeliveryStatus | null) => {
  if (status === 'READ') return 'Visto';
  if (status === 'DELIVERED') return 'Entregado';
  return 'Enviado';
};

const toProfessionalOption = (
  summary: AssignedProfessionalSummary | null,
): ProfessionalChatOption | null => {
  if (summary?.status !== 'assigned' || !summary.id) {
    return null;
  }

  const id = Number(summary.id);
  if (!Number.isFinite(id)) {
    return null;
  }

  return {
    id,
    name: summary.fullName ?? 'Profesional',
    roleLabel: summary.roleLabel,
  };
};

const AttachmentPreview = ({
  attachment,
  isMine,
  activeAudioAttachmentId,
  onAudioActiveChange,
  onPreview,
  onDownload,
}: {
  attachment: ChatAttachment;
  isMine: boolean;
  activeAudioAttachmentId: number | null;
  onAudioActiveChange: (attachmentId: number | null) => void;
  onPreview: (attachment: ChatAttachment) => void;
  onDownload: (attachment: ChatAttachment) => void;
}) => {
  const styles = useThemedStyles(createStyles);
  const { theme } = useAppTheme();

  if (attachment.type === 'IMAGE' && attachment.url) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onPreview(attachment)}
      >
        <Image source={{ uri: attachment.url }} style={styles.imageAttachment} />
      </TouchableOpacity>
    );
  }

  if (attachment.type === 'AUDIO') {
    return (
      <AudioMessagePlayer
        attachment={attachment}
        isMine={isMine}
        isActive={activeAudioAttachmentId === attachment.id}
        onActiveChange={onAudioActiveChange}
        onDownload={onDownload}
      />
    );
  }

  const icon = attachment.type === 'PDF' ? 'document-text' : 'link';
  const label =
    attachment.file_name || (attachment.type === 'PDF' ? 'PDF' : attachment.url);

  return (
    <TouchableOpacity
      style={styles.fileAttachment}
      activeOpacity={0.75}
      onPress={() => {
        if (attachment.type === 'PDF') {
          onPreview(attachment);
          return;
        }
        onDownload(attachment);
      }}
    >
      <Ionicons name={icon} size={16} color={getAuroraTokens(theme.isDark).tones.blue.ink} />
      <Text style={styles.fileAttachmentText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const getReplyPreview = (
  message:
    | ChatMessage
    | NonNullable<ChatMessage['reply_to']>
    | null
    | undefined,
) => {
  if (!message) return 'Mensaje';
  if (message.is_deleted) return 'Mensaje eliminado';
  if (message.body?.trim()) return message.body;

  const attachmentCount =
    'attachments' in message ? message.attachments.length : message.attachment_count;
  const attachmentType =
    'attachments' in message ? message.attachments[0]?.type : message.first_attachment_type;

  if (!attachmentCount) return 'Mensaje';
  if (attachmentType === 'IMAGE') return 'Imagen';
  if (attachmentType === 'AUDIO') return 'Audio';
  if (attachmentType === 'PDF') return 'PDF';
  return 'Adjunto';
};

const MessageBubble = React.memo(function MessageBubble({
  message,
  isMine,
  senderLabel,
  onReply,
  onDelete,
  onRetry,
  onReferencePress,
  onPreviewAttachment,
  onDownloadAttachment,
  activeAudioAttachmentId,
  onAudioActiveChange,
  isHighlighted,
}: {
  message: LocalChatMessage;
  isMine: boolean;
  senderLabel: (senderId: number | null) => string;
  onReply: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onRetry: (message: LocalChatMessage) => void;
  onReferencePress: (messageId: number) => void;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onDownloadAttachment: (attachment: ChatAttachment) => void;
  activeAudioAttachmentId: number | null;
  onAudioActiveChange: (attachmentId: number | null) => void;
  isHighlighted: boolean;
}) {
  const { width } = useWindowDimensions();
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const isPendingSend = message.localStatus === 'sending';
  const isFailedSend = message.localStatus === 'failed';
  const hasAudioAttachment = message.attachments.some(
    (attachment) => attachment.type === 'AUDIO',
  );
  const audioBubbleWidth = Math.min(
    280,
    Math.max(0, (width - spacing.md * 2) * 0.84),
  );
  const showActions = () => {
    const buttons = [
      {
        text: 'Responder',
        onPress: () => onReply(message),
      },
    ];

    if (isMine && !message.is_deleted) {
      buttons.push({
        text: 'Eliminar',
        onPress: () => onDelete(message),
      });
    }

    Alert.alert('Mensaje', undefined, [
      ...buttons,
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onLongPress={message.localStatus ? undefined : showActions}
      onPress={isFailedSend ? () => onRetry(message) : undefined}
      style={[styles.messageRow, isMine ? styles.messageRowMine : null]}
    >
      <View
        style={[
          styles.messageBubble,
          hasAudioAttachment ? { width: audioBubbleWidth } : null,
          isMine ? styles.messageBubbleMine : null,
          isPendingSend ? styles.messageBubbleSending : null,
          isFailedSend ? styles.messageBubbleFailed : null,
          isHighlighted ? styles.messageBubbleHighlighted : null,
        ]}
      >
        {isMine ? (
          <LinearGradient
            pointerEvents="none"
            colors={getAuroraTokens(theme.isDark).tones.blue.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.messageGradient]}
          />
        ) : null}
        {message.reply_to ? (
          <TouchableOpacity
            activeOpacity={0.78}
            style={[
              styles.replyBlock,
              isMine ? styles.replyBlockMine : null,
            ]}
            onPress={() => onReferencePress(message.reply_to?.id ?? 0)}
          >
            <Text
              style={[
                styles.replyAuthor,
                isMine ? styles.replyAuthorMine : null,
              ]}
              numberOfLines={1}
            >
              {senderLabel(message.reply_to.sender_id)}
            </Text>
            <Text
              style={[
                styles.replyText,
                isMine ? styles.replyTextMine : null,
              ]}
              numberOfLines={1}
            >
              {getReplyPreview(message.reply_to)}
            </Text>
          </TouchableOpacity>
        ) : null}

        {message.is_deleted ? (
          <Text style={[styles.messageDeleted, isMine ? styles.messageBodyMine : null]}>
            Mensaje eliminado
          </Text>
        ) : message.body ? (
          <Text
            style={[
              styles.messageBody,
              isMine ? styles.messageBodyMine : null,
              isFailedSend ? styles.messageBodyFailed : null,
            ]}
          >
            {message.body}
          </Text>
        ) : null}
        {!message.is_deleted && message.attachments.length ? (
          <View style={styles.attachmentList}>
            {message.attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                isMine={isMine}
                activeAudioAttachmentId={activeAudioAttachmentId}
                onAudioActiveChange={onAudioActiveChange}
                onPreview={onPreviewAttachment}
                onDownload={onDownloadAttachment}
              />
            ))}
          </View>
        ) : null}
        <View style={[styles.messageMeta, isMine ? styles.messageMetaMine : null]}>
          <Text
            style={[
              styles.messageTime,
              isMine ? styles.messageTimeMine : null,
              isFailedSend ? styles.messageTimeFailed : null,
            ]}
          >
            {formatMessageTime(message.created_at)}
          </Text>
          {isMine ? (
            <View
              accessibilityLabel={
                isFailedSend
                  ? 'No se envió'
                  : isPendingSend
                    ? 'Enviando'
                    : getDeliveryReceiptLabel(message.delivery_status)
              }
              accessibilityRole="image"
              accessible
              style={styles.messageReceipt}
            >
              <Ionicons
                name={
                  isFailedSend
                    ? 'alert-circle'
                    : isPendingSend
                      ? 'time-outline'
                      : message.delivery_status === 'SENT'
                        ? 'checkmark'
                        : 'checkmark-done'
                }
                size={15}
                color={
                  isFailedSend
                    ? getAuroraTokens(theme.isDark).onTone
                    : message.delivery_status === 'READ'
                      ? (theme.isDark ? '#075985' : '#a5f3fc')
                      : getAuroraTokens(theme.isDark).onTone
                }
              />
            </View>
          ) : null}
        </View>
        {isFailedSend ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => onRetry(message)}
            style={styles.messageRetryButton}
            accessibilityRole="button"
            accessibilityLabel="Reintentar envío"
          >
            <Ionicons name="refresh" size={13} color={theme.colors.error} />
            <Text style={styles.messageRetryText}>No se envió · Reintentar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const ConversationAvatar = ({
  conversation,
  variant = 'list',
}: {
  conversation: ChatConversation;
  variant?: 'list' | 'thread';
}) => {
  const aurora = useAurora();
  const styles = useThemedStyles(createStyles);
  const displayName = buildDisplayName(conversation.participant);
  const imageUri = conversation.participant.profile_picture;
  const initials = [conversation.participant.name, conversation.participant.lastname]
    .map((part) => part?.trim().charAt(0) ?? '')
    .join('')
    .slice(0, 2) || displayName.charAt(0);

  return (
    <LinearGradient
      colors={aurora.tones.blue.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatar, variant === 'thread' ? styles.threadAvatar : null]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.avatarImage} />
      ) : (
        <Text style={[styles.avatarText, variant === 'thread' ? styles.threadAvatarText : null]}>
          {initials}
        </Text>
      )}
    </LinearGradient>
  );
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const aurora = useAurora();
  const { width, height } = useWindowDimensions();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const isFocused = useIsFocused();
  const { hideTabBar, showTabBar } = useBottomTabBarVisibility();
  const { user } = useAuthStore();
  const careTeam = useCareTeam(user?.id ?? null);
  const scrollRef = useRef<ScrollView | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messageOffsetsRef = useRef(new Map<number, number>());
  const highlightedMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isNearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const recordingOptions = useMemo(
    () => ({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }),
    [],
  );
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder, 250);

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(
    () => {
      const parsed = Number(params.conversationId);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    },
  );
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingChatFile[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [activeAudioAttachmentId, setActiveAudioAttachmentId] = useState<number | null>(
    null,
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(
    null,
  );
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConfirmingProposal, setIsConfirmingProposal] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [hasAutoSelectedConversation, setHasAutoSelectedConversation] = useState(false);

  const currentUserId = Number(user?.id);
  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeConversationId) ??
      null,
    [activeConversationId, conversations],
  );
  const pendingProposalLabel = activeConversation
    ? formatScheduleLabel(
        activeConversation.contact_request_proposed_start_at,
        activeConversation.contact_request_proposed_duration_minutes,
      )
    : null;
  const canConfirmScheduleProposal = Boolean(
    activeConversation?.contact_request_id &&
      activeConversation.contact_request_status === 'proposed' &&
      activeConversation.contact_request_proposed_start_at &&
      !activeConversation.contact_request_scheduled_appointment_id,
  );
  const isThreadOpen = Boolean(activeConversation);
  const professionalRole = mergeDistinctText(
    ...Object.values(careTeam.summaries)
      .filter((summary) => summary?.status === 'assigned' && Number(summary.id) === activeConversation?.professional_id)
      .map((summary) => summary?.roleLabel),
  ) ?? 'Profesional FitPilot';

  useEffect(() => {
    if (isFocused) {
      setHasAutoSelectedConversation(false);
    }
  }, [isFocused]);

  useFocusEffect(
    useCallback(() => {
      if (isThreadOpen) {
        hideTabBar();
      } else {
        showTabBar();
      }

      return () => {
        showTabBar();
      };
    }, [hideTabBar, isThreadOpen, showTabBar]),
  );

  const closeThread = useCallback(() => {
    Keyboard.dismiss();
    setActiveConversationId(null);
    setHasAutoSelectedConversation(true);
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isThreadOpen) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        closeThread();
        return true;
      });
      return () => subscription.remove();
    }, [closeThread, isThreadOpen]),
  );

  const professionalOptions = useMemo(() => {
    const rawOptions = [
      toProfessionalOption(careTeam.summaries.nutrition),
      toProfessionalOption(careTeam.summaries.training),
    ].filter((option): option is ProfessionalChatOption => Boolean(option));
    const seen = new Set<number>();

    return rawOptions.filter((option) => {
      if (seen.has(option.id)) {
        return false;
      }
      seen.add(option.id);
      return true;
    });
  }, [careTeam.summaries.nutrition, careTeam.summaries.training]);

  const visibleConversations = useMemo(
    () => conversations.filter(hasConversationHistory),
    [conversations],
  );

  const startableProfessionalOptions = useMemo(() => {
    const visibleProfessionalIds = new Set(
      visibleConversations.map((conversation) => conversation.professional_id),
    );

    return professionalOptions.filter(
      (professional) => !visibleProfessionalIds.has(professional.id),
    );
  }, [professionalOptions, visibleConversations]);

  const upsertConversation = useCallback((conversation: ChatConversation) => {
    setConversations((currentConversations) =>
      sortConversations([
        conversation,
        ...currentConversations.filter((item) => item.id !== conversation.id),
      ]),
    );
  }, []);

  const loadConversations = useCallback(async () => {
    const response = await getChatConversations();
    setConversations(sortConversations(response));
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadConversations(),
        activeConversationId ? getChatMessages(activeConversationId) : Promise.resolve([]),
      ]).then(([, latestMessages]) => {
        if (Array.isArray(latestMessages)) {
          setMessages(latestMessages);
        }
      });
    } catch {
      hapticError();
      toast.error('No se pudo actualizar el chat.');
    } finally {
      setIsRefreshing(false);
    }
  }, [activeConversationId, loadConversations]);

  const appendPendingFiles = useCallback((files: PendingChatFile[]) => {
    if (!files.length) {
      return;
    }

    setPendingFiles((currentFiles) => {
      const availableSlots = MAX_FILES_PER_MESSAGE - currentFiles.length;

      if (availableSlots <= 0) {
        hapticError();
        toast.error('Límite de adjuntos', 'Puedes enviar hasta 4 archivos por mensaje.');
        return currentFiles;
      }

      const acceptedFiles = files
        .filter((file) => {
          if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
            hapticError();
            toast.error('Archivo muy grande', `${file.name} supera el límite de 10 MB.`);
            return false;
          }

          return true;
        })
        .slice(0, availableSlots);

      if (acceptedFiles.length < files.length) {
        hapticError();
        toast.info('Límite de adjuntos', 'Algunos archivos no se agregaron.');
      }

      return [...currentFiles, ...acceptedFiles];
    });
  }, []);

  const handlePickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      hapticError();
      toast.error('Permiso requerido', 'Necesitamos acceso a tus fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      allowsMultipleSelection: true,
      selectionLimit: MAX_FILES_PER_MESSAGE,
    });

    if (result.canceled) {
      return;
    }

    appendPendingFiles(
      result.assets.map((asset) => ({
        id: makeLocalId(),
        uri: asset.uri,
        name: normalizeFileName(asset.fileName, `imagen-${Date.now()}.jpg`),
        type: asset.mimeType ?? guessMimeType(asset.uri, 'image/jpeg'),
        size: asset.fileSize,
      })),
    );
  }, [appendPendingFiles]);

  const handlePickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'audio/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    appendPendingFiles(
      result.assets.map((asset) => ({
        id: makeLocalId(),
        uri: asset.uri,
        name: normalizeFileName(asset.name, `archivo-${Date.now()}`),
        type: asset.mimeType ?? guessMimeType(asset.uri),
        size: asset.size,
      })),
    );
  }, [appendPendingFiles]);

  const finishRecording = useCallback(async (discard: boolean) => {
    if (!isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = false;

    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      const durationMillis =
        recorderState.durationMillis ||
        Math.max(0, Date.now() - (recordingStartedAtRef.current ?? Date.now()));
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri ?? recorderState.url;

      if (uri && !discard) {
        appendPendingFiles([
          {
            id: makeLocalId(),
            uri,
            name: `nota-voz-${Date.now()}.m4a`,
            type: guessMimeType(uri, 'audio/mp4'),
            durationMillis,
          },
        ]);
      }
    } catch {
      isRecordingRef.current = recorderState.isRecording;
      hapticError();
      toast.error(
        discard
          ? 'No se pudo cancelar la grabación.'
          : 'No se pudo guardar la nota de voz.',
      );
    } finally {
      recordingStartedAtRef.current = null;
    }
  }, [
    appendPendingFiles,
    recorder,
    recorderState.durationMillis,
    recorderState.isRecording,
    recorderState.url,
  ]);

  const stopRecording = useCallback(
    () => finishRecording(false),
    [finishRecording],
  );

  const cancelRecording = useCallback(
    () => finishRecording(true),
    [finishRecording],
  );

  const startRecording = useCallback(async () => {
    if (pendingFiles.length >= MAX_FILES_PER_MESSAGE) {
      hapticError();
      toast.error('Límite de adjuntos', 'Elimina un archivo antes de grabar audio.');
      return;
    }

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      hapticError();
      toast.error('Permiso requerido', 'Necesitamos acceso al micrófono.');
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingStartedAtRef.current = Date.now();
      isRecordingRef.current = true;
      recordingTimerRef.current = setTimeout(() => {
        void stopRecording();
      }, MAX_AUDIO_SECONDS * 1000);
    } catch {
      hapticError();
      toast.error('No se pudo iniciar la grabación.');
      recordingStartedAtRef.current = null;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    }
  }, [pendingFiles.length, recorder, stopRecording]);

  const startConversation = useCallback(
    async (professionalId?: number) => {
      setIsStartingConversation(true);
      try {
        const conversation = await getOrCreateChatConversation(
          professionalId ? { professional_id: professionalId } : {},
        );
        upsertConversation(conversation);
        setActiveConversationId(conversation.id);
        setHasAutoSelectedConversation(true);
      } catch {
        hapticError();
        toast.error(
          'Chat no disponible',
          'No se pudo abrir una conversación con tu profesional.',
        );
      } finally {
        setIsStartingConversation(false);
      }
    },
    [upsertConversation],
  );

  const getSenderLabel = useCallback(
    (senderId: number | null) =>
      senderId && senderId === currentUserId
        ? 'Tú'
        : activeConversation
          ? buildDisplayName(activeConversation.participant)
          : 'Profesional',
    [activeConversation, currentUserId],
  );

  const scrollToMessage = useCallback(
    (messageId: number) => {
      if (!messages.some((message) => message.id === messageId)) {
        hapticError();
        toast.error('Mensaje no disponible', 'Ese mensaje no está cargado en este historial.');
        return;
      }

      const messageOffset = messageOffsetsRef.current.get(messageId);
      if (messageOffset == null) {
        hapticError();
        toast.info('Mensaje no disponible', 'Espera un momento mientras termina de mostrarse.');
        return;
      }

      scrollRef.current?.scrollTo({
        y: Math.max(0, messageOffset - spacing.lg),
        animated: true,
      });

      setHighlightedMessageId(messageId);
      if (highlightedMessageTimerRef.current) {
        clearTimeout(highlightedMessageTimerRef.current);
      }
      highlightedMessageTimerRef.current = setTimeout(() => {
        setHighlightedMessageId(null);
        highlightedMessageTimerRef.current = null;
      }, MESSAGE_HIGHLIGHT_DURATION_MS);
    },
    [messages],
  );

  const scrollToLatestMessages = useCallback(() => {
    isNearBottomRef.current = true;
    setPendingNewMessageCount(0);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleMessagesScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const isNearBottom = distanceFromBottom <= NEW_MESSAGE_BOTTOM_THRESHOLD;

      isNearBottomRef.current = isNearBottom;
      if (isNearBottom) {
        setPendingNewMessageCount((currentCount) =>
          currentCount === 0 ? currentCount : 0,
        );
      }
    },
    [],
  );

  const handleDeleteMessage = useCallback(
    (message: ChatMessage) => {
      if (!activeConversationId || message.sender_id !== currentUserId || message.is_deleted) {
        return;
      }

      Alert.alert('Eliminar mensaje', '¿Eliminar este mensaje para todos?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const deletedMessage = await deleteChatMessage(activeConversationId, message.id);
              setMessages((currentMessages) =>
                currentMessages
                  .filter((item) => item.id !== deletedMessage.id)
                  .concat(deletedMessage)
                  .sort((left, right) => left.id - right.id),
              );
              setReplyToMessage((current) =>
                current?.id === deletedMessage.id ? deletedMessage : current,
              );
              await loadConversations();
            } catch {
              hapticError();
              toast.error('No se pudo eliminar el mensaje.');
            }
          },
        },
      ]);
    },
    [activeConversationId, currentUserId, loadConversations],
  );

  const deliverPendingTextMessage = useCallback(
    async (
      conversationId: number,
      localMessageId: number,
      payload: { body: string; clientMessageId: string; replyToMessageId?: number },
    ) => {
      try {
        const message = await sendChatMessage(conversationId, {
          body: payload.body,
          clientMessageId: payload.clientMessageId,
          replyToMessageId: payload.replyToMessageId,
        });
        setMessages((currentMessages) =>
          mergeServerMessage(currentMessages, message, localMessageId),
        );
        await Promise.allSettled([
          markChatConversationRead(conversationId),
          loadConversations(),
        ]);
      } catch {
        hapticError();
        toast.error('Mensaje no enviado', 'Intenta de nuevo en un momento.');
        setMessages((currentMessages) =>
          currentMessages.map((item) =>
            item.id === localMessageId
              ? { ...item, localStatus: 'failed' as const }
              : item,
          ),
        );
      }
    },
    [loadConversations],
  );

  const handleRetryMessage = useCallback(
    (message: LocalChatMessage) => {
      if (message.localStatus !== 'failed' || !message.client_message_id || !message.body) {
        return;
      }

      setMessages((currentMessages) =>
        currentMessages.map((item) =>
          item.id === message.id
            ? { ...item, localStatus: 'sending' as const }
            : item,
        ),
      );
      // Reutiliza el mismo client_message_id: el backend deduplica el reintento.
      void deliverPendingTextMessage(message.conversation_id, message.id, {
        body: message.body,
        clientMessageId: message.client_message_id,
        replyToMessageId: message.reply_to_message_id ?? undefined,
      });
    },
    [deliverPendingTextMessage],
  );

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!activeConversationId || (!body && pendingFiles.length === 0) || isSending) {
      return;
    }

    if (pendingFiles.length === 0) {
      // Envío optimista solo texto: la burbuja aparece de inmediato y el
      // servidor confirma (o falla) en segundo plano sin bloquear el composer.
      const clientMessageId = makeLocalId();
      const replyTo = replyToMessage;
      const pendingMessage: LocalChatMessage = {
        id: makeLocalMessageId(),
        conversation_id: activeConversationId,
        sender_id: currentUserId,
        external_sender_contact_id: null,
        sender_type: 'USER',
        channel: 'IN_APP',
        reply_to_message_id: replyTo?.id ?? null,
        reply_to: replyTo ? toReplyPreviewMessage(replyTo) : null,
        body,
        client_message_id: clientMessageId,
        external_message_id: null,
        external_status: null,
        external_error: null,
        created_at: new Date().toISOString(),
        is_deleted: false,
        deleted_at: null,
        deleted_by_user_id: null,
        delivery_status: null,
        attachments: [],
        localStatus: 'sending',
      };

      setMessages((currentMessages) => [...currentMessages, pendingMessage]);
      setDraft('');
      setReplyToMessage(null);
      hapticImpactLight();
      void deliverPendingTextMessage(activeConversationId, pendingMessage.id, {
        body,
        clientMessageId,
        replyToMessageId: replyTo?.id,
      });
      return;
    }

    setIsSending(true);
    try {
      const message = await sendChatMessage(activeConversationId, {
        body: body || undefined,
        files: pendingFiles,
        clientMessageId: makeLocalId(),
        replyToMessageId: replyToMessage?.id,
      });
      setMessages((currentMessages) => {
        if (currentMessages.some((item) => item.id === message.id)) {
          return currentMessages;
        }

        return [...currentMessages, message];
      });
      setDraft('');
      setReplyToMessage(null);
      setPendingFiles([]);
      hapticImpactLight();
      await Promise.allSettled([
        markChatConversationRead(activeConversationId),
        loadConversations(),
      ]);
    } catch {
      hapticError();
      toast.error('Mensaje no enviado', 'Intenta de nuevo en un momento.');
    } finally {
      setIsSending(false);
    }
  }, [
    activeConversationId,
    currentUserId,
    deliverPendingTextMessage,
    draft,
    isSending,
    loadConversations,
    pendingFiles,
    replyToMessage,
  ]);

  const confirmScheduleProposal = useCallback(() => {
    if (
      !activeConversationId ||
      !activeConversation?.contact_request_id ||
      !pendingProposalLabel ||
      isConfirmingProposal
    ) {
      return;
    }

    Alert.alert(
      'Confirmar cita',
      `¿Quieres agendar la primera cita para ${pendingProposalLabel}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setIsConfirmingProposal(true);
            try {
              await confirmProfessionalContactRequestSchedule(
                activeConversation.contact_request_id as number,
              );
              const [latestMessages] = await Promise.all([
                getChatMessages(activeConversationId),
                loadConversations(),
              ]);
              setMessages(latestMessages);
              hapticSuccess();
              toast.success('Cita agendada', 'Tu cita quedó confirmada.');
            } catch {
              hapticError();
              toast.error(
                'No se pudo confirmar',
                'Intenta de nuevo o responde en el chat para acordar otro horario.',
              );
            } finally {
              setIsConfirmingProposal(false);
            }
          },
        },
      ],
    );
  }, [
    activeConversation,
    activeConversationId,
    isConfirmingProposal,
    loadConversations,
    pendingProposalLabel,
  ]);

  const handleDownloadAttachment = useCallback((attachment: ChatAttachment) => {
    if (!attachment.url) {
      return;
    }

    Alert.alert(
      'Descargar archivo',
      `¿Deseas descargar ${attachment.file_name || 'este archivo'}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descargar',
          onPress: () => {
            void Linking.openURL(attachment.url as string);
          },
        },
      ],
    );
  }, []);

  useEffect(() => {
    const parsed = Number(params.conversationId);
    if (Number.isFinite(parsed) && parsed > 0) {
      setActiveConversationId(parsed);
      setHasAutoSelectedConversation(true);
    }
  }, [params.conversationId]);

  useEffect(() => {
    setIsLoadingConversations(true);
    loadConversations()
      .catch(() => {
        hapticError();
        toast.error('No se pudieron cargar tus conversaciones.');
      })
      .finally(() => {
        setIsLoadingConversations(false);
      });
  }, [loadConversations]);

  useEffect(() => {
    if (
      isFocused &&
      !hasAutoSelectedConversation &&
      !activeConversationId &&
      visibleConversations.length === 1
    ) {
      setActiveConversationId(visibleConversations[0].id);
      setHasAutoSelectedConversation(true);
    }
  }, [
    activeConversationId,
    hasAutoSelectedConversation,
    isFocused,
    visibleConversations,
  ]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setReplyToMessage(null);
      return;
    }

    setReplyToMessage(null);
    setIsLoadingMessages(true);
    getChatMessages(activeConversationId)
      .then((response) => {
        setMessages(response);
        return markChatConversationRead(activeConversationId);
      })
      .then(() => loadConversations())
      .catch(() => {
        hapticError();
        toast.error('No se pudieron cargar los mensajes.');
      })
      .finally(() => {
        setIsLoadingMessages(false);
      });
  }, [activeConversationId, loadConversations]);

  useEffect(() => {
    let isMounted = true;
    let socket: Socket | null = null;

    const connectSocket = async () => {
      const token = await getChatSocketToken();
      if (!token || !isMounted) {
        return;
      }

      socket = io(resolveChatSocketUrl(), {
        auth: { token },
        transports: ['websocket'],
      });
      socketRef.current = socket;

      let hasConnectedBefore = false;
      socket.on('connect', () => {
        if (activeConversationId) {
          socket?.emit('conversation:join', { conversation_id: activeConversationId });
        }

        // En una RECONEXION (tunel, cambio de red), el stream no tiene replay:
        // los mensajes llegados durante la desconexion se perdieron del socket.
        // Recargamos la conversación activa y la lista para cerrar el hueco.
        if (hasConnectedBefore) {
          if (activeConversationId) {
            getChatMessages(activeConversationId)
              .then((response) => {
                if (isMounted) {
                  setMessages(response);
                }
              })
              .catch(() => undefined);
          }
          loadConversations().catch(() => undefined);
        }
        hasConnectedBefore = true;
      });

      socket.on('message:new', (message: ChatMessage) => {
        if (message.conversation_id === activeConversationId) {
          // Puede ser el eco de un envío optimista propio (llega incluso antes
          // que la respuesta HTTP): reemplaza al pendiente con el mismo
          // client_message_id en lugar de duplicarlo.
          setMessages((currentMessages) => mergeServerMessage(currentMessages, message));
          if (message.sender_id !== currentUserId) {
            void markChatConversationDelivered(message.conversation_id, message.id).catch(
              () => undefined,
            );
          }
          void markChatConversationRead(activeConversationId).catch(() => undefined);
        }

        void loadConversations().catch(() => undefined);
      });

      socket.on('message:deleted', (message: ChatMessage) => {
        if (message.conversation_id === activeConversationId) {
          setMessages((currentMessages) =>
            currentMessages
              .filter((item) => item.id !== message.id)
              .concat(message)
              .sort((left, right) => left.id - right.id),
          );
          setReplyToMessage((current) => (current?.id === message.id ? message : current));
        }
        void loadConversations();
      });

      socket.on('conversation:updated', (conversation: ChatConversation) => {
        upsertConversation(conversation);
      });

      socket.on(
        'conversation:delivered',
        (receipt: {
          conversation_id: number;
          user_id: number;
          last_delivered_message_id: number | null;
        }) => {
          setMessages((currentMessages) =>
            applyReceiptStatus(
              currentMessages,
              receipt.conversation_id,
              receipt.user_id,
              receipt.last_delivered_message_id,
              'DELIVERED',
            ),
          );
        },
      );

      socket.on(
        'conversation:read',
        (receipt: {
          conversation_id: number;
          user_id: number;
          last_read_message_id: number | null;
        }) => {
          setMessages((currentMessages) =>
            applyReceiptStatus(
              currentMessages,
              receipt.conversation_id,
              receipt.user_id,
              receipt.last_read_message_id,
              'READ',
            ),
          );
        },
      );
    };

    void connectSocket();

    return () => {
      isMounted = false;
      if (socket && activeConversationId) {
        socket.emit('conversation:leave', { conversation_id: activeConversationId });
      }
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [activeConversationId, currentUserId, loadConversations, upsertConversation]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const addedMessageCount = Math.max(0, messages.length - previousCount);
    const latestMessage = messages[messages.length - 1];
    const shouldScrollToEnd =
      addedMessageCount > 0 &&
      (previousCount === 0 ||
        isNearBottomRef.current ||
        latestMessage?.sender_id === currentUserId);

    previousMessageCountRef.current = messages.length;

    if (shouldScrollToEnd) {
      setPendingNewMessageCount(0);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    } else if (addedMessageCount > 0) {
      setPendingNewMessageCount(
        (currentCount) => currentCount + addedMessageCount,
      );
    }
  }, [currentUserId, messages]);

  useEffect(() => {
    messageOffsetsRef.current.clear();
    previousMessageCountRef.current = 0;
    isNearBottomRef.current = true;
    setPendingNewMessageCount(0);
    setHighlightedMessageId(null);
    setActiveAudioAttachmentId(null);
  }, [activeConversationId]);

  useEffect(() => {
    isRecordingRef.current = recorderState.isRecording;
  }, [recorderState.isRecording]);

  useEffect(
    () => () => {
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
      }
      if (highlightedMessageTimerRef.current) {
        clearTimeout(highlightedMessageTimerRef.current);
      }
    },
    [],
  );

  const isInputDisabled = !activeConversation?.can_send || isSending;
  const canSend = Boolean(
    activeConversation &&
      activeConversation.can_send &&
      !isSending &&
      (draft.trim() || pendingFiles.length),
  );
  const recordingDuration = recorderState.isRecording
    ? recorderState.durationMillis ||
      Math.max(0, Date.now() - (recordingStartedAtRef.current ?? Date.now()))
    : 0;
  const recordingLevel =
    recorderState.isRecording && typeof recorderState.metering === 'number'
      ? Math.max(0.08, Math.min(1, (recorderState.metering + 60) / 48))
      : recorderState.isRecording
        ? 0.22
        : 0;
  const composerBottomPadding =
    CHAT_COMPOSER_PADDING +
    (isKeyboardVisible ? 0 : Math.max(
      insets.bottom,
      Platform.OS === 'android' ? ANDROID_NAV_BAR_FALLBACK_INSET : 0,
    ));

  const previewModal = (
    <Modal
      visible={Boolean(previewAttachment)}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setPreviewAttachment(null)}
    >
      <View
        style={[
          styles.previewModal,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.previewHeader}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.previewHeaderButton}
            onPress={() => setPreviewAttachment(null)}
          >
            <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.previewTitle} numberOfLines={1}>
            {previewAttachment?.file_name ||
              (previewAttachment?.type === 'PDF' ? 'PDF' : 'Imagen')}
          </Text>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.previewHeaderButton}
            onPress={() => {
              if (previewAttachment) {
                handleDownloadAttachment(previewAttachment);
              }
            }}
          >
            <Ionicons name="download-outline" size={22} color={getAuroraTokens(theme.isDark).tones.blue.ink} />
          </TouchableOpacity>
        </View>
        <View style={styles.previewBody}>
          {previewAttachment?.type === 'IMAGE' && previewAttachment.url ? (
            <Image
              source={{ uri: previewAttachment.url }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : previewAttachment?.type === 'PDF' && previewAttachment.url ? (
            <WebView
              source={{ uri: previewAttachment.url }}
              style={styles.previewPdf}
              startInLoadingState
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );

  if (activeConversation) {
    return (
      <TabScreenWrapper>
        {previewModal}
        <View style={styles.stage}>
          <AuroraBackdrop width={width} height={height} palette="chat" />
          <StatusBar style={theme.statusBarStyle} />
          <SafeAreaView style={styles.safeAreaTransparent} edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
              style={styles.threadShell}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <View style={styles.threadHeader}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Volver a conversaciones"
                  onPress={closeThread}
                  style={styles.threadIconButton}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={theme.colors.icon}
                  />
                </TouchableOpacity>
                <ConversationAvatar conversation={activeConversation} variant="thread" />
                <View style={styles.threadTitleBlock}>
                  <Text numberOfLines={1} style={styles.threadTitle}>
                    {buildDisplayName(activeConversation.participant)}
                  </Text>
                  <Text numberOfLines={1} style={styles.threadSubtitle}>
                    {professionalRole}
                  </Text>
                </View>
                {isRefreshing ? (
                  <ActivityIndicator size="small" color={aurora.tones.blue.tone} />
                ) : (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Opciones de conversación"
                    style={styles.threadIconButton}
                    onPress={() => Alert.alert(
                      'Conversación',
                      buildDisplayName(activeConversation.participant),
                      [
                        { text: 'Actualizar mensajes', onPress: () => { void handleRefresh(); } },
                        { text: 'Ver conversaciones', onPress: closeThread },
                        { text: 'Cancelar', style: 'cancel' },
                      ],
                      { cancelable: true },
                    )}
                  >
                    <Ionicons name="ellipsis-horizontal" size={22} color={aurora.text} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView
                ref={scrollRef}
                style={styles.messagesScroll}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                onScroll={handleMessagesScroll}
                onLayout={() => {
                  if (isNearBottomRef.current) {
                    scrollRef.current?.scrollToEnd({ animated: false });
                  }
                }}
                scrollEventThrottle={16}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={theme.colors.primary}
                  />
                }
              >
                {isLoadingMessages ? (
                  <View style={styles.messagesLoading}>
                    <ActivityIndicator size="small" color={getAuroraTokens(theme.isDark).tones.blue.ink} />
                  </View>
                ) : messages.length ? (
                  messages.map((message, index) => {
                    const previousMessage = messages[index - 1];
                    const showDateSeparator =
                      index === 0 ||
                      getLocalDateKey(previousMessage.created_at) !==
                        getLocalDateKey(message.created_at);

                    return (
                      <React.Fragment key={message.id}>
                        {showDateSeparator ? (
                          <View style={styles.dateSeparator}>
                            <Text style={styles.dateSeparatorText}>
                              {formatMessageDateLabel(message.created_at)}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          onLayout={(event) => {
                            messageOffsetsRef.current.set(
                              message.id,
                              event.nativeEvent.layout.y,
                            );
                          }}
                        >
                          <MessageBubble
                            message={message}
                            isMine={message.sender_id === currentUserId}
                            senderLabel={getSenderLabel}
                            onReply={setReplyToMessage}
                            onDelete={handleDeleteMessage}
                            onRetry={handleRetryMessage}
                            onReferencePress={scrollToMessage}
                            onPreviewAttachment={setPreviewAttachment}
                            onDownloadAttachment={handleDownloadAttachment}
                            activeAudioAttachmentId={activeAudioAttachmentId}
                            onAudioActiveChange={setActiveAudioAttachmentId}
                            isHighlighted={highlightedMessageId === message.id}
                          />
                        </View>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <View style={styles.emptyThread}>
                    <Text style={styles.emptyTitle}>Nuevo chat</Text>
                    <Text style={styles.emptyCopy}>
                      Envía el primer mensaje cuando estés listo.
                    </Text>
                  </View>
                )}
              </ScrollView>

              {pendingNewMessageCount > 0 ? (
                <View style={styles.newMessagesBar}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${pendingNewMessageCount} ${
                      pendingNewMessageCount === 1
                        ? 'mensaje nuevo'
                        : 'mensajes nuevos'
                    }`}
                    activeOpacity={0.78}
                    onPress={scrollToLatestMessages}
                    style={styles.newMessagesButton}
                  >
                    <Ionicons
                      name="arrow-down"
                      size={16}
                      color={aurora.onTone}
                    />
                    <Text style={styles.newMessagesButtonText}>
                      {pendingNewMessageCount === 1
                        ? '1 mensaje nuevo'
                        : `${pendingNewMessageCount} mensajes nuevos`}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {replyToMessage ? (
                <View style={styles.replyComposer}>
                  <Ionicons name="return-up-back" size={17} color={getAuroraTokens(theme.isDark).tones.blue.ink} />
                  <View style={styles.replyComposerContent}>
                    <Text style={styles.replyComposerTitle} numberOfLines={1}>
                      Respondiendo a {getSenderLabel(replyToMessage.sender_id)}
                    </Text>
                    <Text style={styles.replyComposerText} numberOfLines={1}>
                      {getReplyPreview(replyToMessage)}
                    </Text>
                  </View>
                  <TouchableOpacity hitSlop={8} onPress={() => setReplyToMessage(null)}>
                    <Ionicons
                      name="close"
                      size={18}
                      color={theme.colors.iconMuted}
                    />
                  </TouchableOpacity>
                </View>
              ) : null}

              {canConfirmScheduleProposal && pendingProposalLabel ? (
                <View style={styles.scheduleProposalCard}>
                  <View style={styles.scheduleProposalIcon}>
                    <Ionicons name="calendar-outline" size={18} color={aurora.onTone} />
                  </View>
                  <View style={styles.scheduleProposalContent}>
                    <Text style={styles.scheduleProposalTitle}>Nuevo horario propuesto</Text>
                    <Text style={styles.scheduleProposalText}>{pendingProposalLabel}</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    disabled={isConfirmingProposal}
                    onPress={confirmScheduleProposal}
                    style={[
                      styles.scheduleProposalButton,
                      isConfirmingProposal ? styles.scheduleProposalButtonDisabled : null,
                    ]}
                  >
                    {isConfirmingProposal ? (
                      <ActivityIndicator size="small" color={aurora.onTone} />
                    ) : (
                      <Text style={styles.scheduleProposalButtonText}>Confirmar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}

              {!activeConversation.can_send ? (
                <View style={styles.lockedNotice}>
                  <Ionicons name="lock-closed" size={15} color={theme.colors.warning} />
                  <Text style={styles.lockedNoticeText}>
                    El historial está disponible, pero el envío está cerrado.
                  </Text>
                </View>
              ) : null}

              <ChatComposer
                showSuggestions={!replyToMessage}
                draft={draft}
                pendingFiles={pendingFiles}
                disabled={isInputDisabled}
                canSend={canSend}
                isSending={isSending}
                isRecording={recorderState.isRecording}
                recordingDuration={recordingDuration}
                recordingLevel={recordingLevel}
                bottomPadding={composerBottomPadding}
                onChangeDraft={setDraft}
                onPickImage={() => {
                  void handlePickImage();
                }}
                onPickDocument={() => {
                  void handlePickDocument();
                }}
                onRemoveFile={(fileId) =>
                  setPendingFiles((currentFiles) =>
                    currentFiles.filter((item) => item.id !== fileId),
                  )
                }
                onStartRecording={() => {
                  void startRecording();
                }}
                onStopRecording={() => {
                  void stopRecording();
                }}
                onCancelRecording={() => {
                  void cancelRecording();
                }}
                onSend={() => {
                  void handleSend();
                }}
              />
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </TabScreenWrapper>
    );
  }

  return (
    <TabScreenWrapper>
      {previewModal}
      <View style={styles.stage}>
        <AuroraBackdrop width={width} height={height} palette="chat" />
        <StatusBar style={theme.statusBarStyle} />
        <SafeAreaView style={styles.safeAreaTransparent} edges={['top', 'left', 'right']}>
          <ScrollView
            contentContainerStyle={[
              styles.listScreenContent,
              { paddingBottom: Math.max(insets.bottom + 96, spacing.xl) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.listHeader}>
              <View>
                <Text style={styles.brand}>TU EQUIPO</Text>
                <Text style={styles.title}>Chat</Text>
                <Text style={styles.listSubtitle}>Conversa con tus profesionales.</Text>
              </View>
              <ProfileShortcutButton />
            </View>

            {isLoadingConversations ? (
              <View style={styles.conversationList}>
                {[1, 2, 3, 4, 5].map((item) => (
                  <ListItemSkeleton key={item} />
                ))}
              </View>
            ) : (
              <View style={styles.conversationList}>
                {visibleConversations.map((conversation) => (
                  <TouchableOpacity
                    key={conversation.id}
                    activeOpacity={0.76}
                    style={styles.conversationItem}
                    onPress={() => setActiveConversationId(conversation.id)}
                  >
                    <ConversationAvatar conversation={conversation} />
                    <View style={styles.conversationContent}>
                      <View style={styles.conversationTop}>
                        <Text style={styles.conversationName} numberOfLines={1}>
                          {buildDisplayName(conversation.participant)}
                        </Text>
                        {conversation.unread_count > 0 ? (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                              {conversation.unread_count > 9
                                ? '9+'
                                : conversation.unread_count}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.conversationPreview} numberOfLines={1}>
                        {getReplyPreview(conversation.last_message)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {startableProfessionalOptions.length ? (
                  startableProfessionalOptions.map((professional) => (
                    <TouchableOpacity
                      key={professional.id}
                      activeOpacity={0.76}
                      style={styles.conversationItem}
                      disabled={isStartingConversation}
                      onPress={() => startConversation(professional.id)}
                    >
                      <View style={styles.avatar}>
                        <Ionicons name="person" size={20} color={getAuroraTokens(theme.isDark).tones.blue.ink} />
                      </View>
                      <View style={styles.conversationContent}>
                        <Text style={styles.conversationName} numberOfLines={1}>
                          {professional.name}
                        </Text>
                        <Text style={styles.conversationPreview} numberOfLines={1}>
                          {professional.roleLabel
                            ? `${professional.roleLabel} · Iniciar conversación`
                            : 'Iniciar conversación'}
                        </Text>
                      </View>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={18}
                        color={theme.colors.iconMuted}
                      />
                    </TouchableOpacity>
                  ))
                ) : null}
              </View>
            )}

            {!isLoadingConversations &&
            !visibleConversations.length &&
            !startableProfessionalOptions.length ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={34}
                  color={theme.colors.iconMuted}
                />
                <Text style={styles.emptyTitle}>Sin conversaciones</Text>
                <Text style={styles.emptyCopy}>
                  Abre un chat con tu profesional asignado.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </TabScreenWrapper>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) => {
  const aurora = getAuroraTokens(theme.isDark);
  return StyleSheet.create({
    stage: {
      flex: 1,
      backgroundColor: aurora.ground,
    },
    safeAreaTransparent: {
      flex: 1,
    },
    threadShell: {
      flex: 1,
    },
    threadHeader: {
      backgroundColor: aurora.glass,
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: aurora.border,
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    threadIconButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
    },
    threadTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    threadTitle: {
      color: aurora.text,
      fontSize: 17,
      ...auroraFont('extrabold'),
    },
    threadSubtitle: {
      marginTop: 2,
      color: aurora.faint,
      fontSize: 13,
      ...auroraFont('semibold'),
    },
    listScreenContent: {
      flexGrow: 1,
      padding: spacing.md,
      paddingTop: spacing.lg,
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    brand: {
      color: aurora.tones.blue.tone,
      fontSize: 13,
      ...auroraFont('extrabold'),
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: 2,
      color: aurora.text,
      fontSize: 30,
      ...auroraFont('extrabold'),
    },
    loadingState: {
      minHeight: 220,
      alignItems: 'center',
      justifyContent: 'center',
    },
    conversationList: {
      gap: 10,
    },
    conversationItem: {
      boxShadow: aurora.shadow,
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: aurora.border,
      borderRadius: borderRadius.lg,
      backgroundColor: aurora.surface,
      padding: 14,
    },
    avatar: {
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: aurora.tones.blue.line,
      borderRadius: borderRadius.full,
      backgroundColor: aurora.tones.blue.soft,
    },
    threadAvatar: {
      width: 44,
      height: 44,
      borderColor: aurora.tones.blue.line,
      backgroundColor: aurora.tones.blue.soft,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      color: aurora.onTone,
      fontSize: fontSize.base,
      ...auroraFont('extrabold'),
      textTransform: 'uppercase',
    },
    threadAvatarText: {
      fontSize: fontSize.lg,
    },
    conversationContent: {
      flex: 1,
      minWidth: 0,
    },
    conversationTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    conversationName: {
      flex: 1,
      color: aurora.text,
      fontSize: fontSize.base,
      ...auroraFont('extrabold'),
    },
    conversationPreview: {
      ...auroraFont('medium'),
      marginTop: 4,
      color: aurora.faint,
      fontSize: fontSize.sm,
      lineHeight: 18,
    },
    unreadBadge: {
      minWidth: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      backgroundColor: aurora.tones.blue.tone,
      paddingHorizontal: spacing.xs,
    },
    unreadBadgeText: {
      color: aurora.onTone,
      fontSize: 11,
      ...auroraFont('extrabold'),
    },
    messagesScroll: {
      flex: 1,
    },
    messagesContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      gap: 12,
      padding: spacing.md,
      paddingBottom: spacing.lg,
    },
    dateSeparator: {
      alignSelf: 'center',
      marginVertical: 2,
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: aurora.glassBorder,
      backgroundColor: aurora.glass,
    },
    dateSeparatorText: {
      color: aurora.muted,
      fontSize: 11,
      ...auroraFont('bold'),
    },
    listSubtitle: {
      ...auroraFont('medium'),
      color: aurora.faint,
      fontSize: 12,
      marginTop: 6,
    },
    messagesLoading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.xl,
      borderWidth: 1,
      borderColor: aurora.border,
      borderRadius: borderRadius.lg,
      backgroundColor: aurora.surface,
      padding: spacing.xl,
    },
    emptyThread: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xl,
    },
    emptyTitle: {
      color: aurora.text,
      fontSize: fontSize.lg,
      ...auroraFont('extrabold'),
      textAlign: 'center',
    },
    emptyCopy: {
      ...auroraFont('medium'),
      color: aurora.faint,
      fontSize: fontSize.sm,
      lineHeight: 20,
      textAlign: 'center',
    },
    messageRow: {
      width: '100%',
      alignItems: 'flex-start',
    },
    messageRowMine: {
      alignItems: 'flex-end',
    },
    messageBubble: {
      boxShadow: aurora.shadow,
      maxWidth: '82%',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: aurora.border,
      borderRadius: 20,
      borderBottomLeftRadius: borderRadius.sm,
      backgroundColor: aurora.surface,
      padding: 12,
    },
    messageBubbleMine: {
      borderColor: 'rgba(255,255,255,0.24)',
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: borderRadius.sm,
      backgroundColor: aurora.tones.blue.tone,
    },
    messageGradient: {
      borderRadius: 20,
      borderBottomRightRadius: borderRadius.sm,
    },
    messageBubbleSending: {
      opacity: 0.72,
    },
    messageBubbleFailed: {
      borderColor: `${theme.colors.error}88`,
      backgroundColor: `${theme.colors.error}18`,
    },
    messageBubbleHighlighted: {
      borderColor: aurora.tones.blue.tone,
      shadowColor: aurora.tones.blue.tone,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.34,
      shadowRadius: 8,
      elevation: 3,
    },
    messageBody: {
      ...auroraFont('medium'),
      color: aurora.text,
      fontSize: 15,
      lineHeight: 21,
    },
    messageBodyMine: {
      color: aurora.onTone,
    },
    messageBodyFailed: {
      color: aurora.onTone,
    },
    messageDeleted: {
      color: aurora.faint,
      fontSize: 15,
      fontStyle: 'italic',
      lineHeight: 21,
    },
    replyBlock: {
      borderLeftWidth: 3,
      borderLeftColor: aurora.tones.blue.tone,
      borderRadius: borderRadius.md,
      backgroundColor: aurora.surface2,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    replyBlockMine: {
      borderLeftColor: aurora.onTone,
      backgroundColor: theme.isDark ? 'rgba(6,16,31,0.1)' : 'rgba(255,255,255,0.15)',
    },
    replyAuthor: {
      color: aurora.tones.blue.tone,
      fontSize: 10,
      ...auroraFont('extrabold'),
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    replyAuthorMine: {
      color: aurora.onTone,
    },
    replyText: {
      marginTop: 2,
      color: aurora.muted,
      fontSize: fontSize.xs,
      ...auroraFont('bold'),
    },
    replyTextMine: {
      color: aurora.onTone,
    },
    messageMeta: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2,
    },
    messageMetaMine: {
      alignSelf: 'flex-end',
    },
    messageTime: {
      color: aurora.faint,
      fontSize: 11,
      ...auroraFont('medium'),
    },
    messageTimeMine: {
      color: aurora.onTone,
    },
    messageTimeFailed: {
      color: aurora.onTone,
    },
    messageReceipt: {
      width: 17,
      height: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    messageRetryButton: {
      backgroundColor: aurora.surface,
      borderRadius: 8,
      paddingVertical: 4,
      paddingHorizontal: 6,
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    messageRetryText: {
      color: theme.colors.error,
      fontSize: 11,
      ...auroraFont('extrabold'),
    },
    attachmentList: {
      gap: spacing.xs,
    },
    imageAttachment: {
      width: 220,
      height: 160,
      borderRadius: borderRadius.lg,
      backgroundColor: aurora.surface2,
    },
    fileAttachment: {
      maxWidth: 240,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.md,
      backgroundColor: aurora.surface2,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    fileAttachmentText: {
      flex: 1,
      color: aurora.text,
      fontSize: fontSize.sm,
      ...auroraFont('bold'),
    },
    previewModal: {
      flex: 1,
      backgroundColor: aurora.ground,
    },
    previewHeader: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: aurora.border,
      paddingHorizontal: spacing.md,
    },
    previewHeaderButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: aurora.surface,
    },
    previewTitle: {
      flex: 1,
      color: aurora.text,
      fontSize: fontSize.base,
      ...auroraFont('extrabold'),
      textAlign: 'center',
    },
    previewBody: {
      flex: 1,
      backgroundColor: theme.isDark ? '#020617' : '#0f172a',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewPdf: {
      flex: 1,
      backgroundColor: aurora.surface,
    },
    newMessagesBar: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      paddingVertical: spacing.xs,
    },
    newMessagesButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: aurora.tones.blue.tone,
      paddingHorizontal: spacing.md,
    },
    newMessagesButtonText: {
      color: aurora.onTone,
      fontSize: fontSize.xs,
      ...auroraFont('extrabold'),
    },
    scheduleProposalCard: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: 12,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: 'rgba(45,212,191,0.34)',
      borderRadius: borderRadius.lg,
      backgroundColor: 'rgba(20,184,166,0.16)',
      padding: spacing.sm,
    },
    scheduleProposalIcon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: aurora.tones.blue.tone,
    },
    scheduleProposalContent: {
      flex: 1,
      minWidth: 0,
    },
    scheduleProposalTitle: {
      color: theme.colors.success,
      fontSize: fontSize.xs,
      ...auroraFont('extrabold'),
      textTransform: 'uppercase',
    },
    scheduleProposalText: {
      marginTop: 3,
      color: aurora.text,
      fontSize: fontSize.sm,
      ...auroraFont('extrabold'),
    },
    scheduleProposalButton: {
      minHeight: 38,
      minWidth: 92,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: aurora.tones.blue.tone,
      paddingHorizontal: spacing.md,
    },
    scheduleProposalButtonDisabled: {
      opacity: 0.64,
    },
    scheduleProposalButtonText: {
      color: aurora.onTone,
      fontSize: fontSize.xs,
      ...auroraFont('extrabold'),
    },
    replyComposer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: aurora.border,
      backgroundColor: aurora.glass,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    replyComposerContent: {
      flex: 1,
      minWidth: 0,
    },
    replyComposerTitle: {
      color: aurora.tones.blue.tone,
      fontSize: 10,
      ...auroraFont('extrabold'),
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    replyComposerText: {
      marginTop: 2,
      color: aurora.text,
      fontSize: fontSize.xs,
      ...auroraFont('bold'),
    },
    lockedNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    lockedNoticeText: {
      flex: 1,
      color: aurora.faint,
      fontSize: fontSize.xs,
      ...auroraFont('bold'),
    },
  });
};
