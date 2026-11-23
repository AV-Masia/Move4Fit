import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { MAX_MESSAGE_LENGTH, type ChatMessage } from '@/src/chat/source';
import { dayKey } from '@/src/domain/profile';
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

/** Пузырь со стороны куратора: его сообщения справа, родителя — слева. */
function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.from === 'curator';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        accessible
        accessibilityLabel={`${mine ? 'Куратор' : 'Родитель'}, ${time(message.date)}: ${message.text}`}
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
          {mine ? 'Куратор' : 'Родитель'} · {time(message.date)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Чат с семьёй из кабинета куратора.
 *
 * Пока без сервера: здесь видна переписка, сохранённая на этом же устройстве/в этом браузере.
 * Кросс-устройственный чат появится вместе с бэкендом; позже вместо него подключим WhatsApp/Telegram.
 */
export default function AdminChat() {
  const { child, chat, curatorReply } = useApp();
  const [draft, setDraft] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const messages = chat ?? [];

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const send = () => {
    if (!draft.trim()) return;
    curatorReply(draft);
    setDraft('');
  };
  const canSend = draft.trim().length > 0;
  const who = child?.name ? `семья · ${child.name}` : 'семья';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Notice>
            Пробный режим без сервера: здесь видна переписка с этого устройства. Кросс-устройственный чат появится с
            бэкендом; позже вместо него подключим WhatsApp или Telegram.
          </Notice>
          <Text style={{ fontSize: fs(13), fontWeight: '600', color: colors.muted }}>{who}</Text>
          {messages.length === 0 && <P muted>Сообщений от семьи пока нет.</P>}
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
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              accessibilityLabel="Ответ куратора"
              value={draft}
              onChangeText={setDraft}
              placeholder="Ответ куратора"
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
              accessibilityLabel="Отправить ответ"
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
