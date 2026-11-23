import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { assess } from '@/src/domain/functionalLevel';
import { GMFCS_OPTIONS, MOTOR_ITEMS, SAFETY_QUESTIONS, availableOptions, walkMotorItems } from '@/src/domain/questionnaire';
import type { FunctionalLevel, SafetyAnswer } from '@/src/domain/types';
import { useApp } from '@/src/state/AppState';
import { Button, Card, Choice, H1, P, Screen } from '@/src/ui/kit';

const GMFCS_STEP = 'gmfcs';

/**
 * Вопросы о ребёнке, по одному на экран: тест движений из 5 пунктов → уровень GMFCS со слов врача
 * (необязательно) → ограничения и противопоказания.
 */
export default function Questionnaire() {
  const { child, saveAssessment } = useApp();
  const [motor, setMotor] = useState<Record<string, string>>({});
  // undefined — ещё не отвечали; null — врач уровень не называл или родитель не помнит.
  const [gmfcs, setGmfcs] = useState<FunctionalLevel | null | undefined>(undefined);
  const [safety, setSafety] = useState<Record<string, SafetyAnswer>>({});
  // Шаги в порядке ответов — чтобы «Назад» отменял именно последний ответ.
  const [history, setHistory] = useState<string[]>([]);

  if (!child) return null;

  // Пункты теста, которые нужно задать при уже данных ответах, и возможности, которые из них следуют.
  const { visible, capabilities } = walkMotorItems(motor);
  const motorItem = visible.find((item) => motor[item.id] === undefined);
  const safetyQuestion = SAFETY_QUESTIONS.find((q) => safety[q.id] === undefined);
  const done = !motorItem && gmfcs !== undefined && !safetyQuestion;

  const back = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    if (last === GMFCS_STEP) setGmfcs(undefined);
    else if (MOTOR_ITEMS.some((item) => item.id === last)) setMotor(({ [last]: _removed, ...rest }) => rest);
    else setSafety(({ [last]: _removed, ...rest }) => rest);
  };
  const backButton = history.length > 0 && <Button title="Назад" variant="secondary" onPress={back} />;

  if (done) {
    return (
      <Screen>
        <H1>Готово!</H1>
        <P>Спасибо. На основе ответов подберём занятия для {child.name}.</P>
        <Button
          title="Посмотреть результат"
          onPress={() => {
            saveAssessment(assess(child, { motor, safety }, gmfcs ?? undefined));
            router.replace('/child/result');
          }}
        />
        <Button title="Изменить последний ответ" variant="secondary" onPress={back} />
      </Screen>
    );
  }

  if (motorItem) {
    const pick = (optionId: string) => {
      setMotor((m) => ({ ...m, [motorItem.id]: optionId }));
      setHistory((h) => [...h, motorItem.id]);
    };
    return (
      <Screen>
        <P muted>
          Что умеет ребёнок · пункт {MOTOR_ITEMS.indexOf(motorItem) + 1} из {MOTOR_ITEMS.length}
        </P>
        <Card>
          <H1>{motorItem.text}</H1>
        </Card>
        <P muted>Выберите самое сложное, что ребёнок обычно делает сам, — не в лучший день.</P>
        <View style={{ gap: 10 }}>
          {availableOptions(motorItem, new Set(capabilities)).map((o) => (
            <Choice key={o.id} label={o.label} selected={false} onPress={() => pick(o.id)} />
          ))}
          {backButton}
        </View>
      </Screen>
    );
  }

  if (gmfcs === undefined) {
    const pick = (level: FunctionalLevel | null) => {
      setGmfcs(level);
      setHistory((h) => [...h, GMFCS_STEP]);
    };
    return (
      <Screen>
        <P muted>Уровень от врача · необязательно</P>
        <Card>
          <H1>Врач называл уровень по шкале GMFCS?</H1>
        </Card>
        <P muted>
          Обычно его пишут в выписке: «GMFCS» и цифра от I до V. Это не группа инвалидности. Если врач не называл уровень
          или вы не помните — так и отметьте.
        </P>
        <View style={{ gap: 10 }}>
          <Choice label="Не называл или не помню" selected={false} onPress={() => pick(null)} />
          {GMFCS_OPTIONS.map((o) => (
            <Choice key={o.level} label={o.label} selected={false} onPress={() => pick(o.level)} />
          ))}
          {backButton}
        </View>
      </Screen>
    );
  }

  if (!safetyQuestion) return null;
  const answer = (value: SafetyAnswer) => {
    setSafety((s) => ({ ...s, [safetyQuestion.id]: value }));
    setHistory((h) => [...h, safetyQuestion.id]);
  };
  return (
    <Screen>
      <P muted>
        Запреты и особенности здоровья · вопрос {SAFETY_QUESTIONS.indexOf(safetyQuestion) + 1} из {SAFETY_QUESTIONS.length}
      </P>
      <Card>
        <H1>{safetyQuestion.text}</H1>
      </Card>
      <View style={{ gap: 12 }}>
        <Button title="Да" onPress={() => answer('yes')} />
        <Button title="Нет" variant="secondary" onPress={() => answer('no')} />
        {safetyQuestion.allowUnknown && (
          <Button title="Не знаю, с врачом не обсуждали" variant="secondary" onPress={() => answer('unknown')} />
        )}
        {backButton}
      </View>
      {safetyQuestion.allowUnknown && (
        <P muted>Если не знаете, мы на всякий случай не будем предлагать такие упражнения, пока вы не уточните у врача.</P>
      )}
    </Screen>
  );
}
