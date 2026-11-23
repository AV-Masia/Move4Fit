import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, Text } from 'react-native';

import { SUPPORT } from '@/src/config';
import { buildSummary } from '@/src/domain/summary';
import { useApp } from '@/src/state/AppState';
import { Button, Card, Col, Columns, H1, H2, Notice, P, Screen, colors, fs } from '@/src/ui/kit';

/** Связь с куратором. В MVP — через мессенджер или почту; сводку родитель отправляет сам. */
export default function Support() {
  const { child, assessment, sessions, trackingResults, goal, chat } = useApp();
  const messages = chat ?? [];
  const lastMessage = messages[messages.length - 1];
  const [showSummary, setShowSummary] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);

  const summary = child ? buildSummary(child, assessment, sessions, trackingResults, goal) : '';
  const text = encodeURIComponent(`Здравствуйте!\n\n${summary}\n`);
  const nothingConfigured = !SUPPORT.telegram && !SUPPORT.whatsapp && !SUPPORT.email;

  const share = async () => {
    try {
      setShareFailed(false);
      await Share.share({ message: summary });
    } catch {
      // В браузере на компьютере системного «Поделиться» может не быть — текст можно выделить и скопировать.
      setShareFailed(true);
    }
  };

  return (
    <Screen wide>
      <H1>Куратор</H1>
      <Columns>
        <Col>
      <P>Задайте вопрос о занятиях, самочувствии ребёнка или подборе упражнений.</P>
      <Notice>Если ребёнку стало плохо — звоните 103 или 112. Куратор не оказывает экстренную помощь.</Notice>
      <Card>
        <H2>Чат с куратором</H2>
        {lastMessage ? (
          <Text numberOfLines={2} style={{ fontSize: fs(16), lineHeight: fs(24), color: colors.muted }}>
            {lastMessage.from === 'parent' ? 'Вы: ' : 'Куратор: '}
            {lastMessage.text}
          </Text>
        ) : (
          <P muted>Переписка сохраняется: к ней можно вернуться в любой момент.</P>
        )}
        <Button title={lastMessage ? `Открыть чат (${messages.length})` : 'Написать куратору'} onPress={() => router.push('/chat')} />
      </Card>
      {nothingConfigured && (
        <Card>
          <P>Связь с куратором скоро заработает — мы подключаем контакты.</P>
          <P muted>Пока по вопросам о здоровье ребёнка обращайтесь к лечащему врачу.</P>
        </Card>
      )}
      {!!SUPPORT.telegram && (
        <Button title="Написать в Telegram" onPress={() => Linking.openURL(`https://t.me/${SUPPORT.telegram}?text=${text}`)} />
      )}
      {!!SUPPORT.whatsapp && (
        <Button title="Написать в WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT.whatsapp}?text=${text}`)} />
      )}
      {!!SUPPORT.email && (
        <Button
          title="Написать на почту"
          variant="secondary"
          onPress={() => Linking.openURL(`mailto:${SUPPORT.email}?subject=Move4Fit&body=${text}`)}
        />
      )}

        </Col>
        <Col>
      {!!SUPPORT.communityUrl && (
        <Card>
          <H2>Чат родителей</H2>
          <P muted>
            Здесь можно задать вопрос другим семьям и поделиться опытом. Чат ведёт модератор. Не публикуйте фамилию, адрес
            и медицинские документы ребёнка.
          </P>
          <Button title="Открыть чат родителей" variant="secondary" onPress={() => Linking.openURL(SUPPORT.communityUrl)} />
        </Card>
      )}

      <Card>
        <H2>Сводка за 30 дней</H2>
        <P muted>
          Короткий отчёт для куратора или врача. Приложение само ничего не отправляет: вы видите текст целиком и решаете,
          кому его показать.
        </P>
        {showSummary ? (
          <>
            <Text selectable style={{ fontSize: fs(15), lineHeight: fs(22), color: colors.text }}>
              {summary}
            </Text>
            <Button title="Поделиться" variant="secondary" onPress={share} />
            {shareFailed && <P muted>Здесь нет системной кнопки «Поделиться» — выделите текст выше и скопируйте его.</P>}
          </>
        ) : (
          <Button title="Показать сводку" variant="secondary" onPress={() => setShowSummary(true)} />
        )}
      </Card>
        </Col>
      </Columns>
    </Screen>
  );
}
