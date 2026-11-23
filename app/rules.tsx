import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useApp } from '@/src/state/AppState';
import { Button, Card, Checkbox, H1, Notice, P, Screen } from '@/src/ui/kit';

/**
 * ⚠️ ЧЕРНОВИК: формулировки правил должен проверить специалист (ЛФК / реабилитолог).
 * Общие принципы безопасных домашних занятий, своими словами.
 */
const RULES: { icon: string; text: string }[] = [
  { icon: '🤝', text: 'Взрослый всегда рядом и страхует ребёнка. Не оставляйте его одного во время упражнений.' },
  { icon: '✋', text: 'Если есть сомнения, ребёнку больно, он плачет или сильно устал — остановитесь.' },
  { icon: '🪜', text: 'Не переходите к более сложному варианту, пока простой не получается уверенно.' },
  { icon: '😊', text: 'Занятие должно нравиться ребёнку. Превращайте упражнения в игру и хвалите за старание.' },
  { icon: '👟', text: 'Удобная одежда, нескользкий пол или коврик, свободное место вокруг.' },
  { icon: '📅', text: 'Лучше понемногу, но регулярно: около трёх занятий в неделю, с днями отдыха между ними.' },
];

/** Правила занятий: показываются перед первым занятием, потом доступны из профиля. */
export default function Rules() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { rulesAcceptedAt, acceptRules } = useApp();
  const [agreed, setAgreed] = useState(false);
  const firstTime = !rulesAcceptedAt;

  return (
    <Screen>
      <H1>Правила занятий</H1>
      {firstTime && <P muted>Прочитайте перед первым занятием — это займёт минуту.</P>}
      <Card>
        {RULES.map((r) => (
          <P key={r.icon}>
            {r.icon}  {r.text}
          </P>
        ))}
      </Card>
      <Notice>
        Приложение не заменяет врача. Если ребёнку стало плохо — звоните 103 или 112.
      </Notice>
      {firstTime ? (
        <>
          <Checkbox label="Я прочитал(а) правила и буду им следовать" checked={agreed} onPress={() => setAgreed(!agreed)} />
          <Button
            title={next === 'workout' ? 'Начать занятие' : 'Готово'}
            disabled={!agreed}
            onPress={() => {
              acceptRules();
              if (next === 'workout') router.replace('/workout');
              else router.back();
            }}
          />
        </>
      ) : (
        <Button
          title={next === 'workout' ? 'Начать занятие' : 'Понятно'}
          onPress={() => {
            if (next === 'workout') router.replace('/workout');
            else if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
        />
      )}
    </Screen>
  );
}
