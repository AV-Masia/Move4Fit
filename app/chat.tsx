import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CHAT_CONNECTED, MAX_MESSAGE_LENGTH, type ChatMessage } from '@/src/chat/source';
import { dayKey } from '@/src/domain/profile';
import { buildSummary } from '@/src/domain/summary';
import { useApp } from '@/src/state/AppState';
import { Notice, P, colors, fs } from '@/src/ui/kit';

const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(d) === today) return 'Сегодня';
  if (dayKey(d) === dayKey(yesterday)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.from === 'parent';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        accessible
        accessibilityLabel={`${mine ? 'Вы' : 'Куратор'}, ${time(message.date)}: ${message.text}`}
        style={{
          maxWidth: '84%',
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 6 : 18,
          borderBottomLeftRadius: mine ? 18 : 6,
          backgroundColor: mine ? colors.primarySoft : colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 4,
        }}>
        <Text selectable style={{ fontSize: fs(16), lineHeight: fs(23), color: colors.text }}>
          {message.text}
        </Text>
        <Text style={{ fontSize: fs(12), color: colors.muted, alignSelf: 'flex-end' }}>
          {time(message.date)}
          {mine ? (message.delivered ? ' · доставлено' : CHAT_CONNECTED ? ' · отправляется' : ' · сохранено') : ''}
        </Text>
      </View>
    </View>
  );
}

/** Чат с куратором. Переписка сохраняется на устройстве вместе с остальными данными. */
export default function Chat() {
  const { child, assessment, sessions, trackingResults, goal, chat, sendMessage } = useApp();
  const [draft, setDraft] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const messages = chat ?? [];

  // Новое сообщение — прокручиваем к нему.
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const send = () => {
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft('');
  };
  const attachSummary = () => {
    if (child) sendMessage(`Сводка за 30 дней\n\n${buildSummary(child, assessment, sessions, trackingResults, goal)}`);
  };
  const canSend = draft.trim().length > 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {!CHAT_CONNECTED && (
            <Notice>
              Чат работает в пробном режиме: переписка сохраняется на этом устройстве, но куратору сообщения пока не
              доходят. Если ребёнку стало плохо — звоните 103 или 112.
            </Notice>
          )}
          {messages.length === 0 && (
            <P muted>
              Напишите вопрос о занятиях, самочувствии ребёнка или подборе упражнений. Кнопка «Приложить сводку» добавит
              в чат короткий отчёт за 30 дней.
            </P>
          )}
          {messages.map((m, i) => {
            const newDay = i === 0 || dayKey(new Date(messages[i - 1].date)) !== dayKey(new Date(m.date));
            return (
              <View key={m.id} style={{ gap: 10 }}>
                {newDay && (
                  <Text style={{ alignSelf: 'center', fontSize: fs(13), fontWeight: '600', color: colors.muted }}>{dayLabel(m.date)}</Text>
                )}
                <Bubble message={m} />
              </View>
            );
          })}
        </ScrollView>

        <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
          <Pressable accessibilityRole="button" onPress={attachSummary} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(14), fontWeight: '700', color: colors.primaryInk }}>＋ Приложить сводку за 30 дней</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              accessibilityLabel="Сообщение куратору"
              value={draft}
              onChangeText={setDraft}
              placeholder="Сообщение"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              style={{
                flex: 1,
                minHeight: 48,
                maxHeight: 140,
                borderWidth: 2,
                borderColor: colors.border,
                borderRadius: 18,
                paddingVertical: 11,
                paddingHorizontal: 14,
                fontSize: fs(16),
                color: colors.text,
                backgroundColor: colors.bg,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Отправить"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={send}
              style={({ pressed }) => ({
                width: 52,
                height: 48,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
                borderBottomWidth: pressed ? 2 : 4,
                borderBottomColor: colors.primaryEdge,
                opacity: canSend ? 1 : 0.45,
              })}>
              <Text style={{ fontSize: fs(22), fontWeight: '800', color: colors.primaryText }}>➤</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
