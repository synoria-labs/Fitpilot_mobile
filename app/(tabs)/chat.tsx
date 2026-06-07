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
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import { LoadingSpinner, TabScreenWrapper } from '../../src/components/common';
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
import { useAppTheme, useThemedStyles } from '../../src/theme';
import type { AssignedProfessionalSummary } from '../../src/types';
import type {
  ChatAttachment,
  ChatConversation,
  ChatDeliveryStatus,
  ChatMessage,
} from '../../src/types/chat';

const MAX_FILES_PER_MESSAGE = 4;
const MAX_AUDIO_SECONDS = 300;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const RECORDING_WAVE_BARS = [0.42, 0.76, 0.36, 0.92, 0.58, 1, 0.48, 0.84, 0.52, 0.88, 0.34, 0.72];
const CHAT_BACKGROUND_GRADIENT = ['#08111f', '#050b14', '#0d1624'] as const;

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

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getAudioDisplayName = (name?: string | null) => {
  const trimmedName = name?.trim();
  if (!trimmedName || /^nota-voz-\d+/i.test(trimmedName)) {
    return 'Nota de voz';
  }

  return trimmedName;
};

const getPendingFileDisplayName = (file: PendingChatFile) =>
  file.type.startsWith('audio/') ? 'Nota de voz' : file.name;

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

const AudioAttachmentPlayer = ({
  attachment,
  onDownload,
}: {
  attachment: ChatAttachment;
  onDownload: (attachment: ChatAttachment) => void;
}) => {
  const styles = useThemedStyles(createStyles);
  const { theme } = useAppTheme();
  const player = useAudioPlayer(attachment.url ? { uri: attachment.url } : null);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const durationLabel = attachment.duration_seconds
    ? formatDuration(attachment.duration_seconds * 1000)
    : null;

  return (
    <View style={styles.audioAttachment}>
      <TouchableOpacity
        style={styles.audioPlayback}
        activeOpacity={0.75}
        onPress={() => {
          if (!attachment.url) {
            return;
          }

          if (isPlaying) {
            player.pause();
          } else {
            player.play();
          }
        }}
      >
        <View style={styles.audioPlaybackIcon}>
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={12}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.audioAttachmentCopy}>
          <Text style={styles.audioAttachmentText} numberOfLines={1}>
            {getAudioDisplayName(attachment.file_name)}
          </Text>
          {durationLabel ? (
            <Text style={styles.audioAttachmentMeta}>{durationLabel}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => onDownload(attachment)}
        style={styles.attachmentDownloadButton}
      >
        <Ionicons name="download-outline" size={17} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );
};

const AttachmentPreview = ({
  attachment,
  onPreview,
  onDownload,
}: {
  attachment: ChatAttachment;
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
    return <AudioAttachmentPlayer attachment={attachment} onDownload={onDownload} />;
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
      <Ionicons name={icon} size={16} color={theme.colors.primary} />
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

const MessageBubble = ({
  message,
  isMine,
  senderLabel,
  onReply,
  onDelete,
  onReferencePress,
  onPreviewAttachment,
  onDownloadAttachment,
}: {
  message: ChatMessage;
  isMine: boolean;
  senderLabel: (senderId: number | null) => string;
  onReply: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onReferencePress: (messageId: number) => void;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onDownloadAttachment: (attachment: ChatAttachment) => void;
}) => {
  const styles = useThemedStyles(createStyles);
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
      onLongPress={showActions}
      style={[styles.messageRow, isMine ? styles.messageRowMine : null]}
    >
      <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : null]}>
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
          <Text style={[styles.messageBody, isMine ? styles.messageBodyMine : null]}>
            {message.body}
          </Text>
        ) : null}
        {!message.is_deleted && message.attachments.length ? (
          <View style={styles.attachmentList}>
            {message.attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                onPreview={onPreviewAttachment}
                onDownload={onDownloadAttachment}
              />
            ))}
          </View>
        ) : null}
        <View style={[styles.messageMeta, isMine ? styles.messageMetaMine : null]}>
          <Text style={[styles.messageTime, isMine ? styles.messageTimeMine : null]}>
            {formatMessageTime(message.created_at)}
          </Text>
          {isMine ? (
            <View
              accessibilityLabel={getDeliveryReceiptLabel(message.delivery_status)}
              accessibilityRole="image"
              accessible
              style={styles.messageReceipt}
            >
              <Ionicons
                name={message.delivery_status === 'SENT' ? 'checkmark' : 'checkmark-done'}
                size={15}
                color={
                  message.delivery_status === 'READ'
                    ? '#087f7a'
                    : 'rgba(8,17,31,0.52)'
                }
              />
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const ConversationAvatar = ({
  conversation,
  variant = 'list',
}: {
  conversation: ChatConversation;
  variant?: 'list' | 'thread';
}) => {
  const styles = useThemedStyles(createStyles);
  const displayName = buildDisplayName(conversation.participant);
  const imageUri = conversation.participant.profile_picture;

  return (
    <View style={[styles.avatar, variant === 'thread' ? styles.threadAvatar : null]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.avatarImage} />
      ) : (
        <Text style={[styles.avatarText, variant === 'thread' ? styles.threadAvatarText : null]}>
          {displayName.slice(0, 1)}
        </Text>
      )}
    </View>
  );
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const isFocused = useIsFocused();
  const { hideTabBar, showTabBar } = useBottomTabBarVisibility();
  const { user } = useAuthStore();
  const careTeam = useCareTeam(user?.id ?? null);
  const scrollRef = useRef<ScrollView | null>(null);
  const socketRef = useRef<Socket | null>(null);
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingChatFile[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
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
    setActiveConversationId(null);
    setHasAutoSelectedConversation(true);
  }, []);

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
      Alert.alert('Chat', 'No se pudo actualizar el chat.');
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
        Alert.alert('Limite de adjuntos', 'Puedes enviar hasta 4 archivos por mensaje.');
        return currentFiles;
      }

      const acceptedFiles = files
        .filter((file) => {
          if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
            Alert.alert('Archivo muy grande', `${file.name} supera el limite de 10 MB.`);
            return false;
          }

          return true;
        })
        .slice(0, availableSlots);

      if (acceptedFiles.length < files.length) {
        Alert.alert('Limite de adjuntos', 'Algunos archivos no se agregaron.');
      }

      return [...currentFiles, ...acceptedFiles];
    });
  }, []);

  const handlePickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos.');
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

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) {
      return;
    }

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

      if (uri) {
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
      Alert.alert('Audio', 'No se pudo guardar la nota de voz.');
    } finally {
      recordingStartedAtRef.current = null;
    }
  }, [appendPendingFiles, recorder, recorderState.durationMillis, recorderState.url]);

  const startRecording = useCallback(async () => {
    if (pendingFiles.length >= MAX_FILES_PER_MESSAGE) {
      Alert.alert('Limite de adjuntos', 'Elimina un archivo antes de grabar audio.');
      return;
    }

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso al microfono.');
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingStartedAtRef.current = Date.now();
      recordingTimerRef.current = setTimeout(() => {
        void stopRecording();
      }, MAX_AUDIO_SECONDS * 1000);
    } catch {
      Alert.alert('Audio', 'No se pudo iniciar la grabacion.');
      recordingStartedAtRef.current = null;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    }
  }, [pendingFiles.length, recorder, stopRecording]);

  const handleRecordPress = useCallback(() => {
    if (recorderState.isRecording) {
      void stopRecording();
    } else {
      void startRecording();
    }
  }, [recorderState.isRecording, startRecording, stopRecording]);

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
        Alert.alert(
          'Chat no disponible',
          'No se pudo abrir una conversacion con tu profesional.',
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
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) {
        Alert.alert('Chat', 'Ese mensaje no esta cargado en este historial.');
        return;
      }

      scrollRef.current?.scrollTo({
        y: Math.max(0, index * 96),
        animated: true,
      });
    },
    [messages],
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
              Alert.alert('Chat', 'No se pudo eliminar el mensaje.');
            }
          },
        },
      ]);
    },
    [activeConversationId, currentUserId, loadConversations],
  );

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!activeConversationId || (!body && pendingFiles.length === 0) || isSending) {
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
      await Promise.allSettled([
        markChatConversationRead(activeConversationId),
        loadConversations(),
      ]);
    } catch {
      Alert.alert('Mensaje no enviado', 'Intenta de nuevo en un momento.');
    } finally {
      setIsSending(false);
    }
  }, [
    activeConversationId,
    draft,
    isSending,
    loadConversations,
    pendingFiles,
    replyToMessage?.id,
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
              Alert.alert('Cita agendada', 'Tu cita quedo confirmada.');
            } catch {
              Alert.alert(
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
        Alert.alert('Chat', 'No se pudieron cargar tus conversaciones.');
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
        Alert.alert('Chat', 'No se pudieron cargar los mensajes.');
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

      socket.on('connect', () => {
        if (activeConversationId) {
          socket?.emit('conversation:join', { conversation_id: activeConversationId });
        }
      });

      socket.on('message:new', (message: ChatMessage) => {
        if (message.conversation_id === activeConversationId) {
          setMessages((currentMessages) => {
            if (currentMessages.some((item) => item.id === message.id)) {
              return currentMessages;
            }

            return [...currentMessages, message];
          });
          if (message.sender_id !== currentUserId) {
            void markChatConversationDelivered(message.conversation_id, message.id).catch(
              () => undefined,
            );
          }
          void markChatConversationRead(activeConversationId);
        }

        void loadConversations();
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
    if (messages.length) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages.length]);

  useEffect(() => {
    isRecordingRef.current = recorderState.isRecording;
  }, [recorderState.isRecording]);

  useEffect(
    () => () => {
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
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
            <Ionicons name="download-outline" size={22} color={theme.colors.primary} />
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
        <LinearGradient colors={CHAT_BACKGROUND_GRADIENT} style={styles.stage}>
          <StatusBar style="light" />
          <SafeAreaView style={styles.safeAreaTransparent} edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
              style={styles.threadShell}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.threadHeader}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={closeThread}
                  style={styles.threadIconButton}
                >
                  <Ionicons name="arrow-back" size={21} color="#f8fafc" />
                </TouchableOpacity>
                <ConversationAvatar conversation={activeConversation} variant="thread" />
                <View style={styles.threadTitleBlock}>
                  <Text numberOfLines={1} style={styles.threadTitle}>
                    {buildDisplayName(activeConversation.participant)}
                  </Text>
                  <Text numberOfLines={1} style={styles.threadSubtitle}>
                    {activeConversation.participant.email || 'Profesional FitPilot'}
                  </Text>
                </View>
                {isRefreshing ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : null}
              </View>

              <ScrollView
                ref={scrollRef}
                style={styles.messagesScroll}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
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
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  </View>
                ) : messages.length ? (
                  messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isMine={message.sender_id === currentUserId}
                      senderLabel={getSenderLabel}
                      onReply={setReplyToMessage}
                      onDelete={handleDeleteMessage}
                      onReferencePress={scrollToMessage}
                      onPreviewAttachment={setPreviewAttachment}
                      onDownloadAttachment={handleDownloadAttachment}
                    />
                  ))
                ) : (
                  <View style={styles.emptyThread}>
                    <Text style={styles.emptyTitle}>Nuevo chat</Text>
                    <Text style={styles.emptyCopy}>
                      Envia el primer mensaje cuando estes listo.
                    </Text>
                  </View>
                )}
              </ScrollView>

              {replyToMessage ? (
                <View style={styles.replyComposer}>
                  <Ionicons name="return-up-back" size={17} color={theme.colors.primary} />
                  <View style={styles.replyComposerContent}>
                    <Text style={styles.replyComposerTitle} numberOfLines={1}>
                      Respondiendo a {getSenderLabel(replyToMessage.sender_id)}
                    </Text>
                    <Text style={styles.replyComposerText} numberOfLines={1}>
                      {getReplyPreview(replyToMessage)}
                    </Text>
                  </View>
                  <TouchableOpacity hitSlop={8} onPress={() => setReplyToMessage(null)}>
                    <Ionicons name="close" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              ) : null}

              {pendingFiles.length ? (
                <ScrollView
                  horizontal
                  style={styles.pendingFilesScroller}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pendingFiles}
                >
                  {pendingFiles.map((file) => {
                    const isAudio = file.type.startsWith('audio/');

                    return (
                      <View
                        key={file.id}
                        style={[
                          styles.pendingFileChip,
                          isAudio ? styles.pendingAudioFileChip : null,
                        ]}
                      >
                        <View style={styles.pendingFileIcon}>
                          <Ionicons
                            name={
                              file.type.startsWith('image/')
                                ? 'image'
                                : isAudio
                                  ? 'mic-outline'
                                  : 'document-text'
                            }
                            size={isAudio ? 13 : 14}
                            color={theme.colors.primary}
                          />
                        </View>
                        <Text style={styles.pendingFileText} numberOfLines={1}>
                          {getPendingFileDisplayName(file)}
                        </Text>
                        {file.durationMillis ? (
                          <Text style={styles.pendingFileMeta}>
                            {formatDuration(file.durationMillis)}
                          </Text>
                        ) : null}
                        <TouchableOpacity
                          hitSlop={8}
                          style={styles.pendingFileRemoveButton}
                          onPress={() =>
                            setPendingFiles((currentFiles) =>
                              currentFiles.filter((item) => item.id !== file.id),
                            )
                          }
                        >
                          <Ionicons name="close" size={13} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : null}

              {canConfirmScheduleProposal && pendingProposalLabel ? (
                <View style={styles.scheduleProposalCard}>
                  <View style={styles.scheduleProposalIcon}>
                    <Ionicons name="calendar-outline" size={18} color="#08111f" />
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
                      <ActivityIndicator size="small" color="#08111f" />
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
                    El historial esta disponible, pero el envio esta cerrado.
                  </Text>
                </View>
              ) : null}

              {recorderState.isRecording ? (
                <View style={styles.recordingWaveCard}>
                  <View style={styles.recordingDot} />
                  <View style={styles.recordingWaveBars}>
                    {RECORDING_WAVE_BARS.map((bar, index) => {
                      const pulse = 0.62 + Math.sin(index + recordingDuration / 220) * 0.28;
                      const height = 8 + recordingLevel * 34 * Math.max(0.25, bar + pulse);
                      return (
                        <View
                          key={index}
                          style={[
                            styles.recordingWaveBar,
                            { height: Math.min(38, height) },
                          ]}
                        />
                      );
                    })}
                  </View>
                  <Text style={styles.recordingWaveTime}>
                    {formatDuration(recordingDuration)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.composer}>
                <TouchableOpacity
                  style={styles.iconButton}
                  activeOpacity={0.75}
                  disabled={isInputDisabled}
                  onPress={handlePickImage}
                >
                  <Ionicons
                    name="image-outline"
                    size={21}
                    color={isInputDisabled ? '#64748b' : '#f8fafc'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  activeOpacity={0.75}
                  disabled={isInputDisabled}
                  onPress={handlePickDocument}
                >
                  <Ionicons
                    name="attach"
                    size={21}
                    color={isInputDisabled ? '#64748b' : '#f8fafc'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.iconButton,
                    recorderState.isRecording ? styles.recordingButton : null,
                  ]}
                  activeOpacity={0.75}
                  disabled={isInputDisabled && !recorderState.isRecording}
                  onPress={handleRecordPress}
                >
                  <Ionicons
                    name={recorderState.isRecording ? 'stop' : 'mic-outline'}
                    size={21}
                    color={recorderState.isRecording ? '#08111f' : '#f8fafc'}
                  />
                </TouchableOpacity>
                <View style={styles.inputShell}>
                  <TextInput
                    value={recorderState.isRecording ? formatDuration(recordingDuration) : draft}
                    editable={!isInputDisabled && !recorderState.isRecording}
                    onChangeText={setDraft}
                    placeholder="Mensaje"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    multiline
                    maxLength={4000}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.sendButton, canSend ? styles.sendButtonEnabled : null]}
                  activeOpacity={0.75}
                  disabled={!canSend}
                  onPress={handleSend}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#08111f" />
                  ) : (
                    <Ionicons
                      name="send"
                      size={18}
                      color={canSend ? '#08111f' : '#64748b'}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </LinearGradient>
      </TabScreenWrapper>
    );
  }

  return (
    <TabScreenWrapper>
      {previewModal}
      <LinearGradient colors={CHAT_BACKGROUND_GRADIENT} style={styles.stage}>
        <StatusBar style="light" />
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
                <Text style={styles.brand}>FitPilot</Text>
                <Text style={styles.title}>Chat</Text>
              </View>
              <View style={styles.headerIcon}>
                <Ionicons
                  name="chatbubble-ellipses"
                  size={22}
                  color={theme.colors.primary}
                />
              </View>
            </View>

            {isLoadingConversations ? (
              <View style={styles.loadingState}>
                <LoadingSpinner text="Cargando chat..." />
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
                        <Ionicons name="person" size={20} color={theme.colors.primary} />
                      </View>
                      <View style={styles.conversationContent}>
                        <Text style={styles.conversationName} numberOfLines={1}>
                          {professional.name}
                        </Text>
                        <Text style={styles.conversationPreview} numberOfLines={1}>
                          {professional.roleLabel
                            ? `${professional.roleLabel} · Iniciar conversacion`
                            : 'Iniciar conversacion'}
                        </Text>
                      </View>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={18}
                        color="#94a3b8"
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
                <Ionicons name="chatbubbles-outline" size={34} color="#94a3b8" />
                <Text style={styles.emptyTitle}>Sin conversaciones</Text>
                <Text style={styles.emptyCopy}>
                  Abre un chat con tu profesional asignado.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </TabScreenWrapper>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    stage: {
      flex: 1,
    },
    safeAreaTransparent: {
      flex: 1,
    },
    threadShell: {
      flex: 1,
    },
    threadHeader: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.08)',
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
      color: '#f8fafc',
      fontSize: 17,
      fontWeight: '800',
    },
    threadSubtitle: {
      marginTop: 2,
      color: '#94a3b8',
      fontSize: 13,
      fontWeight: '600',
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
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: 2,
      color: '#f8fafc',
      fontSize: 30,
      fontWeight: '900',
    },
    headerIcon: {
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(96,165,250,0.26)',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(96,165,250,0.12)',
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
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.09)',
      borderRadius: borderRadius.lg,
      backgroundColor: 'rgba(255,255,255,0.055)',
      padding: 14,
    },
    avatar: {
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(96,165,250,0.32)',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(96,165,250,0.15)',
    },
    threadAvatar: {
      width: 48,
      height: 48,
      borderColor: 'rgba(255,255,255,0.18)',
      backgroundColor: 'rgba(96,165,250,0.18)',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      color: '#f8fafc',
      fontSize: fontSize.base,
      fontWeight: '900',
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
      color: '#f8fafc',
      fontSize: fontSize.base,
      fontWeight: '800',
    },
    conversationPreview: {
      marginTop: 4,
      color: '#94a3b8',
      fontSize: fontSize.sm,
      lineHeight: 18,
    },
    unreadBadge: {
      minWidth: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: spacing.xs,
    },
    unreadBadgeText: {
      color: '#08111f',
      fontSize: 11,
      fontWeight: '900',
    },
    messagesScroll: {
      flex: 1,
    },
    messagesContent: {
      flexGrow: 1,
      gap: 12,
      padding: spacing.md,
      paddingBottom: spacing.lg,
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
      borderColor: 'rgba(255,255,255,0.09)',
      borderRadius: borderRadius.lg,
      backgroundColor: 'rgba(255,255,255,0.045)',
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
      color: '#f8fafc',
      fontSize: fontSize.lg,
      fontWeight: '900',
      textAlign: 'center',
    },
    emptyCopy: {
      color: '#94a3b8',
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
      maxWidth: '84%',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 20,
      borderBottomLeftRadius: borderRadius.sm,
      backgroundColor: 'rgba(248,250,252,0.08)',
      padding: 12,
    },
    messageBubbleMine: {
      borderColor: 'rgba(255,255,255,0.24)',
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: borderRadius.sm,
      backgroundColor: theme.colors.primary,
    },
    messageBody: {
      color: '#f8fafc',
      fontSize: 15,
      lineHeight: 21,
    },
    messageBodyMine: {
      color: '#08111f',
    },
    messageDeleted: {
      color: '#94a3b8',
      fontSize: 15,
      fontStyle: 'italic',
      lineHeight: 21,
    },
    replyBlock: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(255,255,255,0.055)',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    replyBlockMine: {
      borderLeftColor: 'rgba(8,17,31,0.46)',
      backgroundColor: 'rgba(8,17,31,0.12)',
    },
    replyAuthor: {
      color: theme.colors.primary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    replyAuthorMine: {
      color: 'rgba(8,17,31,0.72)',
    },
    replyText: {
      marginTop: 2,
      color: '#e2e8f0',
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    replyTextMine: {
      color: '#08111f',
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
      color: '#94a3b8',
      fontSize: 11,
      fontWeight: '800',
    },
    messageTimeMine: {
      color: 'rgba(8,17,31,0.6)',
    },
    messageReceipt: {
      width: 17,
      height: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachmentList: {
      gap: spacing.xs,
    },
    imageAttachment: {
      width: 220,
      height: 160,
      borderRadius: borderRadius.lg,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    fileAttachment: {
      maxWidth: 240,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(255,255,255,0.08)',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    fileAttachmentText: {
      flex: 1,
      color: '#f8fafc',
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    audioAttachment: {
      maxWidth: 210,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(96,165,250,0.2)',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(15,23,42,0.28)',
      paddingHorizontal: 6,
      paddingVertical: 5,
    },
    audioPlayback: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    audioPlaybackIcon: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(96,165,250,0.16)',
    },
    audioAttachmentCopy: {
      flex: 1,
      minWidth: 0,
    },
    audioAttachmentText: {
      color: '#f8fafc',
      fontSize: 12,
      fontWeight: '800',
    },
    audioAttachmentMeta: {
      marginTop: 1,
      color: '#94a3b8',
      fontSize: 10,
      fontWeight: '800',
    },
    attachmentDownloadButton: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(96,165,250,0.14)',
    },
    previewModal: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    previewHeader: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      paddingHorizontal: spacing.md,
    },
    previewHeaderButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
    },
    previewTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
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
      backgroundColor: theme.colors.surface,
    },
    pendingFilesScroller: {
      height: 46,
      flexGrow: 0,
    },
    pendingFiles: {
      minHeight: 46,
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
    },
    pendingFileChip: {
      maxWidth: 190,
      height: 30,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(148,163,184,0.2)',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(15,23,42,0.58)',
      paddingLeft: 5,
      paddingRight: 7,
    },
    pendingAudioFileChip: {
      maxWidth: 160,
      borderColor: 'rgba(96,165,250,0.24)',
      backgroundColor: 'rgba(96,165,250,0.12)',
    },
    pendingFileIcon: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(96,165,250,0.12)',
    },
    pendingFileText: {
      minWidth: 0,
      flexShrink: 1,
      color: '#f8fafc',
      fontSize: 11,
      fontWeight: '800',
    },
    pendingFileMeta: {
      color: '#93c5fd',
      fontSize: 10,
      fontWeight: '900',
    },
    pendingFileRemoveButton: {
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
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
      backgroundColor: theme.colors.primary,
    },
    scheduleProposalContent: {
      flex: 1,
      minWidth: 0,
    },
    scheduleProposalTitle: {
      color: '#ccfbf1',
      fontSize: fontSize.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    scheduleProposalText: {
      marginTop: 3,
      color: '#f8fafc',
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
    scheduleProposalButton: {
      minHeight: 38,
      minWidth: 92,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: spacing.md,
    },
    scheduleProposalButtonDisabled: {
      opacity: 0.64,
    },
    scheduleProposalButtonText: {
      color: '#08111f',
      fontSize: fontSize.xs,
      fontWeight: '900',
    },
    replyComposer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.08)',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    replyComposerContent: {
      flex: 1,
      minWidth: 0,
    },
    replyComposerTitle: {
      color: theme.colors.primary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    replyComposerText: {
      marginTop: 2,
      color: '#f8fafc',
      fontSize: fontSize.xs,
      fontWeight: '700',
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
      color: '#94a3b8',
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    recordingWaveCard: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: 12,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: 'rgba(96,165,250,0.24)',
      borderRadius: borderRadius.xl,
      backgroundColor: 'rgba(96,165,250,0.13)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    recordingDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.error,
    },
    recordingWaveBars: {
      minHeight: 40,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    recordingWaveBar: {
      width: 5,
      borderRadius: 99,
      backgroundColor: theme.colors.primary,
    },
    recordingWaveTime: {
      minWidth: 44,
      color: theme.colors.primary,
      fontSize: fontSize.sm,
      fontWeight: '900',
      textAlign: 'right',
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.08)',
      padding: 12,
    },
    iconButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.055)',
    },
    recordingButton: {
      borderColor: 'rgba(248,113,113,0.48)',
      backgroundColor: theme.colors.error,
    },
    inputShell: {
      flex: 1,
      minHeight: 42,
      maxHeight: 112,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 21,
      backgroundColor: 'rgba(255,255,255,0.055)',
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'ios' ? 10 : 0,
    },
    input: {
      minHeight: 38,
      maxHeight: 96,
      color: '#f8fafc',
      fontSize: fontSize.base,
      padding: 0,
      textAlignVertical: 'center',
    },
    sendButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.055)',
    },
    sendButtonEnabled: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
  });
